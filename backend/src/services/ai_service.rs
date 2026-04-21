use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::models::ai::{
    DraftHypothesisRequest, ExperimentSuggestion, ExperimentSummary, HypothesisDraft,
    MetricSuggestionsResponse, OnePagerDraft,
};
use crate::services::analytics_service::AnalyticsService;
use crate::services::experiment_service::ExperimentService;
use crate::services::prompts;

pub struct AiService {
    pub pg: PgPool,
    pub config: Config,
}

impl AiService {
    pub fn new(pg: PgPool, config: Config) -> Self {
        Self { pg, config }
    }

    async fn call_llm_json(&self, system_prompt: &str, user_prompt: &str) -> Result<Value> {
        let base_url = self
            .config
            .ai_base_url
            .as_deref()
            .ok_or_else(|| anyhow!("AI_BASE_URL not configured"))?;

        let model = self
            .config
            .ai_default_model
            .clone()
            .unwrap_or_else(|| "llama-3.3-70b-versatile".to_string());

        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let client = reqwest::Client::new();
        let mut request = client.post(&url);
        if let Some(api_key) = self.config.ai_api_key.as_ref() {
            request = request.bearer_auth(api_key);
        }

        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "temperature": 0.4,
            "max_tokens": 2048,
            "response_format": { "type": "json_object" }
        });

        let resp = request
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to reach AI service: {}", e))?;

        let raw: Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse AI service response: {}", e))?;

        let content = raw
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .ok_or_else(|| anyhow!("No content in AI service response"))?;

        serde_json::from_str(content).map_err(|e| anyhow!("Failed to parse JSON from LLM: {}", e))
    }

    pub async fn suggest_experiments(
        &self,
        experiment_service: &ExperimentService,
        analytics_service: &AnalyticsService,
        account_id: Uuid,
    ) -> Result<Vec<ExperimentSuggestion>> {
        let experiments = experiment_service.list_experiments(account_id).await?;
        let overview = analytics_service.get_overview().await?;

        let running_count = experiments
            .iter()
            .filter(|e| matches!(e.status, crate::models::ExperimentStatus::Running))
            .count();
        let exp_names: Vec<&str> = experiments.iter().map(|e| e.name.as_str()).collect();

        let user_prompt = prompts::suggest_experiments_user(
            experiments.len(),
            running_count,
            &exp_names,
            overview.summary.active_experiments_delta,
            overview.summary.daily_exposures,
            overview.summary.primary_conversion_rate,
            overview.summary.guardrail_breaches,
        );

        let json_resp = self
            .call_llm_json(prompts::SUGGEST_EXPERIMENTS_SYSTEM, &user_prompt)
            .await?;
        let suggestions = json_resp
            .get("suggestions")
            .ok_or_else(|| anyhow!("Missing 'suggestions' key in LLM response"))?;
        serde_json::from_value(suggestions.clone())
            .map_err(|e| anyhow!("Failed to deserialize suggestions: {}", e))
    }

    pub async fn draft_hypothesis(&self, req: DraftHypothesisRequest) -> Result<HypothesisDraft> {
        let user_prompt =
            prompts::draft_hypothesis_user(&req.experiment_description, &req.metric_type);

        let json_resp = self
            .call_llm_json(prompts::DRAFT_HYPOTHESIS_SYSTEM, &user_prompt)
            .await?;
        serde_json::from_value(json_resp)
            .map_err(|e| anyhow!("Failed to deserialize hypothesis draft: {}", e))
    }

    pub async fn draft_one_pager(
        &self,
        experiment_service: &ExperimentService,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<OnePagerDraft> {
        let experiment = experiment_service
            .get_experiment(account_id, experiment_id)
            .await?;
        let analysis = experiment_service
            .analyze_experiment(account_id, experiment_id)
            .await
            .ok();

        let hypothesis_text = experiment
            .hypothesis
            .as_ref()
            .map(|h| {
                format!(
                    "Null: {}. Alternative: {}. Effect size: {}, Power: {}, Significance: {}",
                    h.null_hypothesis,
                    h.alternative_hypothesis,
                    h.expected_effect_size,
                    h.power,
                    h.significance_level,
                )
            })
            .unwrap_or_default();

        let sample_info = analysis
            .as_ref()
            .map(|a| {
                a.sample_sizes
                    .iter()
                    .map(|s| format!("{}: {}/{}", s.variant, s.current_size, s.required_size))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();

        let variants_str = experiment
            .variants
            .iter()
            .map(|v| v.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");

        let user_prompt = prompts::draft_one_pager_user(
            &experiment.name,
            &experiment.description,
            &format!("{:?}", experiment.experiment_type),
            &experiment.primary_metric,
            &format!("{:?}", experiment.status),
            &variants_str,
            &hypothesis_text,
            &sample_info,
        );

        let json_resp = self
            .call_llm_json(prompts::DRAFT_ONE_PAGER_SYSTEM, &user_prompt)
            .await?;
        serde_json::from_value(json_resp)
            .map_err(|e| anyhow!("Failed to deserialize 1-pager: {}", e))
    }

    pub async fn suggest_metrics(
        &self,
        experiment_description: &str,
    ) -> Result<MetricSuggestionsResponse> {
        let user_prompt = prompts::suggest_metrics_user(experiment_description);

        let json_resp = self
            .call_llm_json(prompts::SUGGEST_METRICS_SYSTEM, &user_prompt)
            .await?;
        serde_json::from_value(json_resp)
            .map_err(|e| anyhow!("Failed to deserialize metric suggestions: {}", e))
    }

    pub async fn summarize_experiment(
        &self,
        experiment_service: &ExperimentService,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<ExperimentSummary> {
        let experiment = experiment_service
            .get_experiment(account_id, experiment_id)
            .await?;
        let analysis = experiment_service
            .analyze_experiment(account_id, experiment_id)
            .await
            .ok();

        let results_text = analysis
            .as_ref()
            .map(|a| {
                a.results
                    .iter()
                    .map(|r| {
                        format!(
                            "{} vs {}: effect={:.4}, p={:.4}, significant={}",
                            r.variant_a, r.variant_b, r.effect_size, r.p_value, r.is_significant,
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("; ")
            })
            .unwrap_or_else(|| "No analysis data yet".to_string());

        let user_prompt = prompts::summarize_experiment_user(
            &experiment.name,
            &format!("{:?}", experiment.status),
            &experiment.primary_metric,
            &results_text,
        );

        let json_resp = self
            .call_llm_json(prompts::SUMMARIZE_EXPERIMENT_SYSTEM, &user_prompt)
            .await?;
        let summary = json_resp
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("Summary not available.")
            .to_string();

        Ok(ExperimentSummary {
            experiment_id,
            experiment_name: experiment.name,
            summary,
            status: format!("{:?}", experiment.status),
        })
    }

    pub async fn summarize_session(
        &self,
        user_id: Option<&str>,
        entry_url: &str,
        referrer: Option<&str>,
        user_agent: Option<&str>,
        duration_seconds: Option<u32>,
        started_at: &str,
        events: &[crate::api::ai::SessionEventInput],
    ) -> Result<String> {
        let event_log = events
            .iter()
            .map(|e| {
                let pos = match (e.x, e.y) {
                    (Some(x), Some(y)) => format!(" at ({:.0},{:.0})", x, y),
                    _ => String::new(),
                };
                let selector = e
                    .selector
                    .as_deref()
                    .map(|s| format!(" [{}]", s))
                    .unwrap_or_default();
                let path = e
                    .url
                    .find("://")
                    .and_then(|i| {
                        e.url[i + 3..]
                            .find('/')
                            .map(|j| e.url[i + 3 + j..].to_string())
                    })
                    .unwrap_or_else(|| e.url.clone());
                format!(
                    "  +{:.1}s  {:12}  {:15}  {}{}{}",
                    e.offset_seconds, e.event_type, e.event_name, path, selector, pos
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let duration_str = duration_seconds
            .map(|d| format!("{}m {}s", d / 60, d % 60))
            .unwrap_or_else(|| "unknown".to_string());

        let user_prompt = prompts::session_journey_user(
            user_id.unwrap_or("anonymous"),
            entry_url,
            referrer.unwrap_or("direct / unknown"),
            user_agent.unwrap_or("unknown"),
            started_at,
            &duration_str,
            events.len(),
            &event_log,
        );

        let json_resp = self
            .call_llm_json(prompts::SESSION_JOURNEY_SYSTEM, &user_prompt)
            .await?;
        Ok(json_resp
            .get("journey")
            .and_then(|v| v.as_str())
            .unwrap_or("Journey narrative unavailable.")
            .to_string())
    }

    pub async fn generate_insight_narrative(
        &self,
        insight_type: &str,
        experiment_name: &str,
        effect_size: Option<f64>,
        p_value: Option<f64>,
        sample_size: Option<i64>,
    ) -> Result<String> {
        let effect_size_str = effect_size
            .map(|v| format!("{:.4}", v))
            .unwrap_or_else(|| "N/A".to_string());
        let p_value_str = p_value
            .map(|v| format!("{:.4}", v))
            .unwrap_or_else(|| "N/A".to_string());
        let sample_size_str = sample_size
            .map(|v| v.to_string())
            .unwrap_or_else(|| "N/A".to_string());

        let user_prompt = prompts::insight_narrative_user(
            insight_type,
            experiment_name,
            &effect_size_str,
            &p_value_str,
            &sample_size_str,
        );

        let json_resp = self
            .call_llm_json(prompts::INSIGHT_NARRATIVE_SYSTEM, &user_prompt)
            .await?;
        Ok(json_resp
            .get("narrative")
            .and_then(|v| v.as_str())
            .unwrap_or("No narrative available.")
            .to_string())
    }
}
