use serde_json::{json, Value};
use uuid::Uuid;

use crate::services::FeatureGateService;

pub fn feature_gate_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_feature_gates",
            "description": "List all feature gates for the current account",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "get_feature_gate",
            "description": "Get a specific feature gate by ID",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "gate_id": {
                        "type": "string",
                        "description": "UUID of the feature gate"
                    }
                },
                "required": ["gate_id"]
            }
        }),
    ]
}

pub async fn call_feature_gate_tool(
    name: &str,
    args: &Value,
    service: &FeatureGateService,
    account_id: Uuid,
) -> Result<Value, String> {
    match name {
        "list_feature_gates" => service
            .list_gates(account_id, None)
            .await
            .map(|gates| json!(gates))
            .map_err(|e| e.to_string()),
        "get_feature_gate" => {
            let id_str = args
                .get("gate_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing gate_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid gate_id UUID")?;
            service
                .get_gate(account_id, id)
                .await
                .map(|gate| json!(gate))
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown feature gate tool: {}", name)),
    }
}
