use actix_web::{web, HttpMessage, HttpRequest, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use uuid::Uuid;

use crate::middleware::auth::AuthedUser;
use crate::models::*;
use crate::services::FeatureFlagService;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/feature-flags")
            .route("", web::post().to(create_flag))
            .route("", web::get().to(list_flags))
            .route("/{id}", web::get().to(get_flag))
            .route("/{id}", web::put().to(update_flag))
            .route("/{id}", web::delete().to(delete_flag)),
    );
}

fn authed(req: &HttpRequest) -> Option<AuthedUser> {
    req.extensions().get::<AuthedUser>().cloned()
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn create_flag(
    service: web::Data<FeatureFlagService>,
    req: web::Json<CreateFeatureFlagRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.create_flag(req.into_inner(), user.account_id).await {
        Ok(flag) => HttpResponse::Created().json(flag),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_flags(service: web::Data<FeatureFlagService>, http: HttpRequest) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.list_flags(user.account_id).await {
        Ok(flags) => HttpResponse::Ok().json(flags),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_flag(
    service: web::Data<FeatureFlagService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.get_flag(id.into_inner(), user.account_id).await {
        Ok(flag) => HttpResponse::Ok().json(flag),
        Err(e) => HttpResponse::NotFound().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn update_flag(
    service: web::Data<FeatureFlagService>,
    id: web::Path<Uuid>,
    req: web::Json<UpdateFeatureFlagRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .update_flag(id.into_inner(), user.account_id, req.into_inner())
        .await
    {
        Ok(flag) => HttpResponse::Ok().json(flag),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn delete_flag(
    service: web::Data<FeatureFlagService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.delete_flag(id.into_inner(), user.account_id).await {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}
