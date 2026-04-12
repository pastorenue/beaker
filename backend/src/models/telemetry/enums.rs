use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventType {
    Click,
    Pageview,
    Custom,
    FormSubmit,
    Hover,
}
