use actix_web::{web, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};

use crate::config::Config;
use crate::services::OAuthService;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth/oauth")
            .route("/google", web::get().to(google_initiate))
            .route("/google/callback", web::get().to(google_callback)),
    );
}

#[derive(serde::Deserialize)]
struct GoogleInitiateQuery {
    remember_me: Option<bool>,
}

#[derive(serde::Deserialize)]
struct GoogleCallbackQuery {
    code: String,
    state: String,
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn google_initiate(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    query: web::Query<GoogleInitiateQuery>,
) -> impl Responder {
    let service = OAuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    let remember_me = query.remember_me.unwrap_or(false);
    match service.build_authorization_url(remember_me).await {
        Ok(url) => HttpResponse::Found()
            .insert_header(("Location", url))
            .finish(),
        Err(err) => HttpResponse::InternalServerError()
            .json(serde_json::json!({ "error": err.to_string() })),
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn google_callback(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    query: web::Query<GoogleCallbackQuery>,
) -> impl Responder {
    let service = OAuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    let frontend_base = config.frontend_base_url.clone();
    match service.exchange_code(&query.code, &query.state).await {
        Ok(auth) => {
            let redirect = format!(
                "{}/auth/callback?token={}&user_id={}",
                frontend_base, auth.token, auth.user_id
            );
            HttpResponse::Found()
                .insert_header(("Location", redirect))
                .finish()
        }
        Err(err) => {
            let msg = urlencoded_message(&err.to_string());
            let redirect = format!("{}/login?error={}", frontend_base, msg);
            HttpResponse::Found()
                .insert_header(("Location", redirect))
                .finish()
        }
    }
}

fn urlencoded_message(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => '+'.to_string(),
            c if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') => c.to_string(),
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}
