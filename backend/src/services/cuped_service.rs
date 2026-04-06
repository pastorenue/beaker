use crate::db::ClickHouseClient;
use crate::models::*;
use crate::stats;
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use log::info;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub struct CupedService {
    pg: PgPool,
    ch: ClickHouseClient,
}

impl CupedService {
    pub fn new(pg: PgPool, ch: ClickHouseClient) -> Self {
        Self { pg, ch }
    }

    /// Save or update CUPED configuration for an experiment (stored in Postgres)
    pub async fn save_config(
        &self,
        experiment_id: Uuid,
        req: CupedConfigRequest,
    ) -> Result<CupedConfig> {
        let now = Utc::now();
        let config = CupedConfig {
            experiment_id,
            covariate_metric: req.covariate_metric,
            lookback_days: req.lookback_days.unwrap_or(30),
            min_sample_size: req.min_sample_size.unwrap_or(100).max(100),
            created_at: now,
            updated_at: now,
        };

        sqlx::query(
            r#"INSERT INTO cuped_configs
                (experiment_id, covariate_metric, lookback_days, min_sample_size, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (experiment_id) DO UPDATE SET
                 covariate_metric = EXCLUDED.covariate_metric,
                 lookback_days    = EXCLUDED.lookback_days,
                 min_sample_size  = EXCLUDED.min_sample_size,
                 updated_at       = EXCLUDED.updated_at"#,
        )
        .bind(config.experiment_id)
        .bind(&config.covariate_metric)
        .bind(config.lookback_days as i32)
        .bind(config.min_sample_size as i64)
        .bind(config.created_at)
        .bind(config.updated_at)
        .execute(&self.pg)
        .await
        .context("Failed to upsert CUPED config")?;

        info!(
            "Saved CUPED config for experiment {}: covariate={}, lookback={}d",
            experiment_id, config.covariate_metric, config.lookback_days
        );

        Ok(config)
    }

    /// Get CUPED configuration for an experiment from Postgres
    pub async fn get_config(&self, experiment_id: Uuid) -> Result<CupedConfig> {
        #[derive(sqlx::FromRow)]
        struct Row {
            experiment_id: Uuid,
            covariate_metric: String,
            lookback_days: i32,
            min_sample_size: i64,
            created_at: DateTime<Utc>,
            updated_at: DateTime<Utc>,
        }

        let r = sqlx::query_as::<_, Row>(
            r#"SELECT experiment_id, covariate_metric, lookback_days, min_sample_size, created_at, updated_at
               FROM cuped_configs
               WHERE experiment_id = $1"#,
        )
        .bind(experiment_id)
        .fetch_one(&self.pg)
        .await
        .context("No CUPED configuration found for this experiment")?;

        Ok(CupedConfig {
            experiment_id: r.experiment_id,
            covariate_metric: r.covariate_metric,
            lookback_days: r.lookback_days as u32,
            min_sample_size: r.min_sample_size as usize,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }

    /// Run CUPED analysis for an experiment.
    ///
    /// 1. Fetches the CUPED config (covariate metric, lookback window) from Postgres
    /// 2. Queries pre-experiment covariate data per user per variant from ClickHouse
    /// 3. Queries post-experiment metric data per user per variant from ClickHouse
    /// 4. Matches users appearing in both datasets
    /// 5. Runs CupedCalculator per variant pair (control vs treatment)
    /// 6. Returns CUPED-adjusted results
    pub async fn run_cuped_analysis(
        &self,
        experiment_id: Uuid,
        experiment: &Experiment,
    ) -> Result<Vec<CupedAdjustedResult>> {
        let config = self.get_config(experiment_id).await.map_err(|_| {
            anyhow!(
                "CUPED is not configured for experiment {}. \n
                 POST to /api/experiments/{}/cuped/config first.",
                experiment_id,
                experiment_id
            )
        })?;

        let start_date = experiment.start_date.ok_or_else(|| {
            anyhow!("Experiment has not started yet — no pre-experiment data boundary")
        })?;

        let control_variant = experiment
            .variants
            .iter()
            .find(|v| v.is_control)
            .ok_or_else(|| anyhow!("No control variant found"))?;

        let mut results = Vec::new();

        for variant in experiment.variants.iter().filter(|v| !v.is_control) {
            let pre_control = self
                .fetch_user_metrics(
                    experiment_id,
                    &control_variant.name,
                    &config.covariate_metric,
                    None,
                    Some(start_date),
                    config.lookback_days,
                )
                .await?;

            let pre_treatment = self
                .fetch_user_metrics(
                    experiment_id,
                    &variant.name,
                    &config.covariate_metric,
                    None,
                    Some(start_date),
                    config.lookback_days,
                )
                .await?;

            let post_control = self
                .fetch_user_metrics(
                    experiment_id,
                    &control_variant.name,
                    &experiment.primary_metric,
                    Some(start_date),
                    None,
                    0,
                )
                .await?;

            let post_treatment = self
                .fetch_user_metrics(
                    experiment_id,
                    &variant.name,
                    &experiment.primary_metric,
                    Some(start_date),
                    None,
                    0,
                )
                .await?;

            let (matched_pre_a, matched_post_a) =
                Self::match_user_data(&pre_control, &post_control);
            let (matched_pre_b, matched_post_b) =
                Self::match_user_data(&pre_treatment, &post_treatment);

            if matched_pre_a.len() < config.min_sample_size {
                return Err(anyhow!(
                    "Insufficient matched users for control variant '{}': {} (minimum {})",
                    control_variant.name,
                    matched_pre_a.len(),
                    config.min_sample_size
                ));
            }
            if matched_pre_b.len() < config.min_sample_size {
                return Err(anyhow!(
                    "Insufficient matched users for treatment variant '{}': {} (minimum {})",
                    variant.name,
                    matched_pre_b.len(),
                    config.min_sample_size
                ));
            }

            let calc_a = stats::CupedCalculator::new(matched_pre_a, matched_post_a.clone())?;
            let calc_b = stats::CupedCalculator::new(matched_pre_b, matched_post_b.clone())?;

            let adj_a = calc_a.run();
            let adj_b = calc_b.run();

            let (tau_sq, alpha) = experiment
                .hypothesis
                .as_ref()
                .map(|h| (h.expected_effect_size.powi(2), h.significance_level))
                .unwrap_or((0.01, 0.05));

            let engine_result = stats::analyze_continuous(
                experiment.analysis_engine.clone(),
                adj_a.adjusted_mean,
                adj_a.adjusted_std_dev,
                adj_a.n_matched_users,
                adj_b.adjusted_mean,
                adj_b.adjusted_std_dev,
                adj_b.n_matched_users,
                tau_sq,
                alpha,
            )?;

            let avg_variance_reduction =
                (adj_a.variance_reduction_percent + adj_b.variance_reduction_percent) / 2.0;

            results.push(CupedAdjustedResult {
                variant_a: control_variant.name.clone(),
                variant_b: variant.name.clone(),
                metric_name: experiment.primary_metric.clone(),
                theta: (adj_a.theta + adj_b.theta) / 2.0,
                adjusted_mean_a: adj_a.adjusted_mean,
                adjusted_mean_b: adj_b.adjusted_mean,
                adjusted_effect_size: engine_result.effect_size,
                adjusted_p_value: engine_result.p_value,
                adjusted_ci_lower: engine_result.ci_low,
                adjusted_ci_upper: engine_result.ci_high,
                variance_reduction_percent: avg_variance_reduction,
                original_variance_a: adj_a.original_std_dev.powi(2),
                original_variance_b: adj_b.original_std_dev.powi(2),
                adjusted_variance_a: adj_a.adjusted_std_dev.powi(2),
                adjusted_variance_b: adj_b.adjusted_std_dev.powi(2),
                is_significant: engine_result.p_value < 0.05,
                n_matched_users_a: adj_a.n_matched_users,
                n_matched_users_b: adj_b.n_matched_users,
            });
        }

        Ok(results)
    }

    /// Fetch per-user metric values from metric_events (ClickHouse) with optional time bounds.
    async fn fetch_user_metrics(
        &self,
        experiment_id: Uuid,
        variant: &str,
        metric_name: &str,
        after: Option<DateTime<Utc>>,
        before: Option<DateTime<Utc>>,
        lookback_days: u32,
    ) -> Result<HashMap<String, f64>> {
        let mut query = String::from(
            "SELECT
                user_id,
                toFloat64(avg(metric_value)) as metric_value
            FROM metric_events
            WHERE experiment_id = ?
              AND variant = ?
              AND metric_name = ?",
        );

        if let Some(before_dt) = before {
            query.push_str(&format!(
                " AND timestamp < toDateTime({})",
                before_dt.timestamp()
            ));
            if lookback_days > 0 {
                query.push_str(&format!(
                    " AND timestamp >= toDateTime({}) - INTERVAL {} DAY",
                    before_dt.timestamp(),
                    lookback_days
                ));
            }
        }

        if let Some(after_dt) = after {
            query.push_str(&format!(
                " AND timestamp >= toDateTime({})",
                after_dt.timestamp()
            ));
        }

        query.push_str(" GROUP BY user_id");

        #[derive(Debug, clickhouse::Row, serde::Deserialize)]
        struct UserMetricRow {
            user_id: String,
            metric_value: f64,
        }

        let rows = self
            .ch
            .client()
            .query(&query)
            .bind(experiment_id.to_string())
            .bind(variant.to_string())
            .bind(metric_name.to_string())
            .fetch_all::<UserMetricRow>()
            .await
            .context("Failed to fetch user metrics for CUPED analysis")?;

        Ok(rows
            .into_iter()
            .map(|r| (r.user_id, r.metric_value))
            .collect())
    }

    fn match_user_data(
        pre: &HashMap<String, f64>,
        post: &HashMap<String, f64>,
    ) -> (Vec<f64>, Vec<f64>) {
        let mut pre_matched = Vec::new();
        let mut post_matched = Vec::new();

        for (user_id, pre_value) in pre {
            if let Some(post_value) = post.get(user_id) {
                pre_matched.push(*pre_value);
                post_matched.push(*post_value);
            }
        }

        (pre_matched, post_matched)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_user_data_overlap() {
        let mut pre = HashMap::new();
        pre.insert("user1".to_string(), 10.0);
        pre.insert("user2".to_string(), 20.0);
        pre.insert("user3".to_string(), 30.0);

        let mut post = HashMap::new();
        post.insert("user1".to_string(), 15.0);
        post.insert("user3".to_string(), 35.0);
        post.insert("user4".to_string(), 40.0);

        let (matched_pre, matched_post) = CupedService::match_user_data(&pre, &post);

        assert_eq!(matched_pre.len(), 2);
        assert_eq!(matched_post.len(), 2);
        assert!(matched_pre.contains(&10.0));
        assert!(matched_pre.contains(&30.0));
        assert!(matched_post.contains(&15.0));
        assert!(matched_post.contains(&35.0));
    }

    #[test]
    fn test_match_user_data_no_overlap() {
        let mut pre = HashMap::new();
        pre.insert("user1".to_string(), 10.0);
        let mut post = HashMap::new();
        post.insert("user2".to_string(), 20.0);

        let (matched_pre, matched_post) = CupedService::match_user_data(&pre, &post);
        assert!(matched_pre.is_empty());
        assert!(matched_post.is_empty());
    }

    #[test]
    fn test_match_user_data_empty() {
        let pre: HashMap<String, f64> = HashMap::new();
        let post: HashMap<String, f64> = HashMap::new();
        let (matched_pre, matched_post) = CupedService::match_user_data(&pre, &post);
        assert!(matched_pre.is_empty());
        assert!(matched_post.is_empty());
    }
}
