use actix_web::{web, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::config::Config;
use crate::middleware::auth::AuthedUser;
use crate::models::ai::{DraftHypothesisRequest, DraftOnePagerRequest, SuggestMetricsRequest};
use crate::services::{AnalyticsService, ExperimentService};
use crate::services::ai_service::AiService;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub model: String,
    pub message: ChatMessage,
    pub usage: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct LiteLLMChatResponse {
    model: String,
    choices: Vec<LiteLLMChoice>,
}

#[derive(Debug, Deserialize)]
struct LiteLLMChoice {
    message: ChatMessage,
}

#[derive(Debug, Serialize)]
pub struct ModelListResponse {
    pub models: Vec<String>,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/ai")
            .route("/chat", web::post().to(chat))
            .route("/chat/stream", web::post().to(chat_stream))
            .route("/models", web::get().to(models))
            // AI Strategist endpoints
            .route("/suggest-experiments", web::post().to(suggest_experiments))
            .route("/draft-hypothesis", web::post().to(draft_hypothesis))
            .route("/draft-1pager", web::post().to(draft_one_pager))
            .route("/suggest-metrics", web::post().to(suggest_metrics))
            .route("/summarize-experiment/{id}", web::post().to(summarize_experiment))
            // AI Insights endpoints
            .route("/insights", web::get().to(list_insights))
            .route("/insights/summary", web::get().to(insights_summary))
            .route("/insights/{id}/dismiss", web::post().to(dismiss_insight)),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn models(config: web::Data<Config>) -> impl Responder {
    let Some(base_url) = config.ai_base_url.clone() else {
        return HttpResponse::Ok().json(ModelListResponse {
            models: config.ai_models.clone(),
        });
    };

    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let mut request = client.get(&url);
    if let Some(api_key) = config.ai_api_key.as_ref() {
        request = request.bearer_auth(api_key);
    }

    // If AI_MODELS is configured, use it as the authoritative allowlist — no provider call needed.
    if !config.ai_models.is_empty() {
        return HttpResponse::Ok().json(ModelListResponse {
            models: config.ai_models.clone(),
        });
    }

    let response = request.send().await;
    match response {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(data) = json.get("data").and_then(|value| value.as_array()) {
                    let models = data
                        .iter()
                        .filter_map(|item| item.get("id").and_then(|id| id.as_str()))
                        .map(|value| value.to_string())
                        .collect::<Vec<String>>();
                    return HttpResponse::Ok().json(ModelListResponse { models });
                }
            }
            HttpResponse::Ok().json(ModelListResponse { models: vec![] })
        }
        Err(_) => HttpResponse::Ok().json(ModelListResponse { models: vec![] }),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn chat(config: web::Data<Config>, payload: web::Json<ChatRequest>) -> impl Responder {
    let Some(base_url) = config.ai_base_url.clone() else {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "AI_BASE_URL is not configured"
        }));
    };

    let default_model = config
        .ai_default_model
        .clone()
        .unwrap_or_else(|| "llama-3.3-70b-versatile".to_string());

    let requested_model = payload
        .model
        .clone()
        .unwrap_or_else(|| default_model.clone());
    let model = if config.ai_models.is_empty() {
        requested_model
    } else if config.ai_models.contains(&requested_model) {
        requested_model
    } else {
        default_model.clone()
    };

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let mut request = client.post(&url);
    if let Some(api_key) = config.ai_api_key.as_ref() {
        request = request.bearer_auth(api_key);
    }

    let temperature = payload.temperature.unwrap_or(0.4);
    let max_tokens = payload.max_tokens.unwrap_or(512);

    let body = serde_json::json!({
        "model": model,
        "messages": payload.messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    });

    match request.json(&body).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(result) => {
                let model = result
                    .get("model")
                    .and_then(|value| value.as_str())
                    .unwrap_or(&default_model)
                    .to_string();
                let message = result
                    .get("choices")
                    .and_then(|choices| choices.as_array())
                    .and_then(|choices| choices.first())
                    .and_then(|choice| choice.get("message"))
                    .and_then(|message| {
                        serde_json::from_value::<ChatMessage>(message.clone()).ok()
                    });

                if let Some(message) = message {
                    if let Some(usage) = result.get("usage") {
                        log::info!("AI usage: {}", usage);
                    }
                    return HttpResponse::Ok().json(ChatResponse {
                        model,
                        message,
                        usage: result.get("usage").cloned(),
                    });
                }

                HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "No choices returned from model"
                }))
            }
            Err(err) => HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to parse response: {}", err)
            })),
        },
        Err(err) => HttpResponse::BadGateway().json(serde_json::json!({
            "error": format!("Failed to reach AI service: {}", err)
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn chat_stream(config: web::Data<Config>, payload: web::Json<ChatRequest>) -> impl Responder {
    let Some(base_url) = config.ai_base_url.clone() else {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "AI_BASE_URL is not configured"
        }));
    };

    let default_model = config
        .ai_default_model
        .clone()
        .unwrap_or_else(|| "llama-3.3-70b-versatile".to_string());

    let requested_model = payload
        .model
        .clone()
        .unwrap_or_else(|| default_model.clone());
    let model = if config.ai_models.is_empty() {
        requested_model
    } else if config.ai_models.contains(&requested_model) {
        requested_model
    } else {
        default_model.clone()
    };

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let mut request = client.post(&url);
    if let Some(api_key) = config.ai_api_key.as_ref() {
        request = request.bearer_auth(api_key);
    }

    let temperature = payload.temperature.unwrap_or(0.4);
    let max_tokens = payload.max_tokens.unwrap_or(512);

    let body = serde_json::json!({
        "model": model,
        "messages": payload.messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": true,
    });

    let response = match request.json(&body).send().await {
        Ok(resp) => resp,
        Err(err) => {
            return HttpResponse::BadGateway().json(serde_json::json!({
                "error": format!("Failed to reach AI service: {}", err)
            }))
        }
    };

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return HttpResponse::BadGateway().json(serde_json::json!({
            "error": format!("AI service error {}: {}", status, text)
        }));
    }

    let stream = response.bytes_stream().map(|chunk| match chunk {
        Ok(bytes) => Ok::<web::Bytes, actix_web::Error>(web::Bytes::from(bytes)),
        Err(err) => Ok::<web::Bytes, actix_web::Error>(web::Bytes::from(format!(
            "data: {{\"error\":\"{}\"}}\n\n",
            err
        ))),
    });

    HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(stream)
}

// ── AI Strategist ──────────────────────────────────────────────────────────────

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn suggest_experiments(
    config: web::Data<Config>,
    pg: web::Data<PgPool>,
    experiment_service: web::Data<ExperimentService>,
    analytics_service: web::Data<AnalyticsService>,
    user: web::ReqData<AuthedUser>,
) -> impl Responder {
    let ai = AiService::new(pg.get_ref().clone(), config.get_ref().clone());
    match ai
        .suggest_experiments(&experiment_service, &analytics_service, user.account_id)
        .await
    {
        Ok(suggestions) => HttpResponse::Ok().json(suggestions),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn draft_hypothesis(
    config: web::Data<Config>,
    pg: web::Data<PgPool>,
    payload: web::Json<DraftHypothesisRequest>,
) -> impl Responder {
    let ai = AiService::new(pg.get_ref().clone(), config.get_ref().clone());
    match ai.draft_hypothesis(payload.into_inner()).await {
        Ok(draft) => HttpResponse::Ok().json(draft),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn draft_one_pager(
    config: web::Data<Config>,
    pg: web::Data<PgPool>,
    experiment_service: web::Data<ExperimentService>,
    user: web::ReqData<AuthedUser>,
    payload: web::Json<DraftOnePagerRequest>,
) -> impl Responder {
    let ai = AiService::new(pg.get_ref().clone(), config.get_ref().clone());
    match ai
        .draft_one_pager(
            &experiment_service,
            user.account_id,
            payload.experiment_id,
        )
        .await
    {
        Ok(draft) => HttpResponse::Ok().json(draft),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn suggest_metrics(
    config: web::Data<Config>,
    pg: web::Data<PgPool>,
    payload: web::Json<SuggestMetricsRequest>,
) -> impl Responder {
    let ai = AiService::new(pg.get_ref().clone(), config.get_ref().clone());
    match ai.suggest_metrics(&payload.experiment_description).await {
        Ok(suggestions) => HttpResponse::Ok().json(suggestions),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn summarize_experiment(
    config: web::Data<Config>,
    pg: web::Data<PgPool>,
    experiment_service: web::Data<ExperimentService>,
    user: web::ReqData<AuthedUser>,
    path: web::Path<Uuid>,
) -> impl Responder {
    let ai = AiService::new(pg.get_ref().clone(), config.get_ref().clone());
    let experiment_id = path.into_inner();
    match ai
        .summarize_experiment(&experiment_service, user.account_id, experiment_id)
        .await
    {
        Ok(summary) => HttpResponse::Ok().json(summary),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

// ── AI Insights ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct InsightsQuery {
    experiment_id: Option<Uuid>,
    severity: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_insights(
    pg: web::Data<PgPool>,
    user: web::ReqData<AuthedUser>,
    query: web::Query<InsightsQuery>,
) -> impl Responder {
    let limit = query.limit.unwrap_or(50).min(200);
    let offset = query.offset.unwrap_or(0);

    let rows = if let Some(exp_id) = query.experiment_id {
        sqlx::query_as::<_, InsightRow>(
            r#"
            SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                   headline, detail, ai_narrative, p_value, effect_size, sample_size,
                   auto_actioned, dismissed_at, created_at
            FROM ai_polling_insights
            WHERE account_id = $1 AND experiment_id = $2 AND dismissed_at IS NULL
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(user.account_id)
        .bind(exp_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pg.get_ref())
        .await
    } else if let Some(sev) = &query.severity {
        sqlx::query_as::<_, InsightRow>(
            r#"
            SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                   headline, detail, ai_narrative, p_value, effect_size, sample_size,
                   auto_actioned, dismissed_at, created_at
            FROM ai_polling_insights
            WHERE account_id = $1 AND severity = $2 AND dismissed_at IS NULL
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(user.account_id)
        .bind(sev)
        .bind(limit)
        .bind(offset)
        .fetch_all(pg.get_ref())
        .await
    } else {
        sqlx::query_as::<_, InsightRow>(
            r#"
            SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                   headline, detail, ai_narrative, p_value, effect_size, sample_size,
                   auto_actioned, dismissed_at, created_at
            FROM ai_polling_insights
            WHERE account_id = $1 AND dismissed_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user.account_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pg.get_ref())
        .await
    };

    match rows {
        Ok(insights) => {
            let total = insights.len() as i64;
            HttpResponse::Ok().json(serde_json::json!({
                "insights": insights,
                "total": total
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn insights_summary(
    pg: web::Data<PgPool>,
    user: web::ReqData<AuthedUser>,
) -> impl Responder {
    let result = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE severity = 'info') AS info_count,
            COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
            COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
            COUNT(*) AS total
        FROM ai_polling_insights
        WHERE account_id = $1 AND dismissed_at IS NULL
        "#,
    )
    .bind(user.account_id)
    .fetch_one(pg.get_ref())
    .await;

    match result {
        Ok(row) => {
            use sqlx::Row;
            HttpResponse::Ok().json(serde_json::json!({
                "info": row.get::<i64, _>("info_count"),
                "warning": row.get::<i64, _>("warning_count"),
                "critical": row.get::<i64, _>("critical_count"),
                "total": row.get::<i64, _>("total")
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn dismiss_insight(
    pg: web::Data<PgPool>,
    user: web::ReqData<AuthedUser>,
    path: web::Path<Uuid>,
) -> impl Responder {
    let insight_id = path.into_inner();
    let result = sqlx::query(
        "UPDATE ai_polling_insights SET dismissed_at = $1 WHERE id = $2 AND account_id = $3",
    )
    .bind(Utc::now())
    .bind(insight_id)
    .bind(user.account_id)
    .execute(pg.get_ref())
    .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

// Row mapping for sqlx
#[derive(Debug, sqlx::FromRow, Serialize)]
struct InsightRow {
    id: Uuid,
    account_id: Uuid,
    experiment_id: Uuid,
    polled_at: chrono::DateTime<Utc>,
    severity: String,
    insight_type: String,
    headline: String,
    detail: String,
    ai_narrative: Option<String>,
    p_value: Option<f64>,
    effect_size: Option<f64>,
    sample_size: Option<i64>,
    auto_actioned: bool,
    dismissed_at: Option<chrono::DateTime<Utc>>,
    created_at: chrono::DateTime<Utc>,
}
