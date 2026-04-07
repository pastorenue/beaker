use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use rand::{distributions::Alphanumeric, Rng};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::config::Config;

pub struct InviteService {
    db: PgPool,
    config: Config,
}

impl InviteService {
    pub fn new(db: PgPool, config: Config) -> Self {
        Self { db, config }
    }

    pub async fn create_invite(
        &self,
        account_id: Uuid,
        email: &str,
        role: &str,
        invited_by: Uuid,
    ) -> Result<String> {
        let token: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let expires_at = Utc::now() + Duration::days(7);

        sqlx::query(
            "INSERT INTO account_invites (account_id, email, role, token, invited_by, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (account_id, email) DO UPDATE SET
                token = EXCLUDED.token,
                role = EXCLUDED.role,
                invited_by = EXCLUDED.invited_by,
                expires_at = EXCLUDED.expires_at,
                accepted_at = NULL,
                created_at = now()",
        )
        .bind(account_id)
        .bind(email)
        .bind(role)
        .bind(&token)
        .bind(invited_by)
        .bind(expires_at)
        .execute(&self.db)
        .await
        .context("Failed to create invitation in database")?;

        self.send_invite_email(email, &token, account_id).await?;

        Ok(token)
    }

    async fn send_invite_email(&self, email: &str, token: &str, account_id: Uuid) -> Result<()> {
        let org_name: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id = $1")
            .bind(account_id)
            .fetch_one(&self.db)
            .await
            .unwrap_or_else(|_| "an account".to_string());

        if let Some(host) = self.config.smtp_host.clone() {
            let from_addr = self
                .config
                .smtp_from
                .clone()
                .unwrap_or_else(|| "no-reply@beaker.local".to_string());

            let invite_link = format!("{}/register?invite={}", "http://localhost:3000", token);

            let email_message = Message::builder()
                .from(from_addr.parse::<Mailbox>().context("Invalid SMTP_FROM")?)
                .to(email.parse::<Mailbox>().context("Invalid recipient email")?)
                .subject(format!("Invitation to join {} on Beaker", org_name))
                .body(format!(
                    "You have been invited to join {} on Beaker.\n\nClick the link below to accept the invitation and register:\n{}\n\nThis link expires in 7 days.",
                    org_name, invite_link
                ))?;

            let mut mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
                .context("Failed to build SMTP transport")?
                .port(self.config.smtp_port);

            if let (Some(user), Some(pass)) =
                (self.config.smtp_user.clone(), self.config.smtp_pass.clone())
            {
                mailer = mailer.credentials(Credentials::new(user, pass));
            }

            if self.config.log_only_otp {
                log::info!(
                    "LOG_ONLY_OTP enabled. Invite for {} to {}: {}",
                    email,
                    org_name,
                    token
                );
            } else {
                match mailer.build().send(email_message).await {
                    Ok(_) => log::info!("Sent invite email to {} via SMTP {}", email, host),
                    Err(err) => log::warn!("Failed to send invite email: {}", err),
                }
            }
        } else {
            log::info!(
                "SMTP not configured. Invite for {} to {}: {}",
                email,
                org_name,
                token
            );
        }

        Ok(())
    }

    pub async fn verify_token(&self, token: &str) -> Result<(Uuid, String, String)> {
        let row = sqlx::query(
            "SELECT i.account_id, o.name as org_name, i.email 
             FROM account_invites i
             JOIN accounts o ON o.id = i.account_id
             WHERE i.token = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW()",
        )
        .bind(token)
        .fetch_optional(&self.db)
        .await
        .context("Failed to lookup invitation")?;

        let row = row.ok_or_else(|| anyhow::anyhow!("Invalid or expired invitation token"))?;

        Ok((row.get("account_id"), row.get("org_name"), row.get("email")))
    }

    pub async fn accept_invite(&self, token: &str, user_id: Uuid) -> Result<()> {
        let (account_id, _, _) = self.verify_token(token).await?;

        let mut tx = self.db.begin().await?;

        // Add user to the account
        sqlx::query(
            "INSERT INTO account_memberships (account_id, user_id, role)
             VALUES ($1, $2, 'member')
             ON CONFLICT (account_id, user_id) DO NOTHING",
        )
        .bind(account_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .context("Failed to create membership")?;

        // Mark invite as accepted
        sqlx::query("UPDATE account_invites SET accepted_at = NOW() WHERE token = $1")
            .bind(token)
            .execute(&mut *tx)
            .await
            .context("Failed to mark invite as accepted")?;

        tx.commit().await?;

        Ok(())
    }
}
