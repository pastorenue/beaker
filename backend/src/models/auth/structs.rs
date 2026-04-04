use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuthUser {
    pub id: Uuid,
    pub email: String,
    pub password_hash: Option<String>,
    pub is_email_verified: bool,
    pub totp_enabled: bool,
    pub totp_secret: Option<String>,
    pub created_at: DateTime<Utc>,
}
