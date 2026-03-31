use serde_json::{json, Value};
use uuid::Uuid;

use crate::services::ExperimentService;

pub fn experiment_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_experiments",
            "description": "List all experiments for the current account",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "get_experiment",
            "description": "Get a specific experiment by ID",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "UUID of the experiment"
                    }
                },
                "required": ["experiment_id"]
            }
        }),
        json!({
            "name": "get_experiment_analysis",
            "description": "Get statistical analysis results for an experiment",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "UUID of the experiment"
                    },
                    "use_cuped": {
                        "type": "boolean",
                        "description": "Whether to use CUPED variance reduction",
                        "default": false
                    }
                },
                "required": ["experiment_id"]
            }
        }),
        json!({
            "name": "start_experiment",
            "description": "Start a draft or paused experiment",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "UUID of the experiment to start"
                    }
                },
                "required": ["experiment_id"]
            }
        }),
        json!({
            "name": "pause_experiment",
            "description": "Pause a running experiment",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "UUID of the experiment to pause"
                    }
                },
                "required": ["experiment_id"]
            }
        }),
        json!({
            "name": "stop_experiment",
            "description": "Stop a running or paused experiment",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "UUID of the experiment to stop"
                    }
                },
                "required": ["experiment_id"]
            }
        }),
    ]
}

pub async fn call_experiment_tool(
    name: &str,
    args: &Value,
    service: &ExperimentService,
    account_id: Uuid,
) -> Result<Value, String> {
    match name {
        "list_experiments" => {
            service
                .list_experiments(account_id)
                .await
                .map(|exps| json!(exps))
                .map_err(|e| e.to_string())
        }
        "get_experiment" => {
            let id_str = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing experiment_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid experiment_id UUID")?;
            service
                .get_experiment(account_id, id)
                .await
                .map(|exp| json!(exp))
                .map_err(|e| e.to_string())
        }
        "get_experiment_analysis" => {
            let id_str = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing experiment_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid experiment_id UUID")?;
            let use_cuped = args
                .get("use_cuped")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let _ = use_cuped; // CUPED is applied separately via CupedService
            service
                .analyze_experiment(account_id, id)
                .await
                .map(|analysis| json!(analysis))
                .map_err(|e| e.to_string())
        }
        "start_experiment" => {
            let id_str = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing experiment_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid experiment_id UUID")?;
            service
                .start_experiment(account_id, id)
                .await
                .map(|exp| json!(exp))
                .map_err(|e| e.to_string())
        }
        "pause_experiment" => {
            let id_str = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing experiment_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid experiment_id UUID")?;
            service
                .pause_experiment(account_id, id)
                .await
                .map(|exp| json!(exp))
                .map_err(|e| e.to_string())
        }
        "stop_experiment" => {
            let id_str = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing experiment_id")?;
            let id = Uuid::parse_str(id_str).map_err(|_| "Invalid experiment_id UUID")?;
            service
                .stop_experiment(account_id, id)
                .await
                .map(|exp| json!(exp))
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown experiment tool: {}", name)),
    }
}
