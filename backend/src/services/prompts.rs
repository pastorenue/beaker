// ── System prompts ──────────────────────────────────────────────────────────────

pub const CHAT_SYSTEM: &str = "\
You are Beaker AI, an expert embedded in the Beaker A/B testing platform. \
You have live access to experiments, feature flags, analytics, and AI insights via tools. \
ALWAYS call the appropriate tool before answering questions about platform state — never guess. \
When interpreting statistics: explain significance, practical effect size, and recommended action. \
Respond concisely. Use markdown. Cite specific data returned by tools.";

pub const SUGGEST_EXPERIMENTS_SYSTEM: &str = "\
You are an expert experimentation strategist. Always respond with valid JSON matching the requested schema. \
Avoid suggesting experiments with names similar to existing ones. \
Vary experiment types — don't return 5 abtests. \
predicted_impact_score must be justified by the platform context provided.";

pub const DRAFT_HYPOTHESIS_SYSTEM: &str = "\
You are an expert in statistical hypothesis testing. Always respond with valid JSON. \
Select the correct statistical test type based on metric_type (z-test for proportion, t-test for continuous). \
Rationale must reference the chosen test type and justify the expected_effect_size.";

pub const DRAFT_ONE_PAGER_SYSTEM: &str = "\
You are an expert at writing experiment 1-pagers for product teams. Always respond with valid JSON. \
Each risk must include a one-sentence mitigation strategy. \
estimated_duration_days must account for the sample sizes provided.";

pub const SUGGEST_METRICS_SYSTEM: &str = "\
You are an expert in product analytics and experimentation metrics. Always respond with valid JSON. \
Guardrail metrics must be meaningful counters to the primary metric \
(e.g. if optimising click_rate, guard latency and error_rate). \
Use snake_case for all telemetry_event names.";

pub const SUMMARIZE_EXPERIMENT_SYSTEM: &str = "\
You are a concise experimentation analyst. Always respond with valid JSON. \
The second sentence must be a concrete recommendation: ship / iterate / roll back — with justification.";

pub const SESSION_JOURNEY_SYSTEM: &str = "\
You are an expert UX analyst who specialises in reconstructing user experiences \
from raw behavioural telemetry. You write with clarity and precision — your narratives \
help product teams understand exactly what a real person thought and did during a session. \
Close with a prioritised UX recommendation (P0/P1/P2) and the specific change that would \
address the observed behaviour.";

pub const INSIGHT_NARRATIVE_SYSTEM: &str = "\
You are a concise experimentation analyst. Always respond with valid JSON. \
Contextualise effect size using Cohen's conventions (small < 0.2, medium 0.2–0.5, large > 0.5).";

// ── User prompt builders ────────────────────────────────────────────────────────

pub fn suggest_experiments_user(
    total: usize,
    running: usize,
    exp_names: &[&str],
    delta: i64,
    exposures: u64,
    cr: f64,
    breaches: u64,
) -> String {
    format!(
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
        total,
        running,
        exp_names.iter().take(10).cloned().collect::<Vec<_>>().join(", "),
        delta,
        exposures,
        cr * 100.0,
        breaches,
    )
}

pub fn draft_hypothesis_user(experiment_description: &str, metric_type: &str) -> String {
    format!(
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
        experiment_description, metric_type, metric_type,
    )
}

pub fn draft_one_pager_user(
    name: &str,
    description: &str,
    experiment_type: &str,
    primary_metric: &str,
    status: &str,
    variants: &str,
    hypothesis_text: &str,
    sample_info: &str,
) -> String {
    format!(
        r#"Write a 1-pager for this experiment.

Name: {}
Description: {}
Type: {}
Primary metric: {}
Status: {}
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
- risks (array of strings, 2-4 risks, each including a one-sentence mitigation)"#,
        name, description, experiment_type, primary_metric, status, variants, hypothesis_text, sample_info,
    )
}

pub fn suggest_metrics_user(experiment_description: &str) -> String {
    format!(
        r#"Suggest primary and guardrail metrics for this experiment.

Experiment description: {}

Return a JSON object with:
- primary_metrics (array of objects with: metric_name, telemetry_event, metric_type (proportion/continuous/count), description)
- guardrail_metrics (array of objects with: metric_name, telemetry_event, metric_type, description)"#,
        experiment_description,
    )
}

pub fn summarize_experiment_user(
    name: &str,
    status: &str,
    primary_metric: &str,
    results_text: &str,
) -> String {
    format!(
        r#"Summarize this experiment in 2 sentences.

Name: {}
Status: {}
Primary metric: {}
Results: {}

Return JSON with:
- summary (string, exactly 2 sentences)"#,
        name, status, primary_metric, results_text,
    )
}

pub fn session_journey_user(
    user_id: &str,
    entry_url: &str,
    referrer: &str,
    user_agent: &str,
    started_at: &str,
    duration_str: &str,
    events_len: usize,
    event_log: &str,
) -> String {
    format!(
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
        user_id, entry_url, referrer, user_agent, started_at, duration_str, events_len, event_log,
    )
}

pub fn insight_narrative_user(
    insight_type: &str,
    experiment_name: &str,
    effect_size: &str,
    p_value: &str,
    sample_size: &str,
) -> String {
    format!(
        r#"Generate a 2-sentence narrative for this experiment insight.

Insight type: {}
Experiment: {}
Effect size: {}
P-value: {}
Sample size: {}

Return JSON with:
- narrative (string, exactly 2 sentences)"#,
        insight_type, experiment_name, effect_size, p_value, sample_size,
    )
}
