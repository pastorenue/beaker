use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::config::Config;
use crate::models::AuthTokenResponse;

#[derive(serde::Serialize)]
struct Claims {
    sub: String,
    token_id: String,
    exp: usize,
}

#[derive(serde::Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
}

#[derive(serde::Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: String,
    name: Option<String>,
}

pub struct OAuthService {
    db: PgPool,
    config: Config,
    http: reqwest::Client,
}

impl OAuthService {
    pub fn new(db: PgPool, config: Config) -> Self {
        Self {
            db,
            config,
            http: reqwest::Client::new(),
        }
    }

    pub async fn build_authorization_url(&self, remember_me: bool) -> Result<String> {
        let state = Uuid::new_v4();
        sqlx::query("INSERT INTO oauth_states (state, remember_me) VALUES ($1, $2)")
            .bind(state)
            .bind(remember_me)
            .execute(&self.db)
            .await
            .context("Failed to store OAuth state")?;

        let url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}&access_type=offline&prompt=select_account",
            percent_encode(&self.config.google_client_id),
            percent_encode(&self.config.google_redirect_uri),
            state,
        );
        Ok(url)
    }

    pub async fn exchange_code(&self, code: &str, state_str: &str) -> Result<AuthTokenResponse> {
        let state = Uuid::parse_str(state_str).context("Invalid OAuth state format")?;

        let row = sqlx::query(
            "DELETE FROM oauth_states WHERE state = $1 AND expires_at > NOW() RETURNING remember_me",
        )
        .bind(state)
        .fetch_optional(&self.db)
        .await
        .context("Failed to validate OAuth state")?;

        let row = row.ok_or_else(|| anyhow::anyhow!("Invalid or expired OAuth state"))?;
        let remember_me: bool = row.get("remember_me");

        // Exchange code for access token
        let token_res: GoogleTokenResponse = self
            .http
            .post("https://oauth2.googleapis.com/token")
            .json(&serde_json::json!({
                "code": code,
                "client_id": &self.config.google_client_id,
                "client_secret": &self.config.google_client_secret,
                "redirect_uri": &self.config.google_redirect_uri,
                "grant_type": "authorization_code",
            }))
            .send()
            .await
            .context("Failed to contact Google token endpoint")?
            .json()
            .await
            .context("Failed to parse Google token response")?;

        // Fetch user info
        let user_info: GoogleUserInfo = self
            .http
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(&token_res.access_token)
            .send()
            .await
            .context("Failed to contact Google userinfo endpoint")?
            .json()
            .await
            .context("Failed to parse Google userinfo response")?;

        let user_id = self.find_or_create_user(&user_info).await?;
        self.issue_token(user_id, remember_me).await
    }

    async fn find_or_create_user(&self, info: &GoogleUserInfo) -> Result<Uuid> {
        // Strategy 1: find by google_id
        if let Some(user_id) =
            sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE google_id = $1")
                .bind(&info.sub)
                .fetch_optional(&self.db)
                .await
                .context("Failed to query by google_id")?
        {
            return Ok(user_id);
        }

        // Strategy 2: link google_id to existing email/password account
        if let Some(user_id) = sqlx::query_scalar::<_, Uuid>(
            "UPDATE users SET google_id = $1, is_email_verified = TRUE WHERE email = $2 RETURNING id",
        )
        .bind(&info.sub)
        .bind(&info.email)
        .fetch_optional(&self.db)
        .await
        .context("Failed to link google_id to existing user")?
        {
            return Ok(user_id);
        }

        // Strategy 3: create new user, account, and membership
        let mut tx = self
            .db
            .begin()
            .await
            .context("Failed to begin transaction")?;

        let user_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, is_email_verified, totp_enabled, google_id) \
             VALUES ($1, $2, NULL, TRUE, FALSE, $3)",
        )
        .bind(user_id)
        .bind(&info.email)
        .bind(&info.sub)
        .execute(&mut *tx)
        .await
        .context("Failed to create user")?;

        let account_id = Uuid::new_v4();
        let account_name = info
            .name
            .as_deref()
            .map(|n| format!("{}'s Workspace", n))
            .unwrap_or_else(|| "My Workspace".to_string());

        sqlx::query("INSERT INTO accounts (id, name) VALUES ($1, $2)")
            .bind(account_id)
            .bind(&account_name)
            .execute(&mut *tx)
            .await
            .context("Failed to create account")?;

        sqlx::query(
            "INSERT INTO account_memberships (account_id, user_id, role) VALUES ($1, $2, 'owner')",
        )
        .bind(account_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .context("Failed to create membership")?;

        tx.commit().await.context("Failed to commit transaction")?;
        Ok(user_id)
    }

    async fn issue_token(&self, user_id: Uuid, remember_me: bool) -> Result<AuthTokenResponse> {
        let token_id = Uuid::new_v4();
        let ttl = if remember_me {
            30 * 24 * 60
        } else {
            self.config.jwt_ttl_minutes
        };
        let exp = Utc::now() + Duration::minutes(ttl);
        let claims = Claims {
            sub: user_id.to_string(),
            token_id: token_id.to_string(),
            exp: exp.timestamp() as usize,
        };

        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.config.jwt_secret.as_bytes()),
        )
        .context("Failed to encode JWT")?;

        let default_account: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1")
                .fetch_optional(&self.db)
                .await
                .context("Failed to find default account")?;

        sqlx::query(
            "INSERT INTO sessions (user_id, token_id, expires_at, account_id) VALUES ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(token_id)
        .bind(exp)
        .bind(default_account.unwrap_or_else(Uuid::nil))
        .execute(&self.db)
        .await
        .context("Failed to store session")?;

        Ok(AuthTokenResponse { token, user_id })
    }
}

/// Percent-encode a string for use in a URL query parameter value.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push(
                    char::from_digit((b >> 4) as u32, 16)
                        .unwrap()
                        .to_ascii_uppercase(),
                );
                out.push(
                    char::from_digit((b & 0xf) as u32, 16)
                        .unwrap()
                        .to_ascii_uppercase(),
                );
            }
        }
    }
    out
}
