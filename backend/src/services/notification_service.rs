use anyhow::{anyhow, Result};
use chrono::Utc;
use data_encoding::BASE64;
use log::warn;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::integrations::{
    AccountIntegrationRow, CreateJiraIssueResponse, JiraConfig, SlackConfig,
};
use crate::models::Experiment;

#[derive(Clone)]
pub struct NotificationService {
    pg: PgPool,
    client: reqwest::Client,
}

impl NotificationService {
    pub fn new(pg: PgPool) -> Self {
        Self {
            pg,
            client: reqwest::Client::new(),
        }
    }

    // -------------------------------------------------------------------------
    // Slack notifications
    // -------------------------------------------------------------------------

    pub async fn notify_experiment_status_changed(
        &self,
        account_id: Uuid,
        experiment: &Experiment,
        new_status: &str,
    ) {
        let config = match self.load_slack_config(account_id).await {
            Some(c) => c,
            None => return,
        };

        let emoji = match new_status {
            "running" => "🟢",
            "paused" => "🟡",
            "stopped" => "🔴",
            _ => "⚪",
        };

        let payload = json!({
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": format!("{} Experiment {}", emoji, Self::capitalize(new_status))
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": format!("*Experiment:*\n{}", experiment.name)},
                        {"type": "mrkdwn", "text": format!("*Status:*\n{}", Self::capitalize(new_status))},
                        {"type": "mrkdwn", "text": format!("*Primary Metric:*\n{}", experiment.primary_metric)},
                        {"type": "mrkdwn", "text": format!("*Timestamp:*\n{}", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"))}
                    ]
                }
            ]
        });

        self.send_slack_message(&config.webhook_url, payload).await;
    }

    pub async fn notify_ai_insight(
        &self,
        account_id: Uuid,
        experiment_name: &str,
        _experiment_id: Uuid,
        severity: &str,
        headline: &str,
        detail: &str,
    ) {
        if !matches!(severity, "critical" | "warning") {
            return;
        }

        let config = match self.load_slack_config(account_id).await {
            Some(c) => c,
            None => return,
        };

        let emoji = if severity == "critical" { "🚨" } else { "⚠️" };

        let payload = json!({
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": format!("{} {}: {}", emoji, Self::capitalize(severity), headline)
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!("*Experiment:* {}\n{}\n*Severity:* `{}`", experiment_name, detail, severity)
                    }
                }
            ]
        });

        self.send_slack_message(&config.webhook_url, payload).await;
    }

    pub async fn notify_winner_detected(
        &self,
        account_id: Uuid,
        experiment: &Experiment,
        variant_b: &str,
        effect_size: f64,
        p_value: f64,
    ) {
        let config = match self.load_slack_config(account_id).await {
            Some(c) => c,
            None => return,
        };

        let payload = json!({
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "🏆 Winner Detected"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": format!("*Experiment:*\n{}", experiment.name)},
                        {"type": "mrkdwn", "text": format!("*Winning Variant:*\n{}", variant_b)},
                        {"type": "mrkdwn", "text": format!("*Effect Size:*\n{:.4}", effect_size)},
                        {"type": "mrkdwn", "text": format!("*P-Value:*\n{:.4}", p_value)}
                    ]
                }
            ]
        });

        self.send_slack_message(&config.webhook_url, payload).await;
    }

    async fn send_slack_message(&self, webhook_url: &str, payload: Value) {
        let result = self
            .client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) => {
                warn!("Slack webhook returned non-success status: {}", resp.status());
            }
            Err(e) => {
                warn!("Failed to send Slack message: {}", e);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Jira
    // -------------------------------------------------------------------------

    pub async fn create_jira_issue(
        &self,
        account_id: Uuid,
        summary: String,
        description: Option<String>,
        issue_type: Option<String>,
        project_key_override: Option<String>,
    ) -> Result<CreateJiraIssueResponse> {
        let config = self.load_jira_config(account_id).await?;

        let project_key = project_key_override
            .or_else(|| config.project_key.clone())
            .ok_or_else(|| anyhow!("No Jira project key configured"))?;

        let issue_type_name = issue_type.unwrap_or_else(|| "Task".to_string());

        let desc_content: Value = if let Some(text) = description {
            json!({
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": text}]
                    }
                ]
            })
        } else {
            json!({
                "type": "doc",
                "version": 1,
                "content": []
            })
        };

        let body = json!({
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "description": desc_content,
                "issuetype": {"name": issue_type_name}
            }
        });

        let auth = Self::jira_basic_auth(&config.email, &config.api_token);
        let url = format!("{}/rest/api/3/issue", config.site_url.trim_end_matches('/'));

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Basic {}", auth))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Jira request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Jira returned {}: {}", status, text));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Jira response: {}", e))?;

        let key = data
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("No 'key' in Jira response"))?
            .to_string();

        let issue_url = format!("{}/browse/{}", config.site_url.trim_end_matches('/'), key);

        Ok(CreateJiraIssueResponse {
            issue_key: key,
            issue_url,
        })
    }

    pub async fn test_jira_connection(
        &self,
        account_id: Uuid,
    ) -> Result<String> {
        let config = self.load_jira_config(account_id).await?;
        let auth = Self::jira_basic_auth(&config.email, &config.api_token);
        let url = format!("{}/rest/api/3/myself", config.site_url.trim_end_matches('/'));

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Basic {}", auth))
            .send()
            .await
            .map_err(|e| anyhow!("Jira request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(anyhow!("Jira returned status {}", resp.status()));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Jira response: {}", e))?;

        let display_name = data
            .get("displayName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        Ok(display_name)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    async fn load_slack_config(&self, account_id: Uuid) -> Option<SlackConfig> {
        let row = sqlx::query_as::<_, AccountIntegrationRow>(
            "SELECT id, account_id, integration_type, enabled, config::text AS config, \
             created_at, updated_at \
             FROM account_integrations \
             WHERE account_id = $1 AND integration_type = 'slack' AND enabled = TRUE",
        )
        .bind(account_id)
        .fetch_optional(&self.pg)
        .await
        .ok()
        .flatten()?;

        serde_json::from_str::<SlackConfig>(&row.config).ok()
    }

    async fn load_jira_config(&self, account_id: Uuid) -> Result<JiraConfig> {
        let row = sqlx::query_as::<_, AccountIntegrationRow>(
            "SELECT id, account_id, integration_type, enabled, config::text AS config, \
             created_at, updated_at \
             FROM account_integrations \
             WHERE account_id = $1 AND integration_type = 'jira' AND enabled = TRUE",
        )
        .bind(account_id)
        .fetch_optional(&self.pg)
        .await
        .map_err(|e| anyhow!("DB error: {}", e))?
        .ok_or_else(|| anyhow!("Jira integration not configured or disabled"))?;

        serde_json::from_str::<JiraConfig>(&row.config)
            .map_err(|e| anyhow!("Invalid Jira config: {}", e))
    }

    fn jira_basic_auth(email: &str, token: &str) -> String {
        BASE64.encode(format!("{}:{}", email, token).as_bytes())
    }

    fn capitalize(s: &str) -> String {
        let mut c = s.chars();
        match c.next() {
            None => String::new(),
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        }
    }
}
