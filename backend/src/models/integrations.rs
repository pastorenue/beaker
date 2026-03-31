use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// DB-facing row — config is cast to text in SELECT queries then parsed
#[derive(Debug, sqlx::FromRow)]
pub struct AccountIntegrationRow {
    pub id: Uuid,
    pub account_id: Uuid,
    pub integration_type: String,
    pub enabled: bool,
    pub config: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// API-facing struct returned to callers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountIntegration {
    pub id: Uuid,
    pub account_id: Uuid,
    pub integration_type: String,
    pub enabled: bool,
    pub config: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payload for PUT /integrations/{type}
#[derive(Debug, Deserialize)]
pub struct UpsertIntegrationRequest {
    pub enabled: Option<bool>,
    pub config: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SlackConfig {
    pub webhook_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JiraConfig {
    pub site_url: String,
    pub email: String,
    pub api_token: String,
    pub project_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateJiraIssueRequest {
    pub summary: String,
    pub description: Option<String>,
    pub issue_type: Option<String>,
    pub project_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateJiraIssueResponse {
    pub issue_key: String,
    pub issue_url: String,
}

#[derive(Debug, Deserialize)]
pub struct LinkJiraIssueRequest {
    pub jira_issue_key: String,
}
