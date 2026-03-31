use actix_web::body::EitherBody;
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::HttpMessage;
use actix_web::{Error, HttpResponse};
use futures_util::future::{ok, LocalBoxFuture, Ready};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use sqlx::{PgPool, Row};
use std::rc::Rc;
use uuid::Uuid;

use crate::config::Config;

#[derive(Clone, Debug)]
pub struct AuthedUser {
    pub user_id: Uuid,
    pub account_id: Uuid,
    pub role: String,
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    token_id: String,
    exp: usize,
}

pub struct AuthMiddleware {
    pool: PgPool,
    config: Config,
}

impl AuthMiddleware {
    pub fn new(pool: PgPool, config: Config) -> Self {
        Self { pool, config }
    }
}

impl<S, B> Transform<S, ServiceRequest> for AuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(AuthMiddlewareService {
            service: Rc::new(service),
            pool: self.pool.clone(),
            config: self.config.clone(),
        })
    }
}

pub struct AuthMiddlewareService<S> {
    service: Rc<S>,
    pool: PgPool,
    config: Config,
}

impl<S, B> Service<ServiceRequest> for AuthMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(
        &self,
        ctx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(ctx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let pool = self.pool.clone();
        let config = self.config.clone();

        Box::pin(async move {
            if req.method() == actix_web::http::Method::OPTIONS {
                return service.call(req).await.map(|res| res.map_into_left_body());
            }

            let path = req.path().to_string();
            if path == "/health"
                || path.starts_with("/api/auth")
                || path.starts_with("/api/invites")
                || path == "/api/track/session/start"
                || path == "/api/track/session/end"
                || path == "/api/track/event"
                || (path == "/api/track/replay" && req.method() == actix_web::http::Method::POST)
                || path.starts_with("/api/sdk/feature-flags")
            {
                return service.call(req).await.map(|res| res.map_into_left_body());
            }

            // MCP-Api-Key auth path — resolves account_id from config
            if path.starts_with("/api/mcp") {
                let mcp_key = req
                    .headers()
                    .get("MCP-Api-Key")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");

                let configured_key = config.mcp_api_key.as_deref().unwrap_or("");
                if !configured_key.is_empty() && mcp_key == configured_key {
                    let account_id = config
                        .mcp_account_id
                        .as_deref()
                        .and_then(|s| Uuid::parse_str(s).ok())
                        .unwrap_or_else(Uuid::nil);

                    // Look up any admin user for this account
                    let membership = sqlx::query(
                        "SELECT user_id, role FROM account_memberships WHERE account_id = $1 ORDER BY created_at ASC LIMIT 1",
                    )
                    .bind(account_id)
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None);

                    let (user_id, role) = match membership {
                        Some(rec) => (rec.get::<Uuid, _>("user_id"), rec.get::<String, _>("role")),
                        None => (Uuid::nil(), "admin".to_string()),
                    };

                    req.extensions_mut().insert(AuthedUser {
                        user_id,
                        account_id,
                        role,
                    });
                    return service.call(req).await.map(|res| res.map_into_left_body());
                }
                // Fall through to normal JWT auth if key doesn't match
            }

            let auth_header = req
                .headers()
                .get("Authorization")
                .and_then(|value| value.to_str().ok())
                .unwrap_or("");
            let token = auth_header.strip_prefix("Bearer ").unwrap_or("");

            if token.is_empty() {
                return Ok(req.into_response(
                    HttpResponse::Unauthorized()
                        .json(serde_json::json!({
                            "error": "Missing Authorization token"
                        }))
                        .map_into_right_body(),
                ));
            }

            let decoded = decode::<Claims>(
                token,
                &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
                &Validation::new(Algorithm::HS256),
            );

            let claims = match decoded {
                Ok(data) => data.claims,
                Err(_) => {
                    return Ok(req.into_response(
                        HttpResponse::Unauthorized()
                            .json(serde_json::json!({
                                "error": "Invalid token"
                            }))
                            .map_into_right_body(),
                    ))
                }
            };

            let user_id = Uuid::parse_str(&claims.sub).ok();
            let token_id = Uuid::parse_str(&claims.token_id).ok();
            if user_id.is_none() || token_id.is_none() {
                return Ok(req.into_response(
                    HttpResponse::Unauthorized()
                        .json(serde_json::json!({
                            "error": "Invalid token payload"
                        }))
                        .map_into_right_body(),
                ));
            }

            let session_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND token_id = $2 AND expires_at > NOW()",
            )
            .bind(user_id.unwrap())
            .bind(token_id.unwrap())
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

            if session_exists == 0 {
                return Ok(req.into_response(
                    HttpResponse::Unauthorized()
                        .json(serde_json::json!({
                            "error": "Session expired"
                        }))
                        .map_into_right_body(),
                ));
            }

            // Allow account listing/creation without prior account header (still requires auth)
            let requires_account = !path.starts_with("/api/accounts");
            let mut authed_user: Option<AuthedUser> = None;

            if requires_account {
                let account_header = req
                    .headers()
                    .get("X-Account-Id")
                    .and_then(|value| value.to_str().ok());

                // If header missing/invalid, fall back to user's first membership to avoid hard 400s
                let header_account = account_header.and_then(|v| Uuid::parse_str(v).ok());

                let membership = sqlx::query(
                    r#"
                    SELECT account_id, role
                    FROM account_memberships
                    WHERE user_id = $1
                    ORDER BY created_at ASC
                    LIMIT 1
                    "#,
                )
                .bind(user_id.unwrap())
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);

                let (account_id, role) = match (header_account, membership) {
                    (Some(id), _) => {
                        // Validate membership for the provided account
                        let row = sqlx::query(
                            "SELECT role FROM account_memberships WHERE account_id = $1 AND user_id = $2",
                        )
                        .bind(id)
                        .bind(user_id.unwrap())
                        .fetch_optional(&pool)
                        .await
                        .unwrap_or(None);

                        match row {
                            Some(rec) => (id, rec.get::<String, _>("role")),
                            None => {
                                return Ok(req.into_response(
                                    HttpResponse::Forbidden()
                                        .json(serde_json::json!({
                                            "error": "User is not a member of this account"
                                        }))
                                        .map_into_right_body(),
                                ));
                            }
                        }
                    }
                    (None, Some(rec)) => {
                        let account_id: Uuid = rec.get("account_id");
                        let role: String = rec.get("role");
                        (account_id, role)
                    }
                    (None, None) => {
                        return Ok(req.into_response(
                            HttpResponse::BadRequest()
                                .json(serde_json::json!({
                                    "error": "Missing X-Account-Id and no memberships found"
                                }))
                                .map_into_right_body(),
                        ));
                    }
                };

                authed_user = Some(AuthedUser {
                    user_id: user_id.unwrap(),
                    account_id,
                    role,
                });
            }

            if let Some(user) = authed_user {
                req.extensions_mut().insert(user);
            } else {
                // Attach user_id even when account header not required
                req.extensions_mut().insert(AuthedUser {
                    user_id: user_id.unwrap(),
                    account_id: Uuid::nil(),
                    role: String::new(),
                });
            }

            service.call(req).await.map(|res| res.map_into_left_body())
        })
    }
}
