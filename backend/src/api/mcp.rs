use actix_web::{web, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::middleware::auth::AuthedUser;
use crate::mcp::server::McpServer;

#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

fn ok_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

fn err_response(id: Option<Value>, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError { code, message, data: None }),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/mcp")
            .route("", web::post().to(handle_mcp))
            .route("/sse", web::get().to(mcp_sse)),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn handle_mcp(
    mcp: web::Data<McpServer>,
    user: web::ReqData<AuthedUser>,
    payload: web::Json<JsonRpcRequest>,
) -> impl Responder {
    let req = payload.into_inner();
    let id = req.id.clone();
    let params = req.params.unwrap_or(json!({}));
    let account_id = user.account_id;

    let result = match req.method.as_str() {
        "initialize" => {
            let resp = json!({
                "protocolVersion": "2025-03-26",
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": "beaker",
                    "version": "1.0.0"
                }
            });
            Ok(resp)
        }
        "notifications/initialized" => {
            // Client notification, no response needed but we still ack
            Ok(json!({}))
        }
        "tools/list" => Ok(mcp.list_tools()),
        "tools/call" => {
            let tool_name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or(json!({}));
            mcp.call_tool(tool_name, &args, account_id).await
        }
        "ping" => Ok(json!({})),
        other => Err(format!("Method not found: {}", other)),
    };

    match result {
        Ok(value) => HttpResponse::Ok().json(ok_response(id, value)),
        Err(msg) => HttpResponse::Ok().json(err_response(id, -32601, msg)),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn mcp_sse() -> impl Responder {
    // SSE endpoint for server-to-client notifications (currently a no-op ping stream)
    HttpResponse::Ok()
        .content_type("text/event-stream")
        .append_header(("Cache-Control", "no-cache"))
        .append_header(("X-Accel-Buffering", "no"))
        .body("data: {\"type\":\"ping\"}\n\n")
}
