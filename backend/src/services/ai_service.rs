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
        let exp_names: Vec<_> = experiments.iter().map(|e| &e.name).collect();

        let system_prompt = "You are an expert experimentation strategist. Always respond with valid JSON matching the requested schema.";
        let user_prompt = format!(
            r#"Based on this platform state, suggest 5 high-impact A/B test experiments.

Platform context:
- Total experiments: {}
- Running experiments: {}
- Existing experiment names: {}
- Active experiments delta: {}
- Daily exposures: {}
- Primary conversion rate: {}%
- Guardrail breaches: {}

Return a JSON object with key "suggestions" containing an array of 5 objects, each with:
- name (string)
- description (string)
- hypothesis_draft (string)
- primary_metric (string, e.g. "click_rate", "conversion_rate", "revenue_per_user")
- predicted_impact_score (number 0.0-1.0)
- experiment_type (one of: "abtest", "multivariate", "featuregate", "holdout")
- variants (array of objects with: name, description, allocation_percent, is_control)
- telemetry_touchpoints (array of telemetry event name strings)"#,
            experiments.len(),
            running_count,
            exp_names
                .iter()
                .take(10)
                .map(|n| n.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            overview.summary.active_experiments_delta,
            overview.summary.daily_exposures,
            overview.summary.primary_conversion_rate * 100.0,
            overview.summary.guardrail_breaches,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
        let suggestions = json_resp
            .get("suggestions")
            .ok_or_else(|| anyhow!("Missing 'suggestions' key in LLM response"))?;
        serde_json::from_value(suggestions.clone())
            .map_err(|e| anyhow!("Failed to deserialize suggestions: {}", e))
    }

    pub async fn draft_hypothesis(&self, req: DraftHypothesisRequest) -> Result<HypothesisDraft> {
        let system_prompt =
            "You are an expert in statistical hypothesis testing. Always respond with valid JSON.";
        let user_prompt = format!(
            r#"Draft a hypothesis for this experiment.

Experiment description: {}
Metric type: {}

Return a JSON object with:
- null_hypothesis (string)
- alternative_hypothesis (string)
- expected_effect_size (number, e.g. 0.05 for 5%)
- metric_type (same as input: "{}")
- significance_level (number, typically 0.05)
- power (number, typically 0.80)
- rationale (string, 2-3 sentences explaining the reasoning)"#,
            req.experiment_description, req.metric_type, req.metric_type,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
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

        let system_prompt = "You are an expert at writing experiment 1-pagers for product teams. Always respond with valid JSON.";
        let user_prompt = format!(
            r#"Write a 1-pager for this experiment.

Name: {}
Description: {}
Type: {:?}
Primary metric: {}
Status: {:?}
Variants: {}
Hypothesis: {}
Sample sizes: {}

Return a JSON object with:
- experiment_name (string)
- objective (string, 1-2 sentences)
- hypothesis (string)
- success_metrics (array of strings)
- guardrail_metrics (array of strings)
- estimated_duration_days (integer)
- sample_size_estimate (integer)
- risks (array of strings, 2-4 risks)"#,
            experiment.name,
            experiment.description,
            experiment.experiment_type,
            experiment.primary_metric,
            experiment.status,
            experiment
                .variants
                .iter()
                .map(|v| v.name.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            hypothesis_text,
            sample_info,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
        serde_json::from_value(json_resp)
            .map_err(|e| anyhow!("Failed to deserialize 1-pager: {}", e))
    }

    pub async fn suggest_metrics(
        &self,
        experiment_description: &str,
    ) -> Result<MetricSuggestionsResponse> {
        let system_prompt = "You are an expert in product analytics and experimentation metrics. Always respond with valid JSON.";
        let user_prompt = format!(
            r#"Suggest primary and guardrail metrics for this experiment.

Experiment description: {}

Return a JSON object with:
- primary_metrics (array of objects with: metric_name, telemetry_event, metric_type (proportion/continuous/count), description)
- guardrail_metrics (array of objects with: metric_name, telemetry_event, metric_type, description)"#,
            experiment_description,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
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

        let system_prompt =
            "You are a concise experimentation analyst. Always respond with valid JSON.";
        let user_prompt = format!(
            r#"Summarize this experiment in 2 sentences.

Name: {}
Status: {:?}
Primary metric: {}
Results: {}

Return JSON with:
- summary (string, exactly 2 sentences)"#,
            experiment.name, experiment.status, experiment.primary_metric, results_text,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
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

        let system_prompt = "\
You are an expert UX analyst who specialises in reconstructing user experiences \
from raw behavioural telemetry. You write with clarity and precision — your narratives \
help product teams understand exactly what a real person thought and did during a session.";

        let user_prompt = format!(
            r#"Below is the full telemetry log for a single browser session. \
Reconstruct this user's journey as a vivid narrative. Your description must: \

1. Walk through their journey chronologically, referencing REAL timestamps, page paths, and \
   event names from the log. Describe the rhythm — rapid-fire clicks signal confidence or \
   excitement; long pauses suggest hesitation, distraction, or reading.
2. Identify the emotional arc: moments of engagement, confusion, momentum, or frustration. \
   Ground each observation in specific data points (e.g. "fourteen clicks in the first 8 seconds \
   on /pricing suggest intense comparison behaviour").
3. Call out any pivots, back-navigations, repeated interactions with the same selector, or \
   abrupt drop-offs — and speculate on what drove them.
4. Close with a sharp summary of what this session reveals about the user's intent, their \
   success or failure in achieving it, and one concrete UX insight a product team could act on.

Be vivid. Be specific. Sound like a senior researcher narrating a usability lab recording.

Important notes:
- Use the event log data verbatim to ground your narrative — don't make up events or timelines.
- Don't speculate wildly about the user's feelings or motivations. Base your insights on the data.
- Highlight/style specific data points (timestamps, event names, page paths) to support your narrative.

--- SESSION METADATA ---
User:          {}
Entry URL:     {}
Referrer:      {}
User agent:    {}
Session start: {}
Duration:      {}
Total events:  {}

--- EVENT LOG (offset from session start | type | name | path [selector] (x,y)) ---
{}

Return a JSON object with a single key "journey" whose value is the full narrative (plain text, \
paragraph breaks with \n\n, no markdown)."#,
            user_id.unwrap_or("anonymous"),
            entry_url,
            referrer.unwrap_or("direct / unknown"),
            user_agent.unwrap_or("unknown"),
            started_at,
            duration_str,
            events.len(),
            event_log,
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
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
        let system_prompt =
            "You are a concise experimentation analyst. Always respond with valid JSON.";
        let user_prompt = format!(
            r#"Generate a 2-sentence narrative for this experiment insight.

Insight type: {}
Experiment: {}
Effect size: {}
P-value: {}
Sample size: {}

Return JSON with:
- narrative (string, exactly 2 sentences)"#,
            insight_type,
            experiment_name,
            effect_size
                .map(|v| format!("{:.4}", v))
                .unwrap_or_else(|| "N/A".to_string()),
            p_value
                .map(|v| format!("{:.4}", v))
                .unwrap_or_else(|| "N/A".to_string()),
            sample_size
                .map(|v| v.to_string())
                .unwrap_or_else(|| "N/A".to_string()),
        );

        let json_resp = self.call_llm_json(system_prompt, &user_prompt).await?;
        Ok(json_resp
            .get("narrative")
            .and_then(|v| v.as_str())
            .unwrap_or("No narrative available.")
            .to_string())
    }
}
