use actix_web::{web, HttpMessage, HttpRequest, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use uuid::Uuid;

use crate::middleware::auth::AuthedUser;
use crate::models::*;
use crate::services::TelemetryService;

/// Returns a scope to be nested inside `/experiments/{experiment_id}`.
pub fn scope() -> actix_web::Scope {
    web::scope("/telemetry")
        .route("", web::get().to(list_events))
        .route("", web::post().to(create_event))
        .route("/bulk", web::post().to(bulk_create_events))
        .route("/{event_id}", web::put().to(update_event))
        .route("/{event_id}", web::delete().to(delete_event))
}

/// Top-level scope mounted at `/telemetry` (no experiment filter).
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/telemetry").route("", web::get().to(list_all)));
}

fn authed(req: &HttpRequest) -> Option<AuthedUser> {
    req.extensions().get::<AuthedUser>().cloned()
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_all(service: web::Data<TelemetryService>, http: HttpRequest) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.list_all_events(user.account_id).await {
        Ok(events) => HttpResponse::Ok().json(events),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_events(
    service: web::Data<TelemetryService>,
    experiment_id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .list_events_for_experiment(user.account_id, experiment_id.into_inner())
        .await
    {
        Ok(events) => HttpResponse::Ok().json(events),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn create_event(
    service: web::Data<TelemetryService>,
    experiment_id: web::Path<Uuid>,
    req: web::Json<CreateTelemetryEventRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .create_event(
            req.into_inner(),
            user.account_id,
            experiment_id.into_inner(),
        )
        .await
    {
        Ok(event) => HttpResponse::Created().json(event),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn update_event(
    service: web::Data<TelemetryService>,
    path: web::Path<(Uuid, Uuid)>,
    req: web::Json<UpdateTelemetryEventRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    let (experiment_id, event_id) = path.into_inner();
    match service
        .update_event(event_id, user.account_id, experiment_id, req.into_inner())
        .await
    {
        Ok(event) => HttpResponse::Ok().json(event),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn bulk_create_events(
    service: web::Data<TelemetryService>,
    experiment_id: web::Path<Uuid>,
    req: web::Json<BulkCreateTelemetryEventRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .bulk_create_events(
            req.into_inner(),
            user.account_id,
            experiment_id.into_inner(),
        )
        .await
    {
        Ok(events) => HttpResponse::Created().json(events),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn delete_event(
    service: web::Data<TelemetryService>,
    path: web::Path<(Uuid, Uuid)>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    let (experiment_id, event_id) = path.into_inner();
    match service
        .delete_event(event_id, user.account_id, experiment_id)
        .await
    {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}
