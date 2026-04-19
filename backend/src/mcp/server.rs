use serde_json::{json, Value};
use uuid::Uuid;

use super::tools::{
    ai_insights_tool_definitions, analytics_tool_definitions, call_ai_insights_tool,
    call_analytics_tool, call_experiment_tool, call_feature_flag_tool, call_feature_gate_tool,
    experiment_tool_definitions, feature_flag_tool_definitions, feature_gate_tool_definitions,
};
use crate::services::{
    AnalyticsService, ExperimentService, FeatureFlagService, FeatureGateService,
};

pub struct McpServer {
    pub experiment_service: std::sync::Arc<ExperimentService>,
    pub feature_flag_service: std::sync::Arc<FeatureFlagService>,
    pub feature_gate_service: std::sync::Arc<FeatureGateService>,
    pub analytics_service: std::sync::Arc<AnalyticsService>,
    pub pg: sqlx::PgPool,
}

impl McpServer {
    pub fn new(
        experiment_service: std::sync::Arc<ExperimentService>,
        feature_flag_service: std::sync::Arc<FeatureFlagService>,
        feature_gate_service: std::sync::Arc<FeatureGateService>,
        analytics_service: std::sync::Arc<AnalyticsService>,
        pg: sqlx::PgPool,
    ) -> Self {
        Self {
            experiment_service,
            feature_flag_service,
            feature_gate_service,
            analytics_service,
            pg,
        }
    }

    pub fn list_tools(&self) -> Value {
        let mut tools = Vec::new();
        tools.extend(experiment_tool_definitions());
        tools.extend(feature_flag_tool_definitions());
        tools.extend(feature_gate_tool_definitions());
        tools.extend(analytics_tool_definitions());
        tools.extend(ai_insights_tool_definitions());
        json!({ "tools": tools })
    }

    pub async fn call_tool(
        &self,
        name: &str,
        args: &Value,
        account_id: Uuid,
    ) -> Result<Value, String> {
        // Experiment tools
        let experiment_tools = [
            "list_experiments",
            "get_experiment",
            "get_experiment_analysis",
            "create_experiment",
            "start_experiment",
            "pause_experiment",
            "stop_experiment",
        ];
        if experiment_tools.contains(&name) {
            let result =
                call_experiment_tool(name, args, &self.experiment_service, account_id).await?;
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }]
            }));
        }

        // Feature flag tools
        let flag_tools = ["list_feature_flags", "get_feature_flag"];
        if flag_tools.contains(&name) {
            let result =
                call_feature_flag_tool(name, args, &self.feature_flag_service, account_id).await?;
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }]
            }));
        }

        // Feature gate tools
        let gate_tools = ["list_feature_gates", "get_feature_gate"];
        if gate_tools.contains(&name) {
            let result =
                call_feature_gate_tool(name, args, &self.feature_gate_service, account_id).await?;
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }]
            }));
        }

        // Analytics tools
        if name == "get_analytics_overview" {
            let result = call_analytics_tool(name, args, &self.analytics_service).await?;
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }]
            }));
        }

        // AI insights tools
        let ai_insights_tools = ["list_ai_insights", "dismiss_ai_insight"];
        if ai_insights_tools.contains(&name) {
            let result = call_ai_insights_tool(name, args, &self.pg, account_id).await?;
            return Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }]
            }));
        }

        Err(format!("Unknown tool: {}", name))
    }
}
