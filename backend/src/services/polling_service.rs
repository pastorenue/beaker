use chrono::Utc;
use log::{error, info, warn};
use sqlx::PgPool;
use std::time::Duration;
use tokio::time;
use uuid::Uuid;

use crate::config::Config;
use crate::db::ClickHouseClient;
use crate::models::ExperimentStatus;
use crate::services::ai_service::AiService;
use crate::services::experiment_service::ExperimentService;
use crate::services::notification_service::NotificationService;

pub struct PollingService {
    pg: PgPool,
    experiment_service: ExperimentService,
    ai_service: AiService,
    notification_service: NotificationService,
    config: Config,
}

impl PollingService {
    pub fn new(
        pg: PgPool,
        ch: ClickHouseClient,
        config: Config,
        notification_service: NotificationService,
    ) -> Self {
        let db_with_auth = ch.with_database("beaker");
        let experiment_service = ExperimentService::new(pg.clone(), db_with_auth);
        let ai_service = AiService::new(pg.clone(), config.clone());
        Self {
            pg,
            experiment_service,
            ai_service,
            notification_service,
            config,
        }
    }

    pub async fn run_loop(&self) {
        let interval_secs = self.config.ai_polling_interval_minutes * 60;
        info!(
            "AI polling service started, interval: {}min",
            self.config.ai_polling_interval_minutes
        );
        let mut ticker = time::interval(Duration::from_secs(interval_secs));
        // First tick fires immediately
        ticker.tick().await;

        loop {
            ticker.tick().await;
            info!("AI polling cycle starting");
            if let Err(e) = self.run_cycle().await {
                error!("AI polling cycle failed: {}", e);
            }
        }
    }

    async fn run_cycle(&self) -> anyhow::Result<()> {
        // Get all accounts
        let accounts: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM accounts")
            .fetch_all(&self.pg)
            .await?;

        for account_id in accounts {
            if let Err(e) = self.poll_account(account_id).await {
                warn!("Polling failed for account {}: {}", account_id, e);
            }
        }
        Ok(())
    }

    async fn poll_account(&self, account_id: Uuid) -> anyhow::Result<()> {
        let experiments = self.experiment_service.list_experiments(account_id).await?;
        let now = Utc::now();
        let running: Vec<_> = experiments
            .into_iter()
            .filter(|e| matches!(e.status, ExperimentStatus::Running))
            .collect();

        // Auto-stop experiments that have reached their end date
        let (expired, active): (Vec<_>, Vec<_>) = running
            .into_iter()
            .partition(|e| e.end_date.map(|d| d <= now).unwrap_or(false));

        for experiment in expired {
            info!(
                "Auto-stopping experiment {} (end_date reached)",
                experiment.id
            );
            match self
                .experiment_service
                .stop_experiment(account_id, experiment.id)
                .await
            {
                Ok(stopped) => {
                    let ns = self.notification_service.clone();
                    let exp_clone = stopped.clone();
                    tokio::spawn(async move {
                        ns.notify_experiment_status_changed(account_id, &exp_clone, "stopped")
                            .await;
                    });
                }
                Err(e) => error!("Failed to auto-stop experiment {}: {}", experiment.id, e),
            }
        }

        // Continue AI analysis only for still-running experiments
        for experiment in active {
            if let Err(e) = self.poll_experiment(account_id, &experiment).await {
                warn!("Polling failed for experiment {}: {}", experiment.id, e);
            }
        }
        Ok(())
    }

    async fn poll_experiment(
        &self,
        account_id: Uuid,
        experiment: &crate::models::Experiment,
    ) -> anyhow::Result<()> {
        let analysis = match self
            .experiment_service
            .analyze_experiment(account_id, experiment.id)
            .await
        {
            Ok(a) => a,
            Err(e) => {
                warn!("Could not analyze experiment {}: {}", experiment.id, e);
                return Ok(());
            }
        };

        let threshold = self.config.ai_severe_regression_threshold;

        for result in &analysis.results {
            let insight_type;
            let severity;
            let headline;
            let detail;

            if result.is_significant && result.effect_size < threshold && result.p_value < 0.05 {
                insight_type = "regression";
                severity = "critical";
                headline = format!(
                    "Critical regression detected in '{}' vs '{}'",
                    result.variant_b, result.variant_a
                );
                detail = format!(
                    "Effect size: {:.4}, p-value: {:.4}. Variant {} is performing significantly worse.",
                    result.effect_size, result.p_value, result.variant_b
                );
            } else if result.is_significant && result.effect_size > 0.0 {
                insight_type = "winner";
                severity = "info";
                headline = format!(
                    "Significant winner detected: '{}' beats '{}'",
                    result.variant_b, result.variant_a
                );
                detail = format!(
                    "Effect size: {:.4}, p-value: {:.4}. Statistical significance reached.",
                    result.effect_size, result.p_value
                );
            } else {
                // No notable event for this result
                continue;
            }

            // Generate AI narrative
            let narrative = self
                .ai_service
                .generate_insight_narrative(
                    insight_type,
                    &experiment.name,
                    Some(result.effect_size),
                    Some(result.p_value),
                    Some((result.sample_size_a + result.sample_size_b) as i64),
                )
                .await
                .ok();

            let mut auto_actioned = false;
            if insight_type == "regression" && self.config.ai_auto_stop_regressions {
                info!(
                    "Auto-stopping experiment {} due to critical regression",
                    experiment.id
                );
                if let Err(e) = self
                    .experiment_service
                    .stop_experiment(account_id, experiment.id)
                    .await
                {
                    error!("Failed to auto-stop experiment {}: {}", experiment.id, e);
                } else {
                    auto_actioned = true;
                }
            }

            // Persist insight
            sqlx::query(
                r#"
                INSERT INTO ai_polling_insights
                    (account_id, experiment_id, severity, insight_type, headline, detail,
                     ai_narrative, p_value, effect_size, sample_size, auto_actioned)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                "#,
            )
            .bind(account_id)
            .bind(experiment.id)
            .bind(severity)
            .bind(insight_type)
            .bind(&headline)
            .bind(&detail)
            .bind(narrative.as_deref())
            .bind(Some(result.p_value))
            .bind(Some(result.effect_size))
            .bind(Some((result.sample_size_a + result.sample_size_b) as i64))
            .bind(auto_actioned)
            .execute(&self.pg)
            .await?;

            info!(
                "Persisted {} insight for experiment {}",
                severity, experiment.id
            );

            // Fire Slack notification (fire-and-forget)
            if matches!(severity, "critical" | "warning") {
                let ns = self.notification_service.clone();
                let exp_name = experiment.name.clone();
                let exp_id = experiment.id;
                let sev = severity.to_string();
                let hl = headline.clone();
                let det = detail.clone();
                tokio::spawn(async move {
                    ns.notify_ai_insight(account_id, &exp_name, exp_id, &sev, &hl, &det)
                        .await;
                });
            }

            // Fire winner Slack notification
            if insight_type == "winner" {
                let ns = self.notification_service.clone();
                let exp_clone = experiment.clone();
                let variant_b = result.variant_b.clone();
                let effect = result.effect_size;
                let pval = result.p_value;
                tokio::spawn(async move {
                    ns.notify_winner_detected(account_id, &exp_clone, &variant_b, effect, pval)
                        .await;
                });
            }
        }

        // SRM check — look for sample ratio mismatch across variants
        let total_samples: usize = analysis.sample_sizes.iter().map(|s| s.current_size).sum();
        if total_samples > 0 {
            let variant_count = analysis.sample_sizes.len();
            if variant_count > 1 {
                let expected_per_variant = total_samples / variant_count;
                let has_srm = analysis.sample_sizes.iter().any(|s| {
                    let ratio = s.current_size as f64 / expected_per_variant as f64;
                    !(0.85..=1.15).contains(&ratio)
                });

                if has_srm {
                    let narrative = self
                        .ai_service
                        .generate_insight_narrative(
                            "srm",
                            &experiment.name,
                            None,
                            None,
                            Some(total_samples as i64),
                        )
                        .await
                        .ok();

                    sqlx::query(
                        r#"
                        INSERT INTO ai_polling_insights
                            (account_id, experiment_id, severity, insight_type, headline, detail,
                             ai_narrative, sample_size, auto_actioned)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        "#,
                    )
                    .bind(account_id)
                    .bind(experiment.id)
                    .bind("warning")
                    .bind("srm")
                    .bind(format!(
                        "Sample Ratio Mismatch detected in '{}'",
                        experiment.name
                    ))
                    .bind("Variant sample sizes deviate significantly from expected allocation.")
                    .bind(narrative.as_deref())
                    .bind(Some(total_samples as i64))
                    .bind(false)
                    .execute(&self.pg)
                    .await?;
                }
            }
        }

        // Guardrail check
        let failing_checks: Vec<_> = analysis
            .health_checks
            .iter()
            .filter(|hc| !hc.is_passing)
            .collect();

        for check in failing_checks {
            let narrative = self
                .ai_service
                .generate_insight_narrative("guardrail", &experiment.name, None, None, None)
                .await
                .ok();

            sqlx::query(
                r#"
                INSERT INTO ai_polling_insights
                    (account_id, experiment_id, severity, insight_type, headline, detail,
                     ai_narrative, auto_actioned)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#,
            )
            .bind(account_id)
            .bind(experiment.id)
            .bind("warning")
            .bind("guardrail")
            .bind(format!(
                "Guardrail breach: metric '{}' in '{}'",
                check.metric_name, experiment.name
            ))
            .bind(format!(
                "Health check for metric '{}' is failing.",
                check.metric_name
            ))
            .bind(narrative.as_deref())
            .bind(false)
            .execute(&self.pg)
            .await?;
        }

        Ok(())
    }
}
