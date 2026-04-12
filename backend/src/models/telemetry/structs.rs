use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// One row in telemetry_events (child of a definition).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub id: Uuid,
    pub definition_id: Uuid,
    pub description: String,
    pub name: String,
    pub event_type: String,
    pub selector: Option<String>,
    pub url_pattern: Option<String>,
    pub visual_guide: Option<String>,
}

/// Flat event with joined definition fields — returned by the list/create/update API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEventFlat {
    pub id: Uuid,
    pub definition_id: Uuid,
    pub experiment_id: Uuid,
    pub is_active: bool,
    pub name: String,
    pub description: String,
    pub event_type: String,
    pub selector: Option<String>,
    pub url_pattern: Option<String>,
    pub visual_guide: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Definition (grouping container) — used by SDK endpoint only.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryDefinition {
    pub id: Uuid,
    pub account_id: Uuid,
    pub experiment_id: Uuid,
    pub is_active: bool,
    pub events: Vec<TelemetryEvent>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
