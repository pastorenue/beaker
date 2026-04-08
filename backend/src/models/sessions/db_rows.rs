use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
pub struct SessionRow {
    pub account_id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub entry_url: String,
    pub referrer: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: Option<String>,
    pub started_at: u32,
    pub ended_at: Option<u32>,
    pub duration_seconds: Option<u32>,
    pub updated_at: u32,
}

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
pub struct ActivityEventRow {
    pub event_id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub event_name: String,
    pub event_type: String,
    pub url: String,
    pub selector: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub metadata: Option<String>,
    pub timestamp: u32,
}

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
pub struct ReplayEventRow {
    pub session_id: String,
    pub sequence: u32,
    pub event: String,
    pub timestamp: u32,
}
