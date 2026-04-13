use crate::middleware::auth::AuthedUser;
use crate::models::IngestEventRequest;
use crate::services::event_service::EventService;
use actix_web::HttpMessage;
use actix_web::{web, HttpResponse};
use beaker_macros::{circuit_breaker, rate_limit};
use log::error;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/events").route("", web::post().to(ingest_event)));
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn ingest_event(
    event_service: web::Data<EventService>,
    req: web::Json<IngestEventRequest>,
    http: actix_web::HttpRequest,
) -> impl Responder {
    let Some(user) = http.extensions().get::<AuthedUser>().cloned() else {
        return HttpResponse::Unauthorized().finish();
    };

    match event_service
        .ingest_event(req.into_inner(), user.account_id)
        .await
    {
        Ok(event) => HttpResponse::Ok().json(event),
        Err(e) => {
            error!("Failed to ingest event: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to ingest event: {}", e)
            }))
        }
    }
}
