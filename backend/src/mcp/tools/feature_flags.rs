use serde_json::{json, Value};
use uuid::Uuid;

use crate::services::FeatureFlagService;

pub fn feature_flag_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_feature_flags",
            "description": "List all feature flags for the current account",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "get_feature_flag",
            "description": "Get a specific feature flag by ID",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "flag_id": {
                        "type": "string",
                        "description": "UUID of the feature flag"
                    }
                },
                "required": ["flag_id"]
            }
        }),
    ]
}

pub async fn call_feature_flag_tool(
    name: &str,
    args: &Value,
    service: &FeatureFlagService,
    account_id: Uuid,
) -> Result<Value, String> {
    match name {
        "list_feature_flags" => service
            .list_flags(account_id)
            .await
            .map(|flags| json!(flags))
            .map_err(|e| e.to_string()),
        "get_feature_flag" => {
            let id_str = args
                .get("flag_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing flag_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid flag_id UUID")?;
            service
                .get_flag(id, account_id)
                .await
                .map(|flag| json!(flag))
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown feature flag tool: {}", name)),
    }
}
