use crate::db::ClickHouseClient;
use crate::models::*;
use anyhow::{Context, Result};
use chrono::{DateTime, Duration, TimeZone, Utc};
use log::error;
use sqlx::PgPool;
use statrs::distribution::{ChiSquared, ContinuousCDF};
use uuid::Uuid;

#[derive(clickhouse::Row, serde::Deserialize)]
struct CountRow {
    total: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct TimeCountRow {
    bucket: u32,
    total: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct MetricNameRow {
    metric_name: String,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct DayMetricRow {
    day: u32,
    conversion: Option<f64>,
    revenue: Option<f64>,
    retention: Option<f64>,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct MetricDailyRow {
    day: u32,
    metric_name: String,
    value: f64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct ExperimentIdRow {
    experiment_id: String,
    total: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct VariantCountRow {
    variant: String,
    total: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct AnalyticsAlertRow {
    title: String,
    severity: String,
    detail: String,
    created_at: u32,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct AnalyticsAlertCountRow {
    day: u32,
    critical: u64,
    warning: u64,
    info: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct MetricFreshnessRow {
    metric_name: String,
    last_ts: u32,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct ExperimentRowSlim {
    id: String,
    name: String,
    variants: String,
    health_checks: String,
    primary_metric: String,
}

#[derive(sqlx::FromRow)]
struct UserGroupRowSlim {
    id: uuid::Uuid,
    name: String,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct SegmentRow {
    group_id: String,
    users: u64,
    conversions: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct OverallRow {
    users: u64,
    conversions: u64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct FreshnessRow {
    last_ts: Option<u32>,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct AvgRow {
    value: f64,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct RateRow {
    total: u64,
    errors: u64,
}

pub struct AnalyticsService {
    db: ClickHouseClient,
    pg: PgPool,
}

impl AnalyticsService {
    pub fn new(db: ClickHouseClient, pg: PgPool) -> Self {
        Self { db, pg }
    }

    pub async fn get_overview(&self) -> Result<AnalyticsOverviewResponse> {
        let now = Utc::now();
        let summary = match self.build_summary(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics summary error: {}", err);
                AnalyticsSummary {
                    active_experiments: 0,
                    active_experiments_delta: 0,
                    daily_exposures: 0,
                    exposures_delta_percent: 0.0,
                    primary_conversion_rate: 0.0,
                    primary_conversion_delta_pp: 0.0,
                    guardrail_breaches: 0,
                    guardrail_breaches_detail: "Unavailable".to_string(),
                    environment: "Production".to_string(),
                    data_freshness_seconds: 0,
                    last_updated: now,
                }
            }
        };

        let throughput = match self.build_throughput(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics throughput error: {}", err);
                Vec::new()
            }
        };

        let (metric_coverage, metric_coverage_totals) = match self.build_metric_coverage().await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics metric coverage error: {}", err);
                (
                    vec![
                        AnalyticsMetricCoverageSlice {
                            name: "Primary".to_string(),
                            value: 0,
                        },
                        AnalyticsMetricCoverageSlice {
                            name: "Guardrail".to_string(),
                            value: 0,
                        },
                        AnalyticsMetricCoverageSlice {
                            name: "Diagnostic".to_string(),
                            value: 0,
                        },
                        AnalyticsMetricCoverageSlice {
                            name: "Feature Impact".to_string(),
                            value: 0,
                        },
                    ],
                    AnalyticsMetricCoverageTotals {
                        total_metrics: 0,
                        guardrails: 0,
                        diagnostics: 0,
                        holdout_metrics: 0,
                    },
                )
            }
        };

        let primary_metric_trend = match self.build_primary_trend(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics primary trend error: {}", err);
                Vec::new()
            }
        };

        let guardrail_health = match self.build_guardrail_health(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics guardrail error: {}", err);
                Vec::new()
            }
        };

        let srm = match self.build_srm(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics SRM error: {}", err);
                AnalyticsSrmResponse {
                    variants: Vec::new(),
                    summary: AnalyticsSrmSummary {
                        p_value: 1.0,
                        allocation_drift: 0.0,
                        experiment_id: None,
                        experiment_name: None,
                    },
                }
            }
        };

        let funnel = match self.build_funnel(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics funnel error: {}", err);
                Vec::new()
            }
        };

        let anomaly_alerts = match self.build_anomaly_alerts(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics anomaly error: {}", err);
                Vec::new()
            }
        };

        let segment_lift = match self.build_segment_lift(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics segment lift error: {}", err);
                Vec::new()
            }
        };

        let metric_inventory = match self.build_metric_inventory(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics inventory error: {}", err);
                Vec::new()
            }
        };

        let alert_feed = match self.build_alert_feed(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics alert feed error: {}", err);
                Vec::new()
            }
        };

        let system_health = match self.build_system_health(now).await {
            Ok(value) => value,
            Err(err) => {
                error!("Analytics system health error: {}", err);
                AnalyticsSystemHealth {
                    data_freshness_seconds: 0,
                    sdk_error_rate: 0.0,
                    evaluation_latency_ms: 0.0,
                }
            }
        };

        Ok(AnalyticsOverviewResponse {
            summary,
            throughput,
            metric_coverage,
            metric_coverage_totals,
            primary_metric_trend,
            guardrail_health,
            srm,
            funnel,
            anomaly_alerts,
            segment_lift,
            metric_inventory,
            alert_feed,
            system_health,
        })
    }

    pub async fn ingest_alert(&self, req: AnalyticsAlertRequest) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        self.db
            .client()
            .query(
                "INSERT INTO analytics_alerts (id, title, severity, detail, experiment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(id)
            .bind(req.title)
            .bind(req.severity)
            .bind(req.detail)
            .bind(req.experiment_id.map(|id| id.to_string()))
            .bind(Utc::now().timestamp() as u32)
            .execute()
            .await?;
        Ok(())
    }

    async fn build_summary(&self, now: DateTime<Utc>) -> Result<AnalyticsSummary> {
        let active_count: (i64,) =
            sqlx::query_as("SELECT count(*) FROM experiments WHERE status = 'running'")
                .fetch_one(&self.pg)
                .await?;

        let active_delta: (i64,) = sqlx::query_as("SELECT count(*) FROM experiments WHERE status = 'running' AND start_date >= now() - INTERVAL '1 day'")
            .fetch_one(&self.pg)
            .await?;

        let active_total = active_count.0 as u64;
        let active_delta_val = active_delta.0;

        let exposure_today = self
            .db
            .client()
            .query("SELECT count() as total FROM user_assignments WHERE assigned_at >= now() - INTERVAL 1 DAY")
            .fetch_one::<CountRow>()
            .await
            .context("Failed to count daily exposures")?;

        let exposure_prev = self
            .db
            .client()
            .query(
                "SELECT count() as total FROM user_assignments WHERE assigned_at >= now() - INTERVAL 2 DAY AND assigned_at < now() - INTERVAL 1 DAY",
            )
            .fetch_one::<CountRow>()
            .await
            .context("Failed to count previous exposures")?;

        let exposures_delta_percent = if exposure_prev.total == 0 {
            0.0
        } else {
            (exposure_today.total as f64 - exposure_prev.total as f64) / exposure_prev.total as f64
                * 100.0
        };

        let conversion_row = self
            .db
            .client()
            .query(
                "SELECT avgIf(metric_value, metric_name = 'conversion') as value FROM metric_events WHERE timestamp >= now() - INTERVAL 1 DAY",
            )
            .fetch_one::<AvgRow>()
            .await
            .context("Failed to fetch conversion rate")?;

        let conversion_prev = self
            .db
            .client()
            .query(
                "SELECT avgIf(metric_value, metric_name = 'conversion') as value FROM metric_events WHERE timestamp >= now() - INTERVAL 2 DAY AND timestamp < now() - INTERVAL 1 DAY",
            )
            .fetch_one::<AvgRow>()
            .await
            .context("Failed to fetch previous conversion rate")?;

        let current_conversion = if conversion_row.value.is_nan() { 0.0 } else { conversion_row.value };
        let prev_conversion = if conversion_prev.value.is_nan() { 0.0 } else { conversion_prev.value };

        let (guardrail_breaches, guardrail_detail) = self
            .evaluate_guardrails(now)
            .await
            .unwrap_or((0, "No breaches".to_string()));

        let data_freshness_seconds = self.data_freshness_seconds(now).await.unwrap_or(0);

        Ok(AnalyticsSummary {
            active_experiments: active_total,
            active_experiments_delta: active_delta_val,
            daily_exposures: exposure_today.total,
            exposures_delta_percent,
            primary_conversion_rate: current_conversion,
            primary_conversion_delta_pp: (current_conversion - prev_conversion) * 100.0,
            guardrail_breaches,
            guardrail_breaches_detail: guardrail_detail,
            environment: "Production".to_string(),
            data_freshness_seconds,
            last_updated: now,
        })
    }

    async fn build_throughput(&self, now: DateTime<Utc>) -> Result<Vec<AnalyticsThroughputPoint>> {
        let start = now - Duration::hours(24);
        let aligned_start_ts = (start.timestamp() / 10800) * 10800;
        let aligned_start = Utc
            .timestamp_opt(aligned_start_ts, 0)
            .single()
            .unwrap_or(start);
        let assignment_rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfInterval(assigned_at, INTERVAL 3 HOUR)) as bucket, count() as total FROM user_assignments WHERE assigned_at >= toDateTime(?) GROUP BY bucket ORDER BY bucket",
            )
            .bind(aligned_start.timestamp() as u32)
            .fetch_all::<TimeCountRow>()
            .await
            .context("Failed to fetch assignment throughput")?;

        let exposure_rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfInterval(assigned_at, INTERVAL 3 HOUR)) as bucket, toUInt64(uniq(user_id)) as total FROM user_assignments WHERE assigned_at >= toDateTime(?) GROUP BY bucket ORDER BY bucket",
            )
            .bind(aligned_start.timestamp() as u32)
            .fetch_all::<TimeCountRow>()
            .await
            .context("Failed to fetch exposure throughput")?;

        let conversion_rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfInterval(timestamp, INTERVAL 3 HOUR)) as bucket, countIf(metric_value > 0) as total FROM metric_events WHERE timestamp >= toDateTime(?) GROUP BY bucket ORDER BY bucket",
            )
            .bind(aligned_start.timestamp() as u32)
            .fetch_all::<TimeCountRow>()
            .await
            .context("Failed to fetch conversion throughput")?;

        let mut assignment_map = std::collections::HashMap::new();
        for row in assignment_rows {
            assignment_map.insert(row.bucket, row.total);
        }
        let mut exposure_map = std::collections::HashMap::new();
        for row in exposure_rows {
            exposure_map.insert(row.bucket, row.total);
        }
        let mut conversion_map = std::collections::HashMap::new();
        for row in conversion_rows {
            conversion_map.insert(row.bucket, row.total);
        }

        let mut points = Vec::new();
        for idx in 0..8 {
            let bucket_time = aligned_start + Duration::hours(idx * 3);
            let bucket_key = bucket_time.timestamp() as u32;
            let label = bucket_time.format("%H:%M").to_string();
            points.push(AnalyticsThroughputPoint {
                time: label,
                exposures: *exposure_map.get(&bucket_key).unwrap_or(&0),
                assignments: *assignment_map.get(&bucket_key).unwrap_or(&0),
                conversions: *conversion_map.get(&bucket_key).unwrap_or(&0),
            });
        }

        Ok(points)
    }

    async fn build_metric_coverage(
        &self,
    ) -> Result<(
        Vec<AnalyticsMetricCoverageSlice>,
        AnalyticsMetricCoverageTotals,
    )> {
        let rows = self
            .db
            .client()
            .query("SELECT DISTINCT metric_name FROM metric_events")
            .fetch_all::<MetricNameRow>()
            .await
            .context("Failed to fetch metric names")?;

        let mut primary = 0u64;
        let mut guardrail = 0u64;
        let mut diagnostic = 0u64;
        let mut holdout = 0u64;

        for row in rows.iter() {
            let name = row.metric_name.to_lowercase();
            if name.contains("holdout") {
                holdout += 1;
            } else if name.contains("latency")
                || name.contains("error")
                || name.contains("crash")
                || name.contains("timeout")
            {
                guardrail += 1;
            } else if name.contains("conversion")
                || name.contains("activation")
                || name.contains("revenue")
                || name.contains("retention")
            {
                primary += 1;
            } else {
                diagnostic += 1;
            }
        }

        let total = rows.len() as u64;
        let slices = vec![
            AnalyticsMetricCoverageSlice {
                name: "Primary".to_string(),
                value: primary,
            },
            AnalyticsMetricCoverageSlice {
                name: "Guardrail".to_string(),
                value: guardrail,
            },
            AnalyticsMetricCoverageSlice {
                name: "Diagnostic".to_string(),
                value: diagnostic,
            },
            AnalyticsMetricCoverageSlice {
                name: "Feature Impact".to_string(),
                value: holdout,
            },
        ];

        Ok((
            slices,
            AnalyticsMetricCoverageTotals {
                total_metrics: total,
                guardrails: guardrail,
                diagnostics: diagnostic,
                holdout_metrics: holdout,
            },
        ))
    }

    async fn build_primary_trend(
        &self,
        now: DateTime<Utc>,
    ) -> Result<Vec<AnalyticsPrimaryMetricPoint>> {
        let start = now.date_naive() - Duration::days(6);
        let start_ts = Utc
            .from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap())
            .timestamp() as u32;
        let rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfDay(timestamp)) as day,
                        avgIf(metric_value, metric_name = 'conversion') as conversion,
                        avgIf(metric_value, metric_name = 'revenue') as revenue,
                        avgIf(metric_value, metric_name = 'retention') as retention
                 FROM metric_events
                 WHERE timestamp >= toDateTime(?)
                 GROUP BY day
                 ORDER BY day",
            )
            .bind(start_ts)
            .fetch_all::<DayMetricRow>()
            .await
            .context("Failed to fetch primary metric trend")?;

        let mut map = std::collections::HashMap::new();
        for row in rows {
            map.insert(row.day, row);
        }

        let mut points = Vec::new();
        for offset in 0..7 {
            let day = start + Duration::days(offset);
            let ts = Utc
                .from_utc_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
                .timestamp() as u32;
            let label = day.format("%a").to_string();
            let row = map.get(&ts);
            points.push(AnalyticsPrimaryMetricPoint {
                day: label,
                conversion: row.and_then(|r| r.conversion).unwrap_or(0.0),
                revenue: row.and_then(|r| r.revenue).unwrap_or(0.0),
                retention: row.and_then(|r| r.retention).unwrap_or(0.0),
            });
        }

        Ok(points)
    }

    async fn build_guardrail_health(
        &self,
        now: DateTime<Utc>,
    ) -> Result<Vec<AnalyticsGuardrailPoint>> {
        let start = now.date_naive() - Duration::days(6);
        let start_ts = Utc
            .from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap())
            .timestamp() as u32;

        let rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfDay(timestamp)) as day,
                        metric_name,
                        avg(metric_value) as value
                 FROM metric_events
                 WHERE timestamp >= toDateTime(?)
                 GROUP BY day, metric_name
                 ORDER BY day",
            )
            .bind(start_ts)
            .fetch_all::<MetricDailyRow>()
            .await
            .context("Failed to fetch guardrail health")?;

        // Bucket each metric into latency / error_rate / crash_rate by name pattern
        let mut category_map: std::collections::HashMap<(u32, String), Vec<f64>> =
            std::collections::HashMap::new();
        for row in &rows {
            let name = row.metric_name.to_lowercase();
            let category = if name.contains("latency") || name.contains("timeout") || name.contains("response_time") {
                "latency"
            } else if name.contains("error") {
                "error_rate"
            } else if name.contains("crash") {
                "crash_rate"
            } else {
                continue;
            };
            category_map
                .entry((row.day, category.to_string()))
                .or_default()
                .push(row.value);
        }

        let avg_for = |day_ts: u32, cat: &str| -> f64 {
            category_map
                .get(&(day_ts, cat.to_string()))
                .map(|vals| vals.iter().sum::<f64>() / vals.len() as f64)
                .unwrap_or(0.0)
        };

        let mut points = Vec::new();
        for offset in 0..7 {
            let day = start + Duration::days(offset);
            let ts = Utc
                .from_utc_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
                .timestamp() as u32;
            let label = day.format("%a").to_string();
            points.push(AnalyticsGuardrailPoint {
                day: label,
                latency: avg_for(ts, "latency"),
                error_rate: avg_for(ts, "error_rate"),
                crash_rate: avg_for(ts, "crash_rate"),
            });
        }

        Ok(points)
    }

    async fn build_srm(&self, _now: DateTime<Utc>) -> Result<AnalyticsSrmResponse> {
        let experiment_row = self
            .db
            .client()
            .query(
                "SELECT experiment_id, count() as total FROM user_assignments WHERE assigned_at >= now() - INTERVAL 1 DAY GROUP BY experiment_id ORDER BY total DESC LIMIT 1",
            )
            .fetch_optional::<ExperimentIdRow>()
            .await
            .context("Failed to fetch SRM experiment")?;

        let Some(experiment_row) = experiment_row else {
            return Ok(AnalyticsSrmResponse {
                variants: Vec::new(),
                summary: AnalyticsSrmSummary {
                    p_value: 1.0,
                    allocation_drift: 0.0,
                    experiment_id: None,
                    experiment_name: None,
                },
            });
        };

        let experiment_id = Uuid::parse_str(&experiment_row.experiment_id).ok();
        let experiment_id_uuid = experiment_id.unwrap_or(Uuid::nil());
        #[derive(sqlx::FromRow)]
        struct SrmExperimentRow {
            id: Uuid,
            name: String,
            variants: Option<String>,
        }

        let experiment_data = sqlx::query_as::<_, SrmExperimentRow>(
            "SELECT id, name, variants::text FROM experiments WHERE id = $1",
        )
        .bind(experiment_id_uuid)
        .fetch_one(&self.pg)
        .await
        .context("Failed to fetch SRM experiment data")?;

        let variants: Vec<Variant> =
            serde_json::from_str(experiment_data.variants.as_deref().unwrap_or("[]"))
                .unwrap_or_default();
        let mut expected_map = std::collections::HashMap::new();
        for variant in variants.iter() {
            expected_map.insert(variant.name.clone(), variant.allocation_percent);
        }

        let observed_rows = self
            .db
            .client()
            .query(
                "SELECT variant, count() as total FROM user_assignments WHERE experiment_id = ? AND assigned_at >= now() - INTERVAL 1 DAY GROUP BY variant",
            )
            .bind(&experiment_row.experiment_id)
            .fetch_all::<VariantCountRow>()
            .await
            .context("Failed to fetch SRM observed counts")?;

        let mut observed_map = std::collections::HashMap::new();
        for row in observed_rows.iter() {
            observed_map.insert(row.variant.clone(), row.total);
        }
        let total_observed: u64 = observed_map.values().copied().sum();
        if total_observed == 0 {
            return Ok(AnalyticsSrmResponse {
                variants: Vec::new(),
                summary: AnalyticsSrmSummary {
                    p_value: 1.0,
                    allocation_drift: 0.0,
                    experiment_id,
                    experiment_name: Some(experiment_data.name),
                },
            });
        }

        let mut chi_square = 0.0;
        let mut max_drift = 0.0;
        let mut variant_points = Vec::new();

        for variant in variants.iter() {
            let expected_pct = *expected_map.get(&variant.name).unwrap_or(&0.0);
            let expected = expected_pct / 100.0 * total_observed as f64;
            let observed_count = observed_map.get(&variant.name).copied().unwrap_or(0);
            let observed = observed_count as f64;
            if expected > 0.0 {
                chi_square += (observed - expected).powi(2) / expected;
            }
            let observed_pct = observed / total_observed as f64 * 100.0;
            let drift = (observed_pct - expected_pct).abs();
            if drift > max_drift {
                max_drift = drift;
            }
            variant_points.push(AnalyticsSrmVariant {
                variant: variant.name.clone(),
                expected: expected_pct,
                observed: observed_pct,
            });
        }

        let df = (variant_points.len().saturating_sub(1)) as f64;
        let p_value = if df > 0.0 {
            let dist = ChiSquared::new(df).unwrap_or_else(|_| ChiSquared::new(1.0).unwrap());
            1.0 - dist.cdf(chi_square)
        } else {
            1.0
        };

        Ok(AnalyticsSrmResponse {
            variants: variant_points,
            summary: AnalyticsSrmSummary {
                p_value,
                allocation_drift: max_drift,
                experiment_id,
                experiment_name: Some(experiment_data.name),
            },
        })
    }

    async fn build_funnel(&self, _now: DateTime<Utc>) -> Result<Vec<AnalyticsFunnelStep>> {
        let landing = self
            .db
            .client()
            .query(
                "SELECT count() as total FROM sessions WHERE started_at >= now() - INTERVAL 1 DAY",
            )
            .fetch_one::<CountRow>()
            .await
            .unwrap_or(CountRow { total: 0 });

        let signup = self
            .db
            .client()
            .query(
                "SELECT toUInt64(uniq(session_id)) as total FROM activity_events WHERE timestamp >= now() - INTERVAL 1 DAY AND (event_name = 'signup' OR event_type = 'signup')",
            )
            .fetch_one::<CountRow>()
            .await
            .unwrap_or(CountRow { total: 0 });

        let activate = self
            .db
            .client()
            .query(
                "SELECT toUInt64(uniq(session_id)) as total FROM activity_events WHERE timestamp >= now() - INTERVAL 1 DAY AND (event_name = 'activate' OR event_type = 'activate')",
            )
            .fetch_one::<CountRow>()
            .await
            .unwrap_or(CountRow { total: 0 });

        let exposure = self
            .db
            .client()
            .query(
                "SELECT toUInt64(uniq(user_id)) as total FROM user_assignments WHERE assigned_at >= now() - INTERVAL 1 DAY",
            )
            .fetch_one::<CountRow>()
            .await
            .unwrap_or(CountRow { total: 0 });

        let conversion = self
            .db
            .client()
            .query(
                "SELECT toUInt64(uniqIf(user_id, metric_value > 0)) as total FROM metric_events WHERE timestamp >= now() - INTERVAL 1 DAY AND metric_name = 'conversion'",
            )
            .fetch_one::<CountRow>()
            .await
            .unwrap_or(CountRow { total: 0 });

        Ok(vec![
            AnalyticsFunnelStep {
                step: "Landing".to_string(),
                users: landing.total,
            },
            AnalyticsFunnelStep {
                step: "Signup".to_string(),
                users: signup.total,
            },
            AnalyticsFunnelStep {
                step: "Activate".to_string(),
                users: activate.total,
            },
            AnalyticsFunnelStep {
                step: "Experiment Exposure".to_string(),
                users: exposure.total,
            },
            AnalyticsFunnelStep {
                step: "Conversion".to_string(),
                users: conversion.total,
            },
        ])
    }

    async fn build_anomaly_alerts(&self, now: DateTime<Utc>) -> Result<Vec<AnalyticsAnomalyPoint>> {
        let start = now.date_naive() - Duration::days(6);
        let start_ts = Utc
            .from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap())
            .timestamp() as u32;
        let rows = self
            .db
            .client()
            .query(
                "SELECT toUInt32(toStartOfDay(created_at)) as day,
                        countIf(severity = 'critical') as critical,
                        countIf(severity = 'warning') as warning,
                        countIf(severity = 'info') as info
                 FROM analytics_alerts
                 WHERE created_at >= toDateTime(?)
                 GROUP BY day
                 ORDER BY day",
            )
            .bind(start_ts)
            .fetch_all::<AnalyticsAlertCountRow>()
            .await
            .context("Failed to fetch anomaly alerts")?;

        let mut map = std::collections::HashMap::new();
        for row in rows {
            map.insert(row.day, row);
        }

        let mut points = Vec::new();
        for offset in 0..7 {
            let day = start + Duration::days(offset);
            let ts = Utc
                .from_utc_datetime(&day.and_hms_opt(0, 0, 0).unwrap())
                .timestamp() as u32;
            let label = day.format("%a").to_string();
            let row = map.get(&ts);
            points.push(AnalyticsAnomalyPoint {
                day: label,
                critical: row.map(|r| r.critical).unwrap_or(0),
                warning: row.map(|r| r.warning).unwrap_or(0),
                info: row.map(|r| r.info).unwrap_or(0),
            });
        }

        // Merge active guardrail breaches into today's point so the chart
        // reflects breaches even when no alerts have been manually ingested.
        let (breaches, _) = self.evaluate_guardrails(now).await.unwrap_or((0, String::new()));
        if breaches > 0 {
            if let Some(today) = points.last_mut() {
                today.critical = today.critical.saturating_add(breaches);
            }
        }

        Ok(points)
    }

    async fn build_segment_lift(
        &self,
        _now: DateTime<Utc>,
    ) -> Result<Vec<AnalyticsSegmentLiftPoint>> {
        let overall = self
            .db
            .client()
            .query(
                "SELECT toUInt64(uniqIf(me.user_id, me.metric_value > 0)) as conversions,
                        toUInt64(uniq(ua.user_id)) as users
                 FROM user_assignments ua
                 LEFT JOIN metric_events me
                    ON ua.user_id = me.user_id AND ua.experiment_id = me.experiment_id AND me.timestamp >= now() - INTERVAL 7 DAY
                 WHERE ua.assigned_at >= now() - INTERVAL 7 DAY",
            )
            .fetch_one::<OverallRow>()
            .await
            .unwrap_or(OverallRow { users: 0, conversions: 0 });

        let overall_rate = if overall.users == 0 {
            0.0
        } else {
            overall.conversions as f64 / overall.users as f64
        };

        let segment_rows = self
            .db
            .client()
            .query(
                "SELECT ua.group_id as group_id,
                        toUInt64(uniq(ua.user_id)) as users,
                        toUInt64(uniqIf(ua.user_id, me.metric_value > 0)) as conversions
                 FROM user_assignments ua
                 LEFT JOIN metric_events me
                    ON ua.user_id = me.user_id AND ua.experiment_id = me.experiment_id AND me.timestamp >= now() - INTERVAL 7 DAY
                 WHERE ua.assigned_at >= now() - INTERVAL 7 DAY
                 GROUP BY ua.group_id
                 ORDER BY users DESC
                 LIMIT 5",
            )
            .fetch_all::<SegmentRow>()
            .await
            .context("Failed to fetch segment lift")?;

        let group_rows = sqlx::query_as::<_, UserGroupRowSlim>("SELECT id, name FROM user_groups")
            .fetch_all(&self.pg)
            .await
            .unwrap_or_default();

        let mut group_map = std::collections::HashMap::new();
        for row in group_rows {
            group_map.insert(row.id.to_string(), row.name);
        }

        let mut segments = Vec::new();
        for row in segment_rows {
            let rate = if row.users == 0 {
                0.0
            } else {
                row.conversions as f64 / row.users as f64
            };
            let lift = if overall_rate == 0.0 {
                0.0
            } else {
                (rate - overall_rate) / overall_rate * 100.0
            };
            let name = group_map
                .get(&row.group_id)
                .cloned()
                .unwrap_or_else(|| "Segment".to_string());
            segments.push(AnalyticsSegmentLiftPoint {
                segment: name,
                lift,
            });
        }

        Ok(segments)
    }

    async fn build_metric_inventory(
        &self,
        now: DateTime<Utc>,
    ) -> Result<Vec<AnalyticsMetricInventoryItem>> {
        let freshness_rows = self
            .db
            .client()
            .query(
                "SELECT metric_name, toUInt32(max(timestamp)) as last_ts FROM metric_events GROUP BY metric_name",
            )
            .fetch_all::<MetricFreshnessRow>()
            .await
            .context("Failed to fetch metric freshness")?;

        let mut freshness_map = std::collections::HashMap::new();
        for row in freshness_rows {
            freshness_map.insert(row.metric_name.clone(), row.last_ts);
        }

        let experiments = self
            .db
            .client()
            .query(
                "SELECT id, name, variants, health_checks, primary_metric FROM experiments FINAL",
            )
            .fetch_all::<ExperimentRowSlim>()
            .await
            .unwrap_or_default();

        let mut guardrail_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let mut metric_names: std::collections::HashSet<String> = std::collections::HashSet::new();

        for experiment in experiments.iter() {
            metric_names.insert(experiment.primary_metric.clone());
            let checks: Vec<HealthCheck> =
                serde_json::from_str(&experiment.health_checks).unwrap_or_default();
            for check in checks {
                let guardrail = match check.direction {
                    HealthCheckDirection::AtLeast => format!(">= {}", check.min.unwrap_or(0.0)),
                    HealthCheckDirection::AtMost => format!("<= {}", check.max.unwrap_or(0.0)),
                    HealthCheckDirection::Between => format!(
                        "{} - {}",
                        check.min.unwrap_or(0.0),
                        check.max.unwrap_or(0.0)
                    ),
                };
                guardrail_map.insert(check.metric_name.clone(), guardrail);
                metric_names.insert(check.metric_name);
            }
        }

        for metric in freshness_map.keys() {
            metric_names.insert(metric.clone());
        }

        let mut items = Vec::new();
        for metric in metric_names {
            let category = self.classify_metric(&metric);
            let last_ts = freshness_map.get(&metric).copied().unwrap_or(0);
            let freshness_seconds = if last_ts == 0 {
                0
            } else {
                now.timestamp().saturating_sub(last_ts as i64) as u64
            };
            let status = if freshness_seconds == 0 {
                "Delayed"
            } else if freshness_seconds <= 120 {
                "Healthy"
            } else if freshness_seconds <= 600 {
                "Degraded"
            } else {
                "Delayed"
            };

            items.push(AnalyticsMetricInventoryItem {
                name: metric.clone(),
                category,
                freshness_seconds,
                owner: "Platform".to_string(),
                status: status.to_string(),
                guardrail: guardrail_map.get(&metric).cloned(),
            });
        }

        items.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(items)
    }

    async fn build_alert_feed(&self, now: DateTime<Utc>) -> Result<Vec<AnalyticsAlertItem>> {
        let rows = self
            .db
            .client()
            .query(
                "SELECT title, severity, detail, toUInt32(created_at) as created_at FROM analytics_alerts ORDER BY created_at DESC LIMIT 8",
            )
            .fetch_all::<AnalyticsAlertRow>()
            .await
            .unwrap_or_default();

        if rows.is_empty() {
            let (breaches, detail) = self
                .evaluate_guardrails(now)
                .await
                .unwrap_or((0, "No breaches".to_string()));
            if breaches == 0 {
                return Ok(Vec::new());
            }

            return Ok(vec![AnalyticsAlertItem {
                title: "Guardrail breach detected".to_string(),
                time: "just now".to_string(),
                severity: "warning".to_string(),
                detail,
            }]);
        }

        Ok(rows
            .into_iter()
            .map(|row| AnalyticsAlertItem {
                title: row.title,
                severity: row.severity,
                detail: row.detail,
                time: self.format_relative_time(now, row.created_at),
            })
            .collect())
    }

    async fn build_system_health(&self, now: DateTime<Utc>) -> Result<AnalyticsSystemHealth> {
        let data_freshness_seconds = self.data_freshness_seconds(now).await.unwrap_or(0);

        let rate_row = self
            .db
            .client()
            .query(
                "SELECT count() as total, countIf(event_type = 'error') as errors FROM activity_events WHERE timestamp >= now() - INTERVAL 1 DAY",
            )
            .fetch_one::<RateRow>()
            .await
            .unwrap_or(RateRow { total: 0, errors: 0 });

        let sdk_error_rate = if rate_row.total == 0 {
            0.0
        } else {
            rate_row.errors as f64 / rate_row.total as f64 * 100.0
        };

        let latency_row = self
            .db
            .client()
            .query(
                "SELECT avgIf(metric_value, metric_name = 'eval_latency_ms') as value FROM metric_events WHERE timestamp >= now() - INTERVAL 1 DAY",
            )
            .fetch_one::<AvgRow>()
            .await
            .unwrap_or(AvgRow { value: 0.0 });

        Ok(AnalyticsSystemHealth {
            data_freshness_seconds,
            sdk_error_rate,
            evaluation_latency_ms: if latency_row.value.is_nan() { 0.0 } else { latency_row.value },
        })
    }

    async fn evaluate_guardrails(&self, _now: DateTime<Utc>) -> Result<(u64, String)> {
        let experiments = self
            .db
            .client()
            .query("SELECT id, name, variants, health_checks, primary_metric FROM experiments FINAL WHERE status = 'running'")
            .fetch_all::<ExperimentRowSlim>()
            .await
            .unwrap_or_default();

        let mut breaches = Vec::new();
        for experiment in experiments {
            let checks: Vec<HealthCheck> =
                serde_json::from_str(&experiment.health_checks).unwrap_or_default();
            for check in checks {
                let value_row = self
                    .db
                    .client()
                    .query(
                        "SELECT avg(metric_value) as value FROM metric_events WHERE experiment_id = ? AND metric_name = ? AND timestamp >= now() - INTERVAL 1 DAY",
                    )
                    .bind(&experiment.id)
                    .bind(&check.metric_name)
                    .fetch_one::<AvgRow>()
                    .await
                    .unwrap_or(AvgRow { value: 0.0 });

                let value = if value_row.value.is_nan() { 0.0 } else { value_row.value };
                let passing = match check.direction {
                    HealthCheckDirection::AtLeast => {
                        check.min.map(|min| value >= min).unwrap_or(true)
                    }
                    HealthCheckDirection::AtMost => {
                        check.max.map(|max| value <= max).unwrap_or(true)
                    }
                    HealthCheckDirection::Between => {
                        let min_ok = check.min.map(|min| value >= min).unwrap_or(true);
                        let max_ok = check.max.map(|max| value <= max).unwrap_or(true);
                        min_ok && max_ok
                    }
                };

                if !passing {
                    breaches.push(check.metric_name.clone());
                }
            }
        }

        let detail = if breaches.is_empty() {
            "No breaches".to_string()
        } else {
            breaches.join(", ")
        };

        Ok((breaches.len() as u64, detail))
    }

    async fn data_freshness_seconds(&self, now: DateTime<Utc>) -> Result<u64> {
        let metric_row = self
            .db
            .client()
            .query("SELECT toUInt32(max(timestamp)) as last_ts FROM metric_events")
            .fetch_one::<FreshnessRow>()
            .await
            .unwrap_or(FreshnessRow { last_ts: None });

        let activity_row = self
            .db
            .client()
            .query("SELECT toUInt32(max(timestamp)) as last_ts FROM activity_events")
            .fetch_one::<FreshnessRow>()
            .await
            .unwrap_or(FreshnessRow { last_ts: None });

        let assign_row = self
            .db
            .client()
            .query("SELECT toUInt32(max(assigned_at)) as last_ts FROM user_assignments")
            .fetch_one::<FreshnessRow>()
            .await
            .unwrap_or(FreshnessRow { last_ts: None });

        let mut latest = 0u32;
        if let Some(ts) = metric_row.last_ts {
            latest = latest.max(ts);
        }
        if let Some(ts) = activity_row.last_ts {
            latest = latest.max(ts);
        }
        if let Some(ts) = assign_row.last_ts {
            latest = latest.max(ts);
        }

        if latest == 0 {
            Ok(0)
        } else {
            Ok(now.timestamp().saturating_sub(latest as i64) as u64)
        }
    }

    fn classify_metric(&self, metric: &str) -> String {
        let name = metric.to_lowercase();
        if name.contains("latency")
            || name.contains("error")
            || name.contains("crash")
            || name.contains("timeout")
        {
            "Guardrail".to_string()
        } else if name.contains("conversion")
            || name.contains("activation")
            || name.contains("revenue")
            || name.contains("retention")
        {
            "Primary".to_string()
        } else if name.contains("holdout") {
            "Feature Impact".to_string()
        } else {
            "Diagnostic".to_string()
        }
    }

    fn format_relative_time(&self, now: DateTime<Utc>, timestamp: u32) -> String {
        let ts = Utc
            .timestamp_opt(timestamp as i64, 0)
            .single()
            .unwrap_or(now);
        let diff = now.signed_duration_since(ts).num_minutes();
        if diff < 1 {
            "just now".to_string()
        } else if diff < 60 {
            format!("{}m ago", diff)
        } else if diff < 1440 {
            format!("{}h ago", diff / 60)
        } else {
            format!("{}d ago", diff / 1440)
        }
    }
}
