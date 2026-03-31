use serde_json::{json, Value};

use crate::services::AnalyticsService;

pub fn analytics_tool_definitions() -> Vec<Value> {
    vec![json!({
        "name": "get_analytics_overview",
        "description": "Get a comprehensive analytics overview including experiment throughput, metric coverage, guardrail health, and SRM checks",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    })]
}

pub async fn call_analytics_tool(
    name: &str,
    _args: &Value,
    service: &AnalyticsService,
) -> Result<Value, String> {
    match name {
        "get_analytics_overview" => service
            .get_overview()
            .await
            .map(|overview| json!(overview))
            .map_err(|e| e.to_string()),
        _ => Err(format!("Unknown analytics tool: {}", name)),
    }
}
