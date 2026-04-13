use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use beaker_macros::{circuit_breaker, rate_limit};
use serde::Deserialize;

use crate::middleware::auth::AuthedUser;
use crate::services::InviteService;

#[derive(Deserialize)]
pub struct AcceptInviteRequest {
    pub token: String,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/invites")
            .route("/{token}", web::get().to(get_invite_details))
            .route("/accept", web::post().to(accept_invite)),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_invite_details(
    service: web::Data<InviteService>,
    token: web::Path<String>,
) -> impl Responder {
    match service.verify_token(&token.into_inner()).await {
        Ok((account_id, org_name, email)) => HttpResponse::Ok().json(serde_json::json!({
            "account_id": account_id,
            "org_name": org_name,
            "email": email
        })),
        Err(err) => HttpResponse::NotFound().json(serde_json::json!({ "error": err.to_string() })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn accept_invite(
    service: web::Data<InviteService>,
    payload: web::Json<AcceptInviteRequest>,
    req: HttpRequest,
) -> impl Responder {
    let Some(user) = req.extensions().get::<AuthedUser>().cloned() else {
        return HttpResponse::Unauthorized().finish();
    };

    match service.accept_invite(&payload.token, user.user_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "accepted" })),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}
