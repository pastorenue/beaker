use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::models::experiments::ExperimentType;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VariantSuggestion {
    pub name: String,
    pub description: String,
    pub allocation_percent: f64,
    pub is_control: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExperimentSuggestion {
    pub name: String,
    pub description: String,
    pub hypothesis_draft: String,
    pub primary_metric: String,
    pub predicted_impact_score: f64,
    pub experiment_type: ExperimentType,
    pub variants: Vec<VariantSuggestion>,
    pub telemetry_touchpoints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OnePagerDraft {
    pub experiment_name: String,
    pub objective: String,
    pub hypothesis: String,
    pub success_metrics: Vec<String>,
    pub guardrail_metrics: Vec<String>,
    pub estimated_duration_days: u32,
    pub sample_size_estimate: u64,
    pub risks: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HypothesisDraft {
    pub null_hypothesis: String,
    pub alternative_hypothesis: String,
    pub expected_effect_size: f64,
    pub metric_type: String,
    pub significance_level: f64,
    pub power: f64,
    pub rationale: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MetricSuggestion {
    pub metric_name: String,
    pub telemetry_event: String,
    pub metric_type: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MetricSuggestionsResponse {
    pub primary_metrics: Vec<MetricSuggestion>,
    pub guardrail_metrics: Vec<MetricSuggestion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExperimentSummary {
    pub experiment_id: Uuid,
    pub experiment_name: String,
    pub summary: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DraftHypothesisRequest {
    pub experiment_description: String,
    pub metric_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DraftOnePagerRequest {
    pub experiment_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SuggestMetricsRequest {
    pub experiment_description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiPollingInsight {
    pub id: Uuid,
    pub account_id: Uuid,
    pub experiment_id: Uuid,
    pub polled_at: DateTime<Utc>,
    pub severity: String,
    pub insight_type: String,
    pub headline: String,
    pub detail: String,
    pub ai_narrative: Option<String>,
    pub p_value: Option<f64>,
    pub effect_size: Option<f64>,
    pub sample_size: Option<i64>,
    pub auto_actioned: bool,
    pub dismissed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InsightsListResponse {
    pub insights: Vec<AiPollingInsight>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InsightsSummaryResponse {
    pub info: i64,
    pub warning: i64,
    pub critical: i64,
    pub total: i64,
}
