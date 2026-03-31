use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::experiments::enums::AnalysisEngine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticalResult {
    pub experiment_id: Uuid,
    pub variant_a: String,
    pub variant_b: String,
    pub metric_name: String,
    pub sample_size_a: usize,
    pub sample_size_b: usize,
    pub mean_a: f64,
    pub mean_b: f64,
    pub std_dev_a: Option<f64>,
    pub std_dev_b: Option<f64>,
    pub effect_size: f64,
    pub p_value: f64,
    pub bayes_probability: Option<f64>,
    pub e_value: Option<f64>,
    pub sequential_threshold: Option<f64>,
    pub confidence_interval_lower: f64,
    pub confidence_interval_upper: f64,
    pub is_significant: bool,
    pub test_type: String,
    pub analysis_engine: AnalysisEngine,
    pub calculated_at: DateTime<Utc>,
}
