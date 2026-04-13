use actix_web::{web, HttpResponse};
use beaker_macros::{circuit_breaker, rate_limit};
use uuid::Uuid;

use crate::config::Config;
use crate::models::{
    DisableTotpRequest, EnableTotpRequest, ForgotPasswordRequest, LoginRequest, RegisterRequest,
    ResetPasswordRequest, VerifyOtpRequest, VerifyTotpRequest,
};
use crate::services::AuthService;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth")
            .route("/register", web::post().to(register))
            .route("/login", web::post().to(login))
            .route("/verify-otp", web::post().to(verify_otp))
            .route("/totp/setup", web::post().to(setup_totp))
            .route("/totp/verify", web::post().to(verify_totp))
            .route("/totp/disable", web::post().to(disable_totp))
            .route("/me/{id}", web::get().to(me))
            .route("/forgot-password", web::post().to(forgot_password))
            .route("/reset-password", web::post().to(reset_password)),
    );
}

#[rate_limit(group = "auth-strict")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn register(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<RegisterRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service
        .register(
            &payload.email,
            &payload.password,
            payload.invite_token.as_deref(),
        )
        .await
    {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-strict")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn login(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<LoginRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    let remember_me = payload.remember_me.unwrap_or(false);
    match service
        .login(&payload.email, &payload.password, remember_me)
        .await
    {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn verify_otp(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<VerifyOtpRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    let remember_me = payload.remember_me.unwrap_or(false);
    match service
        .verify_otp(
            &payload.email,
            &payload.code,
            payload.totp_code.as_deref(),
            remember_me,
        )
        .await
    {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn setup_totp(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<EnableTotpRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service.enable_totp(payload.user_id).await {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn verify_totp(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<VerifyTotpRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service.verify_totp(payload.user_id, &payload.code).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn disable_totp(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    payload: web::Json<DisableTotpRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service.disable_totp(payload.user_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-loose")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn me(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    id: web::Path<Uuid>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service.me(id.into_inner()).await {
        Ok(user) => HttpResponse::Ok().json(user),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}

#[rate_limit(group = "auth-strict")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn forgot_password(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    body: web::Json<ForgotPasswordRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    let _ = service.forgot_password(&body.email).await;
    HttpResponse::Ok().json(serde_json::json!({
        "message": "If that email exists, a reset link was sent."
    }))
}

#[rate_limit(group = "auth-strict")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn reset_password(
    pool: web::Data<sqlx::PgPool>,
    config: web::Data<Config>,
    body: web::Json<ResetPasswordRequest>,
) -> impl Responder {
    let service = AuthService::new(pool.get_ref().clone(), config.get_ref().clone());
    match service
        .reset_password(&body.token, &body.new_password)
        .await
    {
        Ok(_) => HttpResponse::Ok()
            .json(serde_json::json!({ "message": "Password reset successfully." })),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}
