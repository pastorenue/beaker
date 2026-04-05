use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserGroup {
    pub account_id: Uuid,
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub assignment_rule: String,
    pub size: usize,
    pub data_source_type: String,
    pub data_source_config: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LookerDataSourceConfig {
    pub api_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub look_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvDataSourceConfig {
    pub user_ids: Vec<String>,
    #[serde(default)]
    pub headers: Vec<String>,
    #[serde(default)]
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostgresDataSourceConfig {
    pub is_internal: bool,
    pub connection_string: Option<String>,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAssignment {
    pub account_id: Uuid,
    pub user_id: String,
    pub experiment_id: Uuid,
    pub variant: String,
    pub group_id: Uuid,
    pub assigned_at: DateTime<Utc>,
}
