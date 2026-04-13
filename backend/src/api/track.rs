use crate::models::{
    EndSessionRequest, ListSessionsResponse, StartSessionRequest, TrackEventRequest,
    TrackReplayRequest,
};
use crate::services::{SdkTokenService, TrackingService};
use crate::utils::authed;
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use log::error;
use uuid::Uuid;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/track")
            .app_data(web::JsonConfig::default().limit(10 * 1024 * 1024))
            .route("/session/start", web::post().to(start_session))
            .route("/session/end", web::post().to(end_session))
            .route("/event", web::post().to(track_event))
            .route("/replay", web::post().to(track_replay))
            .route("/replay/{session_id}", web::get().to(get_replay))
            .route("/sessions", web::get().to(list_sessions))
            .route("/events", web::get().to(list_events))
            .route("/events/all", web::get().to(list_account_events)),
    );
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn start_session(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    payload: web::Json<StartSessionRequest>,
) -> impl Responder {
    let account_id = match verify_tracking_key(&http_req, &pool).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    match tracking_service
        .start_session(account_id, payload.into_inner())
        .await
    {
        Ok(session) => HttpResponse::Ok().json(session),
        Err(e) => {
            error!("Failed to start session: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to start session: {}", e)
            }))
        }
    }
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn end_session(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    payload: web::Json<EndSessionRequest>,
) -> impl Responder {
    let account_id = match verify_tracking_key(&http_req, &pool).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    match tracking_service
        .end_session(account_id, payload.into_inner())
        .await
    {
        Ok(session) => HttpResponse::Ok().json(session),
        Err(e) => {
            error!("Failed to end session: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to end session: {}", e)
            }))
        }
    }
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn track_event(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    payload: web::Json<TrackEventRequest>,
) -> impl Responder {
    if let Err(response) = verify_tracking_key(&http_req, &pool).await {
        return response;
    }
    match tracking_service.track_event(payload.into_inner()).await {
        Ok(event) => HttpResponse::Ok().json(event),
        Err(e) => {
            error!("Failed to track event: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to track event: {}", e)
            }))
        }
    }
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn track_replay(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    payload: web::Json<TrackReplayRequest>,
) -> impl Responder {
    if let Err(response) = verify_tracking_key(&http_req, &pool).await {
        return response;
    }
    match tracking_service.track_replay(payload.into_inner()).await {
        Ok(offset) => HttpResponse::Ok().json(serde_json::json!({ "sequence_start": offset })),
        Err(e) => {
            error!("Failed to track replay: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to track replay: {}", e)
            }))
        }
    }
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_replay(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    path: web::Path<String>,
    query: web::Query<ReplayQuery>,
) -> impl Responder {
    let Some(user) = authed(&http_req) else {
        return HttpResponse::Unauthorized().finish();
    };
    match verify_tracking_key(&http_req, &pool).await {
        Ok(id) if id == user.account_id => {}
        _ => return HttpResponse::Unauthorized().finish(),
    }
    let limit = query.limit.unwrap_or(1200);
    let offset = query.offset.unwrap_or(0);
    match tracking_service
        .get_replay_events(&path, limit, offset)
        .await
    {
        Ok(events) => HttpResponse::Ok().json(events),
        Err(e) => {
            error!("Failed to fetch replay: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to fetch replay: {}", e)
            }))
        }
    }
}

#[derive(serde::Deserialize)]
struct SessionQuery {
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(serde::Deserialize)]
struct ReplayQuery {
    limit: Option<usize>,
    offset: Option<usize>,
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_sessions(
    tracking_service: web::Data<TrackingService>,
    http_req: HttpRequest,
    query: web::Query<SessionQuery>,
) -> impl Responder {
    let Some(user) = authed(&http_req) else {
        error!("Unable to authenticate!");
        return HttpResponse::Unauthorized().finish();
    };
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    match tracking_service
        .list_sessions(user.account_id, limit, offset)
        .await
    {
        Ok((sessions, total)) => HttpResponse::Ok().json(ListSessionsResponse {
            sessions,
            total,
            limit,
            offset,
        }),
        Err(e) => {
            error!("Failed to list sessions: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list sessions: {}", e)
            }))
        }
    }
}

#[derive(serde::Deserialize)]
struct EventsQuery {
    session_id: String,
    event_type: Option<String>,
    limit: Option<usize>,
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_events(
    tracking_service: web::Data<TrackingService>,
    pool: web::Data<sqlx::PgPool>,
    http_req: HttpRequest,
    query: web::Query<EventsQuery>,
) -> impl Responder {
    let Some(user) = authed(&http_req) else {
        error!("No user found in request");
        return HttpResponse::Unauthorized().finish();
    };
    match verify_tracking_key(&http_req, &pool).await {
        Ok(id) if id == user.account_id => {}
        _ => return HttpResponse::Unauthorized().finish(),
    }
    let limit = query.limit.unwrap_or(200);
    match tracking_service
        .list_activity_events(&query.session_id, query.event_type.as_deref(), limit)
        .await
    {
        Ok(events) => HttpResponse::Ok().json(events),
        Err(e) => {
            error!("Failed to list events: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list events: {}", e)
            }))
        }
    }
}

#[derive(serde::Deserialize)]
struct AccountEventsQuery {
    event_type: Option<String>,
    event_name: Option<String>,
    days_back: Option<u32>,
    limit: Option<usize>,
    offset: Option<usize>,
    experiment_id: Option<String>,
}

#[rate_limit(group = "tracking")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_account_events(
    tracking_service: web::Data<TrackingService>,
    http_req: HttpRequest,
    query: web::Query<AccountEventsQuery>,
) -> impl Responder {
    let Some(user) = authed(&http_req) else {
        error!("Unable to authenticate!");
        return HttpResponse::Unauthorized().finish();
    };
    let days_back = query.days_back.unwrap_or(30);
    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);
    match tracking_service
        .list_account_activity_events(
            user.account_id,
            query.event_type.as_deref(),
            query.event_name.as_deref(),
            days_back,
            limit,
            offset,
            query.experiment_id.as_deref(),
        )
        .await
    {
        Ok((events, total)) => {
            HttpResponse::Ok().json(serde_json::json!({ "events": events, "total": total }))
        }
        Err(e) => {
            error!("Failed to list account events: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list account events: {}", e)
            }))
        }
    }
}

async fn verify_tracking_key(req: &HttpRequest, pool: &sqlx::PgPool) -> Result<Uuid, HttpResponse> {
    let header_key = req
        .headers()
        .get("x-beaker-key")
        .and_then(|value| value.to_str().ok());

    let bearer_key = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .or_else(|| {
            req.headers()
                .get("Authorization")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        });

    let provided = header_key.or(bearer_key);
    let Some(token) = provided else {
        return Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Missing SDK tracking key"
        })));
    };

    let service = SdkTokenService::new(pool.clone());
    match service.get_account_id_by_token(token).await {
        Ok(id) => Ok(id),
        Err(_) => Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid SDK tracking key"
        }))),
    }
}
