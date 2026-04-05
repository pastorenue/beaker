use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateUserGroupRequest {
    pub name: String,
    pub description: String,
    pub assignment_rule: String,
    pub data_source_type: Option<String>,
    pub data_source_config: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub assignment_rule: Option<String>,
    pub data_source_type: Option<String>,
    pub data_source_config: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct GroupDataResponse {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct SyncGroupResponse {
    pub group_id: Uuid,
    pub synced_user_count: usize,
    pub data_source_type: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveUserGroupRequest {
    pub from_experiment_id: Uuid,
    pub to_experiment_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct AssignUserRequest {
    pub user_id: String,
    pub experiment_id: Uuid,
    pub group_id: Uuid,
    pub attributes: Option<serde_json::Value>,
}
