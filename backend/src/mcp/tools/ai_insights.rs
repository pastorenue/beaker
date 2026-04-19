use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow, serde::Serialize)]
struct InsightRow {
    id: Uuid,
    account_id: Uuid,
    experiment_id: Uuid,
    polled_at: chrono::DateTime<chrono::Utc>,
    severity: String,
    insight_type: String,
    headline: String,
    detail: String,
    ai_narrative: Option<String>,
    p_value: Option<f64>,
    effect_size: Option<f64>,
    sample_size: Option<i64>,
    auto_actioned: bool,
    dismissed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub fn ai_insights_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_ai_insights",
            "description": "List AI insights for experiments, optionally filtered by experiment or severity",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "experiment_id": {
                        "type": "string",
                        "description": "Optional experiment UUID to filter insights"
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "warning", "critical"],
                        "description": "Optional severity level to filter insights"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of insights to return (default 50)",
                        "default": 50
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Number of insights to skip (default 0)",
                        "default": 0
                    }
                },
                "required": []
            }
        }),
        json!({
            "name": "dismiss_ai_insight",
            "description": "Dismiss an AI insight by its ID",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "insight_id": {
                        "type": "string",
                        "description": "The UUID of the insight to dismiss"
                    }
                },
                "required": ["insight_id"]
            }
        }),
    ]
}

pub async fn call_ai_insights_tool(
    name: &str,
    args: &Value,
    pg: &sqlx::PgPool,
    account_id: Uuid,
) -> Result<Value, String> {
    match name {
        "list_ai_insights" => {
            let experiment_id = args
                .get("experiment_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let severity = args
                .get("severity")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let limit = args
                .get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(50)
                .min(200);
            let offset = args.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

            let rows = if let Some(exp_id) = experiment_id {
                sqlx::query_as::<_, InsightRow>(
                    r#"
                    SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                           headline, detail, ai_narrative, p_value, effect_size, sample_size,
                           auto_actioned, dismissed_at, created_at
                    FROM ai_polling_insights
                    WHERE account_id = $1 AND experiment_id = $2 AND dismissed_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(account_id)
                .bind(exp_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(pg)
                .await
            } else if let Some(sev) = severity {
                sqlx::query_as::<_, InsightRow>(
                    r#"
                    SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                           headline, detail, ai_narrative, p_value, effect_size, sample_size,
                           auto_actioned, dismissed_at, created_at
                    FROM ai_polling_insights
                    WHERE account_id = $1 AND severity = $2 AND dismissed_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(account_id)
                .bind(sev)
                .bind(limit)
                .bind(offset)
                .fetch_all(pg)
                .await
            } else {
                sqlx::query_as::<_, InsightRow>(
                    r#"
                    SELECT id, account_id, experiment_id, polled_at, severity, insight_type,
                           headline, detail, ai_narrative, p_value, effect_size, sample_size,
                           auto_actioned, dismissed_at, created_at
                    FROM ai_polling_insights
                    WHERE account_id = $1 AND dismissed_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    "#,
                )
                .bind(account_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(pg)
                .await
            };

            rows.map(|insights| {
                let total = insights.len() as i64;
                json!({ "insights": insights, "total": total })
            })
            .map_err(|e| e.to_string())
        }
        "dismiss_ai_insight" => {
            let insight_id = args
                .get("insight_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok())
                .ok_or_else(|| "Missing or invalid insight_id".to_string())?;

            sqlx::query(
                "UPDATE ai_polling_insights SET dismissed_at = now() WHERE id = $1 AND account_id = $2",
            )
            .bind(insight_id)
            .bind(account_id)
            .execute(pg)
            .await
            .map(|_| json!({ "ok": true }))
            .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown ai_insights tool: {}", name)),
    }
}
