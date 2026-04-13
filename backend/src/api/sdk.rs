use actix_web::{web, HttpRequest, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::config::Config;
use crate::models::TelemetryDefinition;
use crate::models::{EvaluateFeatureGateRequest, FeatureFlagStatus, FeatureGateStatus};
use crate::services::{FeatureFlagService, FeatureGateService, SdkTokenService, TelemetryService};
use crate::utils::authed;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/sdk")
            .route("/tokens", web::get().to(tokens))
            .route("/tokens/rotate", web::post().to(rotate_tokens))
            .route("/evaluate/flags", web::post().to(evaluate_flags))
            .route("/evaluate/gate/{gate_id}", web::post().to(evaluate_gate))
            .route("/telemetry", web::get().to(get_telemetry)),
    );
}

#[rate_limit(group = "sdk")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn tokens(
    pool: web::Data<sqlx::PgPool>,
    _config: web::Data<Config>,
    http: HttpRequest,
) -> impl Responder {
    let service = SdkTokenService::new(pool.get_ref().clone());
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.ensure_tokens(user.account_id, None, None).await {
        Ok(tokens) => HttpResponse::Ok().json(SdkTokensResponse {
            tracking_api_key: Some(tokens.tracking_api_key),
            feature_flags_api_key: Some(tokens.feature_flags_api_key),
        }),
        Err(err) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": err.to_string()
        })),
    }
}

#[rate_limit(group = "sdk")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn rotate_tokens(
    pool: web::Data<sqlx::PgPool>,
    payload: web::Json<RotateTokensRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    let service = SdkTokenService::new(pool.get_ref().clone());
    let kind = payload.kind.to_lowercase();
    let result = match kind.as_str() {
        "tracking" => service.rotate_tracking(user.account_id).await,
        "feature_flags" => service.rotate_feature_flags(user.account_id).await,
        "all" => service.rotate_all(user.account_id).await,
        _ => Err(anyhow::anyhow!("Invalid rotation kind")),
    };

    match result {
        Ok(tokens) => HttpResponse::Ok().json(SdkTokensResponse {
            tracking_api_key: Some(tokens.tracking_api_key),
            feature_flags_api_key: Some(tokens.feature_flags_api_key),
        }),
        Err(err) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": err.to_string()
        })),
    }
}

#[derive(Debug, Deserialize)]
struct EvaluateFlagsRequest {
    pub user_id: Option<String>,
    pub attributes: Option<Value>,
    pub flags: Option<Vec<String>>,
    pub environment: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RotateTokensRequest {
    pub kind: String,
}

#[derive(Debug, Serialize)]
struct SdkFlagEvaluation {
    pub name: String,
    pub enabled: bool,
    pub gate_id: Option<Uuid>,
    pub reason: String,
}

#[derive(Debug, Serialize)]
struct SdkTokensResponse {
    pub tracking_api_key: Option<String>,
    pub feature_flags_api_key: Option<String>,
}

#[derive(Debug, Serialize)]
struct SdkFlagsResponse {
    pub flags: Vec<SdkFlagEvaluation>,
}

#[derive(Debug, Serialize)]
struct SdkErrorResponse {
    pub error: String,
}

#[rate_limit(group = "sdk")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
pub async fn evaluate_flags(
    _req: HttpRequest,
    _config: web::Data<Config>,
    token_service: web::Data<SdkTokenService>,
    flag_service: web::Data<FeatureFlagService>,
    gate_service: web::Data<FeatureGateService>,
    body: web::Json<EvaluateFlagsRequest>,
) -> impl Responder {
    let auth_header = match _req.headers().get("Authorization") {
        Some(h) => h.to_str().unwrap_or(""),
        None => {
            return HttpResponse::Unauthorized().json(SdkErrorResponse {
                error: "Missing API key".into(),
            })
        }
    };

    let api_key = auth_header.trim_start_matches("Bearer ").trim();
    let account_id = match token_service.get_account_id_by_token(api_key).await {
        Ok(id) => id,
        Err(_) => {
            return HttpResponse::Unauthorized().json(SdkErrorResponse {
                error: "Invalid API key".into(),
            })
        }
    };

    let _user_id = body
        .user_id
        .clone()
        .unwrap_or_else(|| "anonymous".to_string());
    let attributes = body
        .attributes
        .clone()
        .unwrap_or_else(|| serde_json::json!({}));
    let requested_flags = body.flags.clone();
    let _requested_env = body
        .environment
        .clone()
        .unwrap_or_else(|| "production".to_string());

    let flags = match flag_service.list_flags(account_id).await {
        Ok(f) => f,
        Err(e) => {
            return HttpResponse::InternalServerError().json(SdkErrorResponse {
                error: e.to_string(),
            })
        }
    };

    let mut evaluations = Vec::new();

    for flag in flags {
        if let Some(ref requested) = requested_flags {
            if !requested.contains(&flag.name) {
                continue;
            }
        }

        if !matches!(flag.status, FeatureFlagStatus::Active) {
            evaluations.push(SdkFlagEvaluation {
                name: flag.name.clone(),
                enabled: false,
                gate_id: None,
                reason: "Flag inactive".into(),
            });
            continue;
        }

        let gates = match gate_service.list_gates(account_id, Some(flag.id)).await {
            Ok(g) => g,
            Err(_) => Vec::new(),
        };

        let mut matched_gate = None;
        let mut is_enabled = false;

        for gate in gates {
            if !matches!(gate.status, FeatureGateStatus::Active) {
                continue;
            }

            let eval_req = EvaluateFeatureGateRequest {
                attributes: Some(attributes.clone()),
            };

            if let Ok(eval) = gate_service
                .evaluate_gate(account_id, gate.id, eval_req)
                .await
            {
                if eval.pass {
                    is_enabled = true;
                    matched_gate = Some(gate.id);
                    break;
                }
            }
        }

        evaluations.push(SdkFlagEvaluation {
            name: flag.name,
            enabled: is_enabled,
            gate_id: matched_gate,
            reason: if is_enabled {
                "Gate passed".into()
            } else {
                "No gate passed".into()
            },
        });
    }

    HttpResponse::Ok().json(SdkFlagsResponse { flags: evaluations })
}

#[derive(Deserialize)]
struct TelemetryQuery {
    experiment_id: Uuid,
}

#[derive(Serialize)]
struct SdkTelemetryResponse {
    definitions: Vec<TelemetryDefinition>,
}

#[rate_limit(group = "sdk")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_telemetry(
    req: HttpRequest,
    token_service: web::Data<SdkTokenService>,
    telemetry_service: web::Data<TelemetryService>,
    query: web::Query<TelemetryQuery>,
) -> impl Responder {
    let api_key = if let Some(v) = req.headers().get("x-beaker-key") {
        v.to_str().unwrap_or("").to_string()
    } else if let Some(v) = req.headers().get("Authorization") {
        v.to_str()
            .unwrap_or("")
            .trim_start_matches("Bearer ")
            .trim()
            .to_string()
    } else {
        return HttpResponse::Unauthorized().json(SdkErrorResponse {
            error: "Missing API key".into(),
        });
    };

    if api_key.is_empty() {
        return HttpResponse::Unauthorized().json(SdkErrorResponse {
            error: "Missing API key".into(),
        });
    }

    let account_id = match token_service.get_account_id_by_token(&api_key).await {
        Ok(id) => id,
        Err(_) => {
            return HttpResponse::Unauthorized().json(SdkErrorResponse {
                error: "Invalid API key".into(),
            })
        }
    };

    match telemetry_service
        .list_active_definitions_for_sdk(account_id, query.experiment_id)
        .await
    {
        Ok(definitions) => HttpResponse::Ok().json(SdkTelemetryResponse { definitions }),
        Err(e) => HttpResponse::InternalServerError().json(SdkErrorResponse {
            error: e.to_string(),
        }),
    }
}

#[rate_limit(group = "sdk")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
pub async fn evaluate_gate(
    _req: HttpRequest,
    _config: web::Data<Config>,
    token_service: web::Data<SdkTokenService>,
    gate_service: web::Data<FeatureGateService>,
    path: web::Path<Uuid>,
    body: web::Json<EvaluateFeatureGateRequest>,
) -> impl Responder {
    let gate_id = path.into_inner();
    let auth_header = match _req.headers().get("Authorization") {
        Some(h) => h.to_str().unwrap_or(""),
        None => {
            return HttpResponse::Unauthorized().json(SdkErrorResponse {
                error: "Missing API key".into(),
            })
        }
    };

    let api_key = auth_header.trim_start_matches("Bearer ").trim();
    let account_id = match token_service.get_account_id_by_token(api_key).await {
        Ok(id) => id,
        Err(_) => {
            return HttpResponse::Unauthorized().json(SdkErrorResponse {
                error: "Invalid API key".into(),
            })
        }
    };

    match gate_service
        .evaluate_gate(account_id, gate_id, body.into_inner())
        .await
    {
        Ok(eval) => HttpResponse::Ok().json(eval),
        Err(e) => HttpResponse::InternalServerError().json(SdkErrorResponse {
            error: e.to_string(),
        }),
    }
}
