use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::structs::Session;

#[derive(Debug, Deserialize)]
pub struct StartSessionRequest {
    pub session_id: Option<String>,
    pub user_id: Option<String>,
    pub entry_url: String,
    pub referrer: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub experiment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EndSessionRequest {
    pub session_id: String,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct TrackEventRequest {
    pub session_id: String,
    pub user_id: Option<String>,
    pub event_name: String,
    pub event_type: String,
    pub url: String,
    pub selector: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct TrackReplayRequest {
    pub session_id: String,
    pub events: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct StartSessionResponse {
    pub session_id: String,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListSessionsResponse {
    pub sessions: Vec<Session>,
    pub total: u64,
    pub limit: usize,
    pub offset: usize,
}
