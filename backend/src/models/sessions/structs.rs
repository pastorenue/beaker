use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub user_id: Option<String>,
    pub entry_url: String,
    pub referrer: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub duration_seconds: Option<u32>,
    pub clicks_count: Option<u64>,
    pub replay_events_count: Option<u64>,
    pub experiment_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub event_id: Uuid,
    pub session_id: String,
    pub user_id: Option<String>,
    pub event_name: String,
    pub event_type: String,
    pub url: String,
    pub selector: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayEvent {
    pub session_id: String,
    pub sequence: u32,
    pub event: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}
