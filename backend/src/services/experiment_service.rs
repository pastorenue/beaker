use crate::db::ClickHouseClient;
use crate::models::*;
use crate::stats;
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Utc};
use log::info;
use sqlx::PgPool;
use uuid::Uuid;

pub struct ExperimentService {
    pg: PgPool,
    ch: ClickHouseClient,
}

impl ExperimentService {
    pub fn new(pg: PgPool, ch: ClickHouseClient) -> Self {
        Self { pg, ch }
    }

    pub async fn create_experiment(
        &self,
        req: CreateExperimentRequest,
        account_id: Uuid,
    ) -> Result<Experiment> {
        info!("Creating experiment: {}", req.name);

        let experiment_type = req.experiment_type.unwrap_or(ExperimentType::AbTest);
        let sampling_method = req.sampling_method.unwrap_or(SamplingMethod::Hash);
        let analysis_engine = req.analysis_engine.unwrap_or(AnalysisEngine::Frequentist);
        let feature_flag_id = req.feature_flag_id;
        let feature_gate_id = req.feature_gate_id;
        let health_checks = req.health_checks.unwrap_or_default();

        if matches!(experiment_type, ExperimentType::FeatureGate) && feature_gate_id.is_none() {
            bail!(
                "Feature gate experiments must reference a feature_gate_id {:?}",
                feature_gate_id
            );
            // return Err(anyhow!(
            //     "Feature gate experiments must reference a feature_gate_id"
            // ));
        }

        let total_allocation: f64 = req.variants.iter().map(|v| v.allocation_percent).sum();
        if (total_allocation - 100.0).abs() > 0.01 {
            return Err(anyhow!("Variant allocations must sum to 100%"));
        }

        let control_count = req.variants.iter().filter(|v| v.is_control).count();
        if control_count != 1 {
            return Err(anyhow!("Exactly one variant must be marked as control"));
        }

        let required_sample = match req.hypothesis.metric_type {
            MetricType::Proportion => stats::sample_size_proportion(
                0.10,
                req.hypothesis.expected_effect_size,
                req.hypothesis.significance_level,
                req.hypothesis.power,
            ),
            MetricType::Continuous | MetricType::Count => stats::sample_size_continuous(
                1.0,
                req.hypothesis.expected_effect_size,
                req.hypothesis.significance_level,
                req.hypothesis.power,
            ),
        };

        let mut hypothesis = req.hypothesis;
        hypothesis.minimum_sample_size = Some(required_sample);

        let requires_existing_users = req.requires_existing_users.unwrap_or(false);

        let experiment = Experiment {
            account_id,
            id: Uuid::new_v4(),
            name: req.name,
            description: req.description,
            status: ExperimentStatus::Draft,
            experiment_type,
            sampling_method,
            analysis_engine,
            sampling_seed: Uuid::new_v4().as_u128() as u64,
            feature_flag_id,
            feature_gate_id,
            health_checks,
            hypothesis: Some(hypothesis),
            variants: req.variants,
            user_groups: req.user_groups,
            primary_metric: req.primary_metric,
            start_date: None,
            end_date: req.end_date,
            jira_issue_key: None,
            requires_existing_users,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.upsert_experiment(&experiment).await?;

        Ok(experiment)
    }

    pub async fn start_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        info!("Starting experiment: {}", experiment_id);

        let mut experiment = self
            .get_experiment(account_id, experiment_id)
            .await
            .map_err(|e| {
                log::error!("Failed to get experiment {}: {:?}", experiment_id, e);
                e
            })?;

        if !matches!(
            experiment.status,
            ExperimentStatus::Draft | ExperimentStatus::Paused
        ) {
            return Err(anyhow!(
                "Can only start experiments in Draft or Paused status"
            ));
        }

        experiment.status = ExperimentStatus::Running;
        experiment.start_date = Some(Utc::now());
        experiment.updated_at = Utc::now();

        self.upsert_experiment(&experiment).await?;

        Ok(experiment)
    }

    pub async fn restart_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        info!("Restarting experiment: {}", experiment_id);
        let mut experiment = self.get_experiment(account_id, experiment_id).await?;

        if !matches!(experiment.status, ExperimentStatus::Stopped) {
            return Err(anyhow!(
                "Can only restart experiments that have been previously stopped."
            ));
        }

        experiment.status = ExperimentStatus::Running;
        experiment.updated_at = Utc::now();

        self.upsert_experiment(&experiment).await?;

        Ok(experiment)
    }

    pub async fn pause_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        info!("Pausing experiment: {}", experiment_id);

        let mut experiment = self.get_experiment(account_id, experiment_id).await?;

        if !matches!(experiment.status, ExperimentStatus::Running) {
            return Err(anyhow!("Can only pause running experiments"));
        }

        experiment.status = ExperimentStatus::Paused;
        experiment.updated_at = Utc::now();

        self.upsert_experiment(&experiment).await?;

        Ok(experiment)
    }

    pub async fn stop_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        info!("Stopping experiment: {}", experiment_id);

        let mut experiment = self.get_experiment(account_id, experiment_id).await?;

        if matches!(experiment.status, ExperimentStatus::Stopped) {
            return Err(anyhow!("Experiment already stopped"));
        }

        experiment.status = ExperimentStatus::Stopped;
        experiment.end_date = Some(Utc::now());
        experiment.updated_at = Utc::now();

        self.upsert_experiment(&experiment).await?;

        Ok(experiment)
    }

    pub async fn get_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        let row = sqlx::query_as::<_, ExperimentRow>(
            r#"SELECT id, account_id, name, description, status, experiment_type,
                      sampling_method, analysis_engine, sampling_seed,
                      feature_flag_id, feature_gate_id, health_checks::text AS health_checks,
                      hypothesis::text AS hypothesis,
                      variants::text AS variants, user_groups::text AS user_groups,
                      primary_metric, start_date, end_date, jira_issue_key,
                      requires_existing_users, created_at, updated_at
               FROM experiments
               WHERE id = $1 AND account_id = $2"#,
        )
        .bind(experiment_id)
        .bind(account_id)
        .fetch_one(&self.pg)
        .await
        .with_context(|| format!("Failed to fetch experiment {experiment_id}"))?;

        row_to_experiment(row)
    }

    pub async fn list_experiments(&self, account_id: Uuid) -> Result<Vec<Experiment>> {
        let rows = sqlx::query_as::<_, ExperimentRow>(
            r#"SELECT id, account_id, name, description, status, experiment_type,
                      sampling_method, analysis_engine, sampling_seed,
                      feature_flag_id, feature_gate_id, health_checks::text AS health_checks,
                      hypothesis::text AS hypothesis,
                      variants::text AS variants, user_groups::text AS user_groups,
                      primary_metric, start_date, end_date, jira_issue_key,
                      requires_existing_users, created_at, updated_at
               FROM experiments
               WHERE account_id = $1
               ORDER BY updated_at DESC"#,
        )
        .bind(account_id)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch experiments")?;

        rows.into_iter().map(row_to_experiment).collect()
    }

    pub async fn analyze_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<ExperimentAnalysisResponse> {
        info!("Analyzing experiment: {}", experiment_id);

        let experiment = self.get_experiment(account_id, experiment_id).await?;
        let variant_data = self.get_variant_metrics(account_id, experiment_id).await?;

        let mut results = Vec::new();
        let mut sample_sizes = Vec::new();

        let control_variant = experiment
            .variants
            .iter()
            .find(|v| v.is_control)
            .ok_or_else(|| anyhow!("No control variant found"))?;

        for variant in experiment.variants.iter().filter(|v| !v.is_control) {
            let control_data = variant_data
                .get(&control_variant.name)
                .ok_or_else(|| anyhow!("No data for control variant"))?;
            let treatment_data = variant_data
                .get(&variant.name)
                .ok_or_else(|| anyhow!("No data for treatment variant"))?;

            let (tau_sq, alpha) = experiment
                .hypothesis
                .as_ref()
                .map(|h| (h.expected_effect_size.powi(2), h.significance_level))
                .unwrap_or((0.01, 0.05));

            let result = match experiment.hypothesis.as_ref().unwrap().metric_type {
                MetricType::Proportion => {
                    let engine_result = stats::analyze_proportion(
                        experiment.analysis_engine.clone(),
                        control_data.successes,
                        control_data.total,
                        treatment_data.successes,
                        treatment_data.total,
                        tau_sq,
                        alpha,
                    )?;
                    StatisticalResult {
                        experiment_id,
                        variant_a: control_variant.name.clone(),
                        variant_b: variant.name.clone(),
                        metric_name: experiment.primary_metric.clone(),
                        sample_size_a: control_data.total,
                        sample_size_b: treatment_data.total,
                        mean_a: control_data.mean,
                        mean_b: treatment_data.mean,
                        std_dev_a: None,
                        std_dev_b: None,
                        effect_size: engine_result.effect_size,
                        p_value: engine_result.p_value,
                        bayes_probability: engine_result.bayes_probability,
                        e_value: engine_result.e_value,
                        sequential_threshold: engine_result.sequential_threshold,
                        confidence_interval_lower: engine_result.ci_low,
                        confidence_interval_upper: engine_result.ci_high,
                        is_significant: engine_result.is_significant(alpha),
                        test_type: engine_result.test_type,
                        analysis_engine: experiment.analysis_engine.clone(),
                        calculated_at: Utc::now(),
                    }
                }
                MetricType::Continuous | MetricType::Count => {
                    let engine_result = stats::analyze_continuous(
                        experiment.analysis_engine.clone(),
                        control_data.mean,
                        control_data.std_dev,
                        control_data.total,
                        treatment_data.mean,
                        treatment_data.std_dev,
                        treatment_data.total,
                        tau_sq,
                        alpha,
                    )?;
                    StatisticalResult {
                        experiment_id,
                        variant_a: control_variant.name.clone(),
                        variant_b: variant.name.clone(),
                        metric_name: experiment.primary_metric.clone(),
                        sample_size_a: control_data.total,
                        sample_size_b: treatment_data.total,
                        mean_a: control_data.mean,
                        mean_b: treatment_data.mean,
                        std_dev_a: Some(control_data.std_dev),
                        std_dev_b: Some(treatment_data.std_dev),
                        effect_size: engine_result.effect_size,
                        p_value: engine_result.p_value,
                        bayes_probability: engine_result.bayes_probability,
                        e_value: engine_result.e_value,
                        sequential_threshold: engine_result.sequential_threshold,
                        confidence_interval_lower: engine_result.ci_low,
                        confidence_interval_upper: engine_result.ci_high,
                        is_significant: engine_result.is_significant(alpha),
                        test_type: engine_result.test_type,
                        analysis_engine: experiment.analysis_engine.clone(),
                        calculated_at: Utc::now(),
                    }
                }
            };

            results.push(result);
            sample_sizes.push(VariantSampleSize {
                variant: variant.name.clone(),
                current_size: treatment_data.total,
                required_size: experiment
                    .hypothesis
                    .as_ref()
                    .unwrap()
                    .minimum_sample_size
                    .unwrap_or(0),
            });
        }

        // Include control variant in sample sizes
        let required_size = experiment
            .hypothesis
            .as_ref()
            .unwrap()
            .minimum_sample_size
            .unwrap_or(0);
        let control_current = variant_data
            .get(&control_variant.name)
            .map(|d| d.total)
            .unwrap_or(0);
        sample_sizes.insert(
            0,
            VariantSampleSize {
                variant: control_variant.name.clone(),
                current_size: control_current,
                required_size,
            },
        );

        let health_checks = self.evaluate_health_checks(&experiment).await?;

        Ok(ExperimentAnalysisResponse {
            experiment,
            results,
            sample_sizes,
            health_checks,
            cuped_adjusted_results: None,
        })
    }

    async fn upsert_experiment(&self, experiment: &Experiment) -> Result<()> {
        let variants_json = serde_json::to_value(&experiment.variants)?;
        let user_groups_json = serde_json::to_value(&experiment.user_groups)?;
        let health_checks_json = serde_json::to_value(&experiment.health_checks)?;
        let hypothesis_json = experiment
            .hypothesis
            .as_ref()
            .map(|h| serde_json::to_value(h))
            .transpose()?;

        let status = format!("{:?}", experiment.status).to_lowercase();
        let experiment_type = format!("{:?}", experiment.experiment_type).to_lowercase();
        let sampling_method = format!("{:?}", experiment.sampling_method).to_lowercase();
        let analysis_engine = format!("{:?}", experiment.analysis_engine).to_lowercase();

        sqlx::query(
            r#"INSERT INTO experiments
                (id, account_id, name, description, status, experiment_type,
                 sampling_method, analysis_engine, sampling_seed,
                 feature_flag_id, feature_gate_id, health_checks, hypothesis,
                 variants, user_groups, primary_metric,
                 start_date, end_date, requires_existing_users, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                       $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
               ON CONFLICT (id) DO UPDATE SET
                 name                    = EXCLUDED.name,
                 description             = EXCLUDED.description,
                 status                  = EXCLUDED.status,
                 experiment_type         = EXCLUDED.experiment_type,
                 sampling_method         = EXCLUDED.sampling_method,
                 analysis_engine         = EXCLUDED.analysis_engine,
                 sampling_seed           = EXCLUDED.sampling_seed,
                 feature_flag_id         = EXCLUDED.feature_flag_id,
                 feature_gate_id         = EXCLUDED.feature_gate_id,
                 health_checks           = EXCLUDED.health_checks,
                 hypothesis              = EXCLUDED.hypothesis,
                 variants                = EXCLUDED.variants,
                 user_groups             = EXCLUDED.user_groups,
                 primary_metric          = EXCLUDED.primary_metric,
                 start_date              = EXCLUDED.start_date,
                 end_date                = EXCLUDED.end_date,
                 requires_existing_users = EXCLUDED.requires_existing_users,
                 updated_at              = EXCLUDED.updated_at"#,
        )
        .bind(experiment.id)
        .bind(experiment.account_id)
        .bind(&experiment.name)
        .bind(&experiment.description)
        .bind(status)
        .bind(experiment_type)
        .bind(sampling_method)
        .bind(analysis_engine)
        .bind(experiment.sampling_seed as i64)
        .bind(experiment.feature_flag_id)
        .bind(experiment.feature_gate_id)
        .bind(health_checks_json)
        .bind(hypothesis_json)
        .bind(variants_json)
        .bind(user_groups_json)
        .bind(&experiment.primary_metric)
        .bind(experiment.start_date)
        .bind(experiment.end_date)
        .bind(experiment.requires_existing_users)
        .bind(experiment.created_at)
        .bind(experiment.updated_at)
        .execute(&self.pg)
        .await
        .context("Failed to upsert experiment")?;

        Ok(())
    }

    /// Fetch variant metrics from ClickHouse (user_assignments + metric_events stay in CH)
    async fn get_variant_metrics(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<std::collections::HashMap<String, VariantMetrics>> {
        info!(
            "Fetching real-time metrics for experiment: {}",
            experiment_id
        );

        #[derive(Debug, clickhouse::Row, serde::Deserialize)]
        struct VariantMetricsRow {
            variant: String,
            total: u64,
            successes: u64,
            mean: f64,
            std_dev: f64,
        }

        let assignment_rows = self
            .ch
            .client()
            .query(
                "SELECT
                    variant,
                    toUInt64(uniq(user_id)) as total,
                    toUInt64(0) as successes,
                    toFloat64(0.0) as mean,
                    toFloat64(0.0) as std_dev
                FROM user_assignments FINAL
                WHERE experiment_id = ? AND account_id = ?
                GROUP BY variant",
            )
            .bind(experiment_id.to_string())
            .bind(account_id.to_string())
            .fetch_all::<VariantMetricsRow>()
            .await
            .context("Failed to fetch assignment counts from ClickHouse")?;

        let event_rows = self
            .ch
            .client()
            .query(
                "SELECT
                    variant,
                    toUInt64(uniq(user_id)) as total,
                    toUInt64(uniqIf(user_id, metric_value > 0)) as successes,
                    toFloat64(avg(metric_value)) as mean,
                    toFloat64(stddevPop(metric_value)) as std_dev
                FROM metric_events
                WHERE experiment_id = ? AND account_id = ?
                GROUP BY variant",
            )
            .bind(experiment_id.to_string())
            .bind(account_id.to_string())
            .fetch_all::<VariantMetricsRow>()
            .await
            .context("Failed to fetch event metrics from ClickHouse")?;

        let mut map = std::collections::HashMap::new();

        for row in assignment_rows {
            map.insert(
                row.variant,
                VariantMetrics {
                    total: row.total as usize,
                    successes: 0,
                    mean: 0.0,
                    std_dev: 0.0,
                    values: vec![],
                },
            );
        }

        for row in event_rows {
            let metrics = map.entry(row.variant).or_insert(VariantMetrics {
                total: 0,
                successes: 0,
                mean: 0.0,
                std_dev: 0.0,
                values: vec![],
            });
            metrics.successes = row.successes as usize;
            metrics.mean = row.mean;
            metrics.std_dev = row.std_dev;
        }

        // Ensure all experiment variants appear in map (even if no data yet)
        let experiment = self.get_experiment(account_id, experiment_id).await?;
        for variant in experiment.variants {
            map.entry(variant.name).or_insert(VariantMetrics {
                total: 0,
                successes: 0,
                mean: 0.0,
                std_dev: 0.0,
                values: vec![],
            });
        }

        Ok(map)
    }

    pub async fn get_variant_activity(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Vec<VariantActivityBucket>> {
        #[derive(clickhouse::Row, serde::Deserialize)]
        struct Row {
            variant: String,
            event_name: String,
            bucket: u32,
            event_count: u64,
        }

        let exp_str = experiment_id.to_string();
        let acc_str = account_id.to_string();

        // Join activity_events through sessions (which carries experiment_id) and
        // then user_assignments (which carries variant).  Direct join on
        // activity_events.user_id is unreliable because that column is Nullable.
        let rows = self
            .ch
            .client()
            .query(&format!(
                "SELECT
                    sv.variant AS variant,
                    ae.event_name,
                    toUInt32(intDiv(toUnixTimestamp(ae.timestamp), 300) * 300) AS bucket,
                    toUInt64(count(*)) AS event_count
                 FROM activity_events ae
                 INNER JOIN (
                     SELECT s.session_id, ua.variant
                     FROM (
                         SELECT session_id, assumeNotNull(user_id) AS user_id
                         FROM sessions FINAL
                         WHERE experiment_id = '{exp_str}'
                           AND user_id IS NOT NULL
                     ) s
                     INNER JOIN (
                         SELECT user_id, variant
                         FROM user_assignments FINAL
                         WHERE experiment_id = '{exp_str}' AND account_id = '{acc_str}'
                     ) ua ON s.user_id = ua.user_id
                 ) sv ON ae.session_id = sv.session_id
                 GROUP BY variant, ae.event_name, bucket
                 ORDER BY bucket ASC"
            ))
            .fetch_all::<Row>()
            .await
            .context("Failed to fetch variant activity")?;

        Ok(rows
            .iter()
            .map(|r| VariantActivityBucket {
                variant: r.variant.clone(),
                event_name: r.event_name.clone(),
                bucket: r.bucket,
                event_count: r.event_count,
            })
            .collect())
    }

    async fn evaluate_health_checks(
        &self,
        experiment: &Experiment,
    ) -> Result<Vec<HealthCheckResult>> {
        #[derive(Debug, clickhouse::Row, serde::Deserialize)]
        struct MetricAggregateRow {
            mean: Option<f64>,
        }

        let mut results = Vec::new();

        for check in &experiment.health_checks {
            let row = self
                .ch
                .client()
                .query(
                    "SELECT avg(metric_value) as mean
                    FROM metric_events
                    WHERE experiment_id = ? AND metric_name = ?",
                )
                .bind(experiment.id.to_string())
                .bind(check.metric_name.clone())
                .fetch_one::<MetricAggregateRow>()
                .await
                .unwrap_or(MetricAggregateRow { mean: None });

            let current_value = row.mean;
            let is_passing = match (check.direction.clone(), current_value) {
                (_, None) => false,
                (HealthCheckDirection::AtLeast, Some(v)) => {
                    check.min.map(|min| v >= min).unwrap_or(false)
                }
                (HealthCheckDirection::AtMost, Some(v)) => {
                    check.max.map(|max| v <= max).unwrap_or(false)
                }
                (HealthCheckDirection::Between, Some(v)) => {
                    check.min.map(|min| v >= min).unwrap_or(false)
                        && check.max.map(|max| v <= max).unwrap_or(false)
                }
            };

            results.push(HealthCheckResult {
                metric_name: check.metric_name.clone(),
                direction: check.direction.clone(),
                min: check.min,
                max: check.max,
                current_value,
                is_passing,
            });
        }

        Ok(results)
    }
}

// ---------------------------------------------------------------------------
// Row types (plain structs for sqlx::query_as!)
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
pub struct ExperimentRow {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub description: String,
    pub status: String,
    pub experiment_type: String,
    pub sampling_method: String,
    pub analysis_engine: String,
    pub sampling_seed: i64,
    pub feature_flag_id: Option<Uuid>,
    pub feature_gate_id: Option<Uuid>,
    pub health_checks: Option<String>,
    pub hypothesis: Option<String>,
    pub variants: Option<String>,
    pub user_groups: Option<String>,
    pub primary_metric: String,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub jira_issue_key: Option<String>,
    pub requires_existing_users: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn row_to_experiment(row: ExperimentRow) -> Result<Experiment> {
    let variants: Vec<Variant> = serde_json::from_str(row.variants.as_deref().unwrap_or("[]"))?;
    let user_groups: Vec<Uuid> = serde_json::from_str(row.user_groups.as_deref().unwrap_or("[]"))?;
    let health_checks: Vec<HealthCheck> =
        serde_json::from_str(row.health_checks.as_deref().unwrap_or("[]")).unwrap_or_default();

    let status = match row.status.as_str() {
        "running" => ExperimentStatus::Running,
        "paused" => ExperimentStatus::Paused,
        "stopped" => ExperimentStatus::Stopped,
        _ => ExperimentStatus::Draft,
    };

    let experiment_type = match row.experiment_type.as_str() {
        "multivariate" => ExperimentType::Multivariate,
        "featuregate" | "feature_gate" => ExperimentType::FeatureGate,
        "holdout" => ExperimentType::Holdout,
        _ => ExperimentType::AbTest,
    };

    let sampling_method = match row.sampling_method.as_str() {
        "random" => SamplingMethod::Random,
        "stratified" => SamplingMethod::Stratified,
        _ => SamplingMethod::Hash,
    };

    let analysis_engine = match row.analysis_engine.as_str() {
        "bayesian" => AnalysisEngine::Bayesian,
        "sequential" => AnalysisEngine::Sequential,
        _ => AnalysisEngine::Frequentist,
    };

    let hypothesis: Option<Hypothesis> = row
        .hypothesis
        .as_deref()
        .filter(|s| !s.is_empty() && *s != "null")
        .and_then(|s| serde_json::from_str(s).ok());

    Ok(Experiment {
        account_id: row.account_id,
        id: row.id,
        name: row.name,
        description: row.description,
        status,
        experiment_type,
        sampling_method,
        analysis_engine,
        sampling_seed: row.sampling_seed as u64,
        feature_flag_id: row.feature_flag_id,
        feature_gate_id: row.feature_gate_id,
        health_checks,
        hypothesis,
        variants,
        user_groups,
        primary_metric: row.primary_metric,
        start_date: row.start_date,
        end_date: row.end_date,
        jira_issue_key: row.jira_issue_key,
        requires_existing_users: row.requires_existing_users,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[derive(Debug, serde::Serialize)]
pub struct VariantActivityBucket {
    pub variant: String,
    pub event_name: String,
    pub bucket: u32,
    pub event_count: u64,
}

#[derive(Debug)]
struct VariantMetrics {
    total: usize,
    successes: usize,
    mean: f64,
    std_dev: f64,
    values: Vec<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_variants() {
        let variants = vec![
            Variant {
                name: "Control".to_string(),
                description: "".to_string(),
                allocation_percent: 50.0,
                is_control: true,
            },
            Variant {
                name: "Treatment".to_string(),
                description: "".to_string(),
                allocation_percent: 50.0,
                is_control: false,
            },
        ];

        let total: f64 = variants.iter().map(|v| v.allocation_percent).sum();
        assert!((total - 100.0).abs() < 0.01);
    }
}
