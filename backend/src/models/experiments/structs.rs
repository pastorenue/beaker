use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::enums::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experiment {
    pub account_id: Uuid,
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub status: ExperimentStatus,
    pub experiment_type: ExperimentType,
    pub sampling_method: SamplingMethod,
    pub analysis_engine: AnalysisEngine,
    pub sampling_seed: u64,
    pub feature_flag_id: Option<Uuid>,
    pub feature_gate_id: Option<Uuid>,
    pub health_checks: Vec<HealthCheck>,
    pub hypothesis: Option<Hypothesis>,
    pub variants: Vec<Variant>,
    pub user_groups: Vec<Uuid>,
    pub primary_metric: String,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub jira_issue_key: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hypothesis {
    pub null_hypothesis: String,
    pub alternative_hypothesis: String,
    pub expected_effect_size: f64,
    pub metric_type: MetricType,
    pub significance_level: f64, // Alpha (typically 0.05)
    pub power: f64,              // Typically 0.8
    pub minimum_sample_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variant {
    pub name: String,
    pub description: String,
    pub allocation_percent: f64,
    pub is_control: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub metric_name: String,
    pub direction: HealthCheckDirection,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub metric_name: String,
    pub direction: HealthCheckDirection,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub current_value: Option<f64>,
    pub is_passing: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VariantSampleSize {
    pub variant: String,
    pub current_size: usize,
    pub required_size: usize,
}
