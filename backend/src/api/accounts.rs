use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use beaker_macros::{circuit_breaker, rate_limit};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

use crate::middleware::auth::AuthedUser;
use crate::services::InviteService;

#[derive(Serialize)]
struct AccountResponse {
    id: Uuid,
    name: String,
    created_at: chrono::DateTime<chrono::Utc>,
    role: String,
}

#[derive(Deserialize)]
struct CreateAccountRequest {
    name: String,
}

#[derive(Deserialize)]
struct CreateInviteRequest {
    email: String,
    role: String,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/accounts")
            .route("", web::get().to(list_accounts))
            .route("", web::post().to(create_account))
            .route("/{id}/invites", web::post().to(create_invite)),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_accounts(pool: web::Data<PgPool>, req: HttpRequest) -> HttpResponse {
    let authed = match req.extensions().get::<AuthedUser>().cloned() {
        Some(user) => user,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "Missing auth context"
            }))
        }
    };

    let rows = sqlx::query(
        r#"
        SELECT a.id, a.name, a.created_at, m.role
        FROM accounts a
        JOIN account_memberships m ON m.account_id = a.id
        WHERE m.user_id = $1
        ORDER BY a.created_at
        "#,
    )
    .bind(authed.user_id)
    .fetch_all(pool.get_ref())
    .await;

    match rows {
        Ok(data) => {
            let resp: Vec<AccountResponse> = data
                .into_iter()
                .map(|row| AccountResponse {
                    id: row.get::<Uuid, _>("id"),
                    name: row.get::<String, _>("name"),
                    created_at: row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                    role: row.get::<String, _>("role"),
                })
                .collect();
            HttpResponse::Ok().json(resp)
        }
        Err(err) => HttpResponse::InternalServerError()
            .json(serde_json::json!({ "error": err.to_string() })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn create_account(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    payload: web::Json<CreateAccountRequest>,
) -> HttpResponse {
    let authed = match req.extensions().get::<AuthedUser>().cloned() {
        Some(user) => user,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "Missing auth context"
            }))
        }
    };

    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(err) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({ "error": err.to_string() }))
        }
    };

    let account_id = Uuid::new_v4();
    if let Err(err) = sqlx::query("INSERT INTO accounts (id, name) VALUES ($1, $2)")
        .bind(account_id)
        .bind(&payload.name)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({ "error": err.to_string() }));
    }

    if let Err(err) = sqlx::query(
        "INSERT INTO account_memberships (account_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(account_id)
    .bind(authed.user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({ "error": err.to_string() }));
    }

    if let Err(err) = tx.commit().await {
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({ "error": err.to_string() }));
    }

    HttpResponse::Created().json(serde_json::json!({ "id": account_id }))
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn create_invite(
    service: web::Data<InviteService>,
    id: web::Path<Uuid>,
    payload: web::Json<CreateInviteRequest>,
    req: HttpRequest,
) -> HttpResponse {
    let Some(user) = req.extensions().get::<AuthedUser>().cloned() else {
        return HttpResponse::Unauthorized().finish();
    };

    let account_id = id.into_inner();

    match service
        .create_invite(account_id, &payload.email, &payload.role, user.user_id)
        .await
    {
        Ok(token) => HttpResponse::Created().json(serde_json::json!({ "token": token })),
        Err(err) => {
            HttpResponse::BadRequest().json(serde_json::json!({ "error": err.to_string() }))
        }
    }
}
