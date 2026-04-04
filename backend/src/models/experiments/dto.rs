use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::enums::*;
use super::structs::*;
use crate::models::statistics::cuped::CupedAdjustedResult;
use crate::models::statistics::structs::StatisticalResult;

#[derive(Debug, Deserialize)]
pub struct CreateExperimentRequest {
    pub name: String,
    pub description: String,
    pub experiment_type: Option<ExperimentType>,
    pub sampling_method: Option<SamplingMethod>,
    pub analysis_engine: Option<AnalysisEngine>,
    pub feature_flag_id: Option<Uuid>,
    pub feature_gate_id: Option<Uuid>,
    pub health_checks: Option<Vec<HealthCheck>>,
    pub hypothesis: Hypothesis,
    pub variants: Vec<Variant>,
    pub primary_metric: String,
    pub user_groups: Vec<Uuid>,
    pub end_date: Option<DateTime<Utc>>,
    pub requires_existing_users: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ExperimentAnalysisResponse {
    pub experiment: Experiment,
    pub results: Vec<StatisticalResult>,
    pub sample_sizes: Vec<VariantSampleSize>,
    pub health_checks: Vec<HealthCheckResult>,
    pub cuped_adjusted_results: Option<Vec<CupedAdjustedResult>>,
}
