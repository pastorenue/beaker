use anyhow::{Context, Result};
use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use data_encoding::BASE32_NOPAD;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use rand::{distributions::Uniform, Rng};
use sqlx::PgPool;
use totp_rs::{Algorithm as TotpAlgorithm, TOTP};
use uuid::Uuid;

use crate::config::Config;
use crate::models::{AuthStatusResponse, AuthTokenResponse, AuthUser, TotpSetupResponse};
use sqlx::Row;

#[derive(serde::Serialize)]
struct Claims {
    sub: String,
    token_id: String,
    exp: usize,
}

pub struct AuthService {
    db: PgPool,
    config: Config,
}

impl AuthService {
    pub fn new(db: PgPool, config: Config) -> Self {
        Self { db, config }
    }

    pub async fn register(
        &self,
        email: &str,
        password: &str,
        invite_token: Option<&str>,
    ) -> Result<AuthStatusResponse> {
        let hashed = self.hash_password(password)?;
        let user_id = Uuid::new_v4();

        let mut tx = self.db.begin().await?;

        sqlx::query(
            "INSERT INTO users (id, email, password_hash, is_email_verified, totp_enabled) VALUES ($1, $2, $3, true, false)",
        )
        .bind(user_id)
        .bind(email)
        .bind(&hashed)
        .execute(&mut *tx)
        .await
        .context("Failed to create user")?;

        if let Some(token) = invite_token {
            let row = sqlx::query(
                "SELECT account_id FROM account_invites WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()"
            )
            .bind(token)
            .fetch_optional(&mut *tx)
            .await
            .context("Failed to lookup invitation")?;

            if let Some(invite) = row {
                let account_id: Uuid = invite.get("account_id");
                sqlx::query(
                    "INSERT INTO account_memberships (account_id, user_id, role) VALUES ($1, $2, 'member')"
                )
                .bind(account_id)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .context("Failed to create membership from invite")?;

                sqlx::query("UPDATE account_invites SET accepted_at = NOW() WHERE token = $1")
                    .bind(token)
                    .execute(&mut *tx)
                    .await
                    .context("Failed to mark invite as accepted")?;
            }
        }

        tx.commit().await?;

        let token = self.issue_token(user_id, false).await?;
        Ok(AuthStatusResponse {
            requires_otp: false,
            totp_enabled: false,
            dev_code: None,
            token: Some(token.token),
            user_id: Some(token.user_id),
        })
    }

    pub async fn ensure_admin(&self, email: &str, password: &str) -> Result<()> {
        let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
            .bind(email)
            .fetch_one(&self.db)
            .await
            .context("Failed to check admin user")?;

        if existing > 0 {
            return Ok(());
        }

        let hashed = self.hash_password(password)?;
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, is_email_verified, totp_enabled) VALUES ($1, $2, $3, true, false)",
        )
        .bind(Uuid::new_v4())
        .bind(email)
        .bind(&hashed)
        .execute(&self.db)
        .await
        .context("Failed to create default admin")?;

        log::info!("Default admin user created: {}", email);
        Ok(())
    }

    pub async fn login(
        &self,
        email: &str,
        password: &str,
        remember_me: bool,
    ) -> Result<AuthStatusResponse> {
        let user = self.get_user_by_email(email).await?;

        let hash = user.password_hash.as_deref().ok_or_else(|| {
            anyhow::anyhow!(
                "This account uses Google Sign-In. Please use 'Continue with Google'."
            )
        })?;
        self.verify_password(password, hash)?;

        let dev_code = None;
        if user.totp_enabled {
            return Ok(AuthStatusResponse {
                requires_otp: true,
                totp_enabled: true,
                dev_code,
                token: None,
                user_id: None,
            });
        }

        let token = self.issue_token(user.id, remember_me).await?;
        Ok(AuthStatusResponse {
            requires_otp: false,
            totp_enabled: false,
            dev_code,
            token: Some(token.token),
            user_id: Some(token.user_id),
        })
    }

    pub async fn verify_otp(
        &self,
        email: &str,
        _code: &str,
        totp_code: Option<&str>,
        remember_me: bool,
    ) -> Result<AuthTokenResponse> {
        let user = self.get_user_by_email(email).await?;
        if user.totp_enabled {
            let totp = totp_code.ok_or_else(|| anyhow::anyhow!("Authenticator code required"))?;
            self.verify_totp_code(&user, totp)?;
            return self.issue_token(user.id, remember_me).await;
        }

        self.issue_token(user.id, remember_me).await
    }

    pub async fn enable_totp(&self, user_id: Uuid) -> Result<TotpSetupResponse> {
        let secret = self.generate_totp_secret();
        sqlx::query("UPDATE users SET totp_secret = $1 WHERE id = $2")
            .bind(&secret)
            .bind(user_id)
            .execute(&self.db)
            .await
            .context("Failed to store TOTP secret")?;

        let otpauth_url = format!(
            "otpauth://totp/Beaker:{}?secret={}&issuer=Beaker",
            user_id, secret
        );
        Ok(TotpSetupResponse {
            secret,
            otpauth_url,
        })
    }

    pub async fn verify_totp(&self, user_id: Uuid, code: &str) -> Result<()> {
        let user = self.get_user_by_id(user_id).await?;
        self.verify_totp_code(&user, code)?;
        sqlx::query("UPDATE users SET totp_enabled = true WHERE id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await
            .context("Failed to enable TOTP")?;
        Ok(())
    }

    pub async fn disable_totp(&self, user_id: Uuid) -> Result<()> {
        sqlx::query("UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1")
            .bind(user_id)
            .execute(&self.db)
            .await
            .context("Failed to disable TOTP")?;
        Ok(())
    }

    pub async fn me(&self, user_id: Uuid) -> Result<AuthUser> {
        self.get_user_by_id(user_id).await
    }

    pub async fn forgot_password(&self, email: &str) -> Result<()> {
        // Silently succeed if email not found (prevents user enumeration)
        let user = match self.get_user_by_email(email).await {
            Ok(u) => u,
            Err(_) => return Ok(()),
        };

        let token = Uuid::new_v4().to_string();
        let expires = Utc::now() + Duration::hours(1);
        sqlx::query(
            "INSERT INTO otp_codes (user_id, code, purpose, expires_at) VALUES ($1, $2, 'password_reset', $3)",
        )
        .bind(user.id)
        .bind(&token)
        .bind(expires)
        .execute(&self.db)
        .await
        .context("Failed to store reset token")?;

        let reset_url = format!(
            "{}/reset-password?token={}",
            self.config.frontend_base_url, token
        );

        if let Some(host) = self.config.smtp_host.clone() {
            let from_addr = self
                .config
                .smtp_from
                .clone()
                .unwrap_or_else(|| "no-reply@beaker.local".to_string());

            let email_message = Message::builder()
                .from(from_addr.parse::<Mailbox>().context("Invalid SMTP_FROM")?)
                .to(email
                    .parse::<Mailbox>()
                    .context("Invalid recipient email")?)
                .subject("Reset your Beaker password")
                .body(format!(
                    "Click the link below to reset your password:\n\n{}\n\nThis link expires in 1 hour.",
                    reset_url
                ))?;

            let mut mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
                .context("Failed to build SMTP transport")?;

            if let (Some(user), Some(pass)) =
                (self.config.smtp_user.clone(), self.config.smtp_pass.clone())
            {
                mailer = mailer.credentials(Credentials::new(user, pass));
            }

            if self.config.log_only_otp {
                log::info!("LOG_ONLY_OTP enabled. Password reset link for {}: {}", email, reset_url);
            } else {
                match mailer.build().send(email_message).await {
                    Ok(_) => log::info!("Sent password reset email to {} via SMTP {}", email, host),
                    Err(err) => log::warn!("Failed to send password reset email: {}", err),
                }
            }
        } else {
            log::info!("SMTP not configured. Password reset link for {}: {}", email, reset_url);
        }

        Ok(())
    }

    pub async fn reset_password(&self, token: &str, new_password: &str) -> Result<()> {
        let row = sqlx::query(
            "SELECT id, user_id FROM otp_codes
             WHERE code = $1 AND purpose = 'password_reset'
               AND consumed_at IS NULL AND expires_at > NOW()",
        )
        .bind(token)
        .fetch_optional(&self.db)
        .await
        .context("Failed to lookup reset token")?;

        let row = row.ok_or_else(|| anyhow::anyhow!("Invalid or expired reset link"))?;
        let otp_id: Uuid = row.get("id");
        let user_id: Uuid = row.get("user_id");

        let hashed = self.hash_password(new_password)?;
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(&hashed)
            .bind(user_id)
            .execute(&self.db)
            .await
            .context("Failed to update password")?;

        sqlx::query("UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1")
            .bind(otp_id)
            .execute(&self.db)
            .await
            .context("Failed to consume reset token")?;

        Ok(())
    }

    pub fn hash_password(&self, password: &str) -> Result<String> {
        let salt = SaltString::generate(&mut rand::thread_rng());
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|err| anyhow::anyhow!("Failed to hash password: {}", err))?
            .to_string();
        Ok(hash)
    }

    fn verify_password(&self, password: &str, hash: &str) -> Result<()> {
        let parsed = PasswordHash::new(hash)
            .map_err(|err| anyhow::anyhow!("Invalid stored hash: {}", err))?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| anyhow::anyhow!("Invalid password"))
    }

    async fn get_user_by_email(&self, email: &str) -> Result<AuthUser> {
        sqlx::query_as::<_, AuthUser>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_one(&self.db)
            .await
            .context("User not found")
    }

    async fn get_user_by_id(&self, user_id: Uuid) -> Result<AuthUser> {
        sqlx::query_as::<_, AuthUser>("SELECT * FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&self.db)
            .await
            .context("User not found")
    }

    async fn send_otp(&self, email: &str, purpose: &str) -> Result<Option<String>> {
        let code = self.generate_otp_code();
        let expires = Utc::now() + Duration::minutes(10);
        let user = self.get_user_by_email(email).await?;

        sqlx::query(
            "INSERT INTO otp_codes (user_id, code, purpose, expires_at) VALUES ($1, $2, $3, $4)",
        )
        .bind(user.id)
        .bind(&code)
        .bind(purpose)
        .bind(expires)
        .execute(&self.db)
        .await
        .context("Failed to store OTP")?;

        if let Some(host) = self.config.smtp_host.clone() {
            let from_addr = self
                .config
                .smtp_from
                .clone()
                .unwrap_or_else(|| "no-reply@beaker.local".to_string());

            let email_message = Message::builder()
                .from(from_addr.parse::<Mailbox>().context("Invalid SMTP_FROM")?)
                .to(email
                    .parse::<Mailbox>()
                    .context("Invalid recipient email")?)
                .subject("Your Beaker OTP Code")
                .body(format!(
                    "Your one-time code is: {}\n\nIt expires in 10 minutes.",
                    code
                ))?;

            let mut mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
                .context("Failed to build SMTP transport")?;

            if let (Some(user), Some(pass)) =
                (self.config.smtp_user.clone(), self.config.smtp_pass.clone())
            {
                mailer = mailer.credentials(Credentials::new(user, pass));
            }

            if self.config.log_only_otp {
                log::info!(
                    "LOG_ONLY_OTP enabled. OTP for {} ({}): {}",
                    email,
                    purpose,
                    code
                );
            } else {
                match mailer.build().send(email_message).await {
                    Ok(_) => log::info!("Sent OTP email to {} via SMTP {}", email, host),
                    Err(err) => log::warn!("Failed to send OTP email: {}", err),
                }
            }
        } else {
            log::info!(
                "SMTP not configured. OTP for {} ({}): {}",
                email,
                purpose,
                code
            );
        }

        if self.config.allow_dev_otp {
            Ok(Some(code))
        } else {
            Ok(None)
        }
    }

    async fn consume_otp(
        &self,
        user_id: Uuid,
        code: &str,
        purpose: &str,
        invite_token: Option<&str>,
    ) -> Result<bool> {
        let mut tx = self
            .db
            .begin()
            .await
            .context("Failed to begin transaction")?;

        if let Some(token) = invite_token {
            let row = sqlx::query(
                "SELECT account_id FROM account_invites WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()"
            )
            .bind(token)
            .fetch_optional(&mut *tx)
            .await
            .context("Failed to lookup invitation")?;

            if let Some(invite) = row {
                let account_id: Uuid = invite.get("account_id");
                sqlx::query(
                    "INSERT INTO account_memberships (account_id, user_id, role) VALUES ($1, $2, 'member')"
                )
                .bind(account_id)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .context("Failed to create membership from invite")?;

                sqlx::query("UPDATE account_invites SET accepted_at = NOW() WHERE token = $1")
                    .bind(token)
                    .execute(&mut *tx)
                    .await
                    .context("Failed to mark invite as accepted")?;
            }
        }

        let row = sqlx::query(
            "SELECT id FROM otp_codes WHERE user_id = $1 AND code = $2 AND purpose = $3 AND consumed_at IS NULL AND expires_at > NOW()",
        )
        .bind(user_id)
        .bind(code)
        .bind(purpose)
        .fetch_optional(&mut *tx)
        .await
        .context("Failed to lookup OTP")?;

        if let Some(record) = row {
            let id: Uuid = record.get("id");
            sqlx::query("UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await
                .context("Failed to consume OTP")?;
            tx.commit().await.context("Failed to commit transaction")?;
            Ok(true)
        } else {
            tx.rollback()
                .await
                .context("Failed to rollback transaction")?;
            Ok(false)
        }
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

        // Pick a default account for the session to satisfy NOT NULL account_id
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

    fn generate_otp_code(&self) -> String {
        let mut rng = rand::thread_rng();
        let dist = Uniform::new_inclusive(0u32, 999_999);
        format!("{:06}", rng.sample(dist))
    }

    fn generate_totp_secret(&self) -> String {
        let random_bytes: [u8; 20] = rand::random();
        BASE32_NOPAD.encode(&random_bytes)
    }

    fn verify_totp_code(&self, user: &AuthUser, code: &str) -> Result<()> {
        let secret = user
            .totp_secret
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("TOTP not initialized"))?;
        let secret_bytes = BASE32_NOPAD
            .decode(secret.as_bytes())
            .context("Invalid TOTP secret")?;
        let totp = TOTP::new(TotpAlgorithm::SHA1, 6, 1, 30, secret_bytes)
            .context("Failed to build TOTP verifier")?;
        let expected_code = totp
            .generate_current()
            .context("Failed to generate TOTP code")?;
        if expected_code != code {
            anyhow::bail!("Invalid TOTP code");
        }
        Ok(())
    }
}
