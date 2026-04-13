use actix_web::{web, HttpRequest, HttpResponse};
use beaker_macros::{circuit_breaker, rate_limit};
use serde_json::Value;
use uuid::Uuid;

use crate::models::integrations::{
    AccountIntegration, AccountIntegrationRow, UpsertIntegrationRequest,
};
use crate::services::NotificationService;
use crate::utils::*;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/integrations")
            .route("", web::get().to(list_integrations))
            .route("/{integration_type}", web::put().to(upsert_integration))
            .route("/{integration_type}", web::delete().to(delete_integration))
            .route("/jira/test", web::post().to(test_jira)),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_integrations(pool: web::Data<sqlx::PgPool>, http: HttpRequest) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    let rows = sqlx::query_as::<_, AccountIntegrationRow>(
        "SELECT id, account_id, integration_type, enabled, config::text AS config, \
         created_at, updated_at \
         FROM account_integrations WHERE account_id = $1 ORDER BY integration_type",
    )
    .bind(user.account_id)
    .fetch_all(pool.get_ref())
    .await;

    match rows {
        Ok(rows) => {
            let integrations: Vec<AccountIntegration> = rows
                .into_iter()
                .map(|r| {
                    let config: Value =
                        serde_json::from_str(&r.config).unwrap_or(serde_json::json!({}));
                    let config = redact_config(&r.integration_type, config);
                    AccountIntegration {
                        id: r.id,
                        account_id: r.account_id,
                        integration_type: r.integration_type,
                        enabled: r.enabled,
                        config,
                        created_at: r.created_at,
                        updated_at: r.updated_at,
                    }
                })
                .collect();
            HttpResponse::Ok().json(integrations)
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn upsert_integration(
    pool: web::Data<sqlx::PgPool>,
    integration_type: web::Path<String>,
    req: web::Json<UpsertIntegrationRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    let integration_type = integration_type.into_inner();
    if !matches!(integration_type.as_str(), "slack" | "jira") {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Unsupported integration type. Must be 'slack' or 'jira'."
        }));
    }

    let enabled = req.enabled.unwrap_or(true);
    let config_json = &req.config;

    let id = Uuid::new_v4();
    let result = sqlx::query_as::<_, AccountIntegrationRow>(
        "INSERT INTO account_integrations \
         (id, account_id, integration_type, enabled, config) \
         VALUES ($1, $2, $3, $4, $5) \
         ON CONFLICT (account_id, integration_type) DO UPDATE SET \
           enabled = EXCLUDED.enabled, \
           config  = EXCLUDED.config, \
           updated_at = now() \
         RETURNING id, account_id, integration_type, enabled, config::text AS config, \
                   created_at, updated_at",
    )
    .bind(id)
    .bind(user.account_id)
    .bind(&integration_type)
    .bind(enabled)
    .bind(config_json)
    .fetch_one(pool.get_ref())
    .await;

    match result {
        Ok(row) => {
            let config: Value = serde_json::from_str(&row.config).unwrap_or(serde_json::json!({}));
            let config = redact_config(&row.integration_type, config);
            let integration = AccountIntegration {
                id: row.id,
                account_id: row.account_id,
                integration_type: row.integration_type,
                enabled: row.enabled,
                config,
                created_at: row.created_at,
                updated_at: row.updated_at,
            };
            HttpResponse::Ok().json(integration)
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn delete_integration(
    pool: web::Data<sqlx::PgPool>,
    integration_type: web::Path<String>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    let result = sqlx::query(
        "DELETE FROM account_integrations \
         WHERE account_id = $1 AND integration_type = $2",
    )
    .bind(user.account_id)
    .bind(integration_type.as_str())
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn test_jira(
    notification_service: web::Data<NotificationService>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    match notification_service
        .test_jira_connection(user.account_id)
        .await
    {
        Ok(display_name) => HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "display_name": display_name
        })),
        Err(e) => HttpResponse::Ok().json(serde_json::json!({
            "ok": false,
            "display_name": e.to_string()
        })),
    }
}

/// Redact sensitive fields before returning to the client.
fn redact_config(integration_type: &str, mut config: Value) -> Value {
    match integration_type {
        "slack" => {
            if let Some(url) = config.get("webhook_url").and_then(|v| v.as_str()) {
                let redacted = if url.len() > 8 {
                    format!("...{}", &url[url.len() - 8..])
                } else {
                    "...".to_string()
                };
                if let Some(obj) = config.as_object_mut() {
                    obj.insert("webhook_url".to_string(), Value::String(redacted));
                }
            }
        }
        "jira" => {
            if let Some(obj) = config.as_object_mut() {
                obj.insert("api_token".to_string(), Value::String(String::new()));
            }
        }
        _ => {}
    }
    config
}
