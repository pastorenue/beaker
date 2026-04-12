use serde::Deserialize;

/// Standalone event creation via the REST API.
#[derive(Debug, Deserialize)]
pub struct CreateTelemetryEventRequest {
    pub name: String,
    pub description: Option<String>,
    pub event_type: Option<String>,
    pub selector: Option<String>,
    pub url_pattern: Option<String>,
    pub visual_guide: Option<String>,
    pub is_active: Option<bool>,
}

/// Bulk creation of multiple events via the REST API.
#[derive(Debug, Deserialize)]
pub struct BulkCreateTelemetryEventRequest {
    pub events: Vec<CreateTelemetryEventRequest>,
}

/// Partial update for a single event via the REST API.
#[derive(Debug, Deserialize)]
pub struct UpdateTelemetryEventRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type: Option<String>,
    pub selector: Option<String>,
    pub url_pattern: Option<String>,
    pub visual_guide: Option<String>,
    pub is_active: Option<bool>,
}

// ── SDK / internal types ──────────────────────────────────────────────────────

/// One event spec inside a definition create/update request (used by SDK).
#[derive(Debug, Deserialize)]
pub struct CreateTelemetryEventInput {
    pub name: String,
    pub description: Option<String>,
    pub event_type: Option<String>,
    pub selector: Option<String>,
    pub url_pattern: Option<String>,
    pub visual_guide: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTelemetryDefinitionRequest {
    pub is_active: Option<bool>,
    pub events: Vec<CreateTelemetryEventInput>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTelemetryDefinitionRequest {
    pub is_active: Option<bool>,
    pub events: Option<Vec<CreateTelemetryEventInput>>,
}
