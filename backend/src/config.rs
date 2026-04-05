use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub server_host: String,
    pub server_port: u16,
    pub clickhouse_url: String,
    pub postgres_url: String,
    pub log_level: String,
    pub tracking_api_key: Option<String>,
    pub feature_flags_api_key: Option<String>,
    pub session_ttl_minutes: Option<i64>,
    pub litellm_base_url: Option<String>,
    pub litellm_api_key: Option<String>,
    pub litellm_default_model: Option<String>,
    pub litellm_models: Vec<String>,
    pub smtp_host: Option<String>,
    pub smtp_user: Option<String>,
    pub smtp_pass: Option<String>,
    pub smtp_from: Option<String>,
    pub smtp_port: u16,
    pub allow_dev_otp: bool,
    pub log_only_otp: bool,
    pub jwt_secret: String,
    pub jwt_ttl_minutes: i64,
    pub default_admin_email: Option<String>,
    pub default_admin_password: Option<String>,
    // MCP config
    pub mcp_enabled: bool,
    pub mcp_api_key: Option<String>,
    pub mcp_account_id: Option<String>,
    // AI polling config
    pub ai_polling_enabled: bool,
    pub ai_polling_interval_minutes: u64,
    pub ai_auto_stop_regressions: bool,
    pub ai_severe_regression_threshold: f64,
    // Google OAuth
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_redirect_uri: String,
    pub frontend_base_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        dotenv::dotenv().ok();

        Self {
            server_host: std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("SERVER_PORT must be a valid number"),
            clickhouse_url: std::env::var("CLICKHOUSE_URL")
                .unwrap_or_else(|_| "http://clickhouse:8123".to_string()),
            postgres_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://expothesis:expothesis@postgres:5432/expothesis".to_string()
            }),
            log_level: std::env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            tracking_api_key: std::env::var("TRACKING_API_KEY")
                .ok()
                .filter(|key| !key.is_empty()),
            feature_flags_api_key: std::env::var("FEATURE_FLAGS_API_KEY")
                .ok()
                .filter(|key| !key.is_empty()),
            session_ttl_minutes: std::env::var("SESSION_TTL_MINUTES")
                .ok()
                .and_then(|value| value.parse::<i64>().ok())
                .filter(|value| *value > 0),
            litellm_base_url: std::env::var("LITELLM_BASE_URL")
                .ok()
                .filter(|value| !value.is_empty()),
            litellm_api_key: std::env::var("LITELLM_API_KEY")
                .ok()
                .filter(|value| !value.is_empty()),
            litellm_default_model: std::env::var("LITELLM_DEFAULT_MODEL")
                .ok()
                .filter(|value| !value.is_empty()),
            litellm_models: std::env::var("LITELLM_MODELS")
                .unwrap_or_default()
                .split(',')
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            smtp_host: std::env::var("SMTP_HOST")
                .ok()
                .filter(|value| !value.is_empty()),
            smtp_port: std::env::var("SMTP_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(|| {
                    if std::env::var("SMTP_HOST")
                        .map(|h| h == "mailpit")
                        .unwrap_or(false)
                    {
                        1025
                    } else {
                        25
                    }
                }),
            smtp_user: std::env::var("SMTP_USER")
                .ok()
                .filter(|value| !value.is_empty()),
            smtp_pass: std::env::var("SMTP_PASS")
                .ok()
                .filter(|value| !value.is_empty()),
            smtp_from: std::env::var("SMTP_FROM")
                .ok()
                .filter(|value| !value.is_empty()),
            allow_dev_otp: std::env::var("ALLOW_DEV_OTP")
                .ok()
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            log_only_otp: std::env::var("LOG_ONLY_OTP")
                .ok()
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "change-me".to_string()),
            jwt_ttl_minutes: std::env::var("JWT_TTL_MINUTES")
                .ok()
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(60),
            default_admin_email: std::env::var("DEFAULT_ADMIN_EMAIL")
                .ok()
                .filter(|value| !value.is_empty()),
            default_admin_password: std::env::var("DEFAULT_ADMIN_PASSWORD")
                .ok()
                .filter(|value| !value.is_empty()),
            mcp_enabled: std::env::var("MCP_ENABLED")
                .ok()
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
            mcp_api_key: std::env::var("MCP_API_KEY")
                .ok()
                .filter(|v| !v.is_empty()),
            mcp_account_id: std::env::var("MCP_ACCOUNT_ID")
                .ok()
                .filter(|v| !v.is_empty()),
            ai_polling_enabled: std::env::var("AI_POLLING_ENABLED")
                .ok()
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
            ai_polling_interval_minutes: std::env::var("AI_POLLING_INTERVAL_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15),
            ai_auto_stop_regressions: std::env::var("AI_AUTO_STOP_REGRESSIONS")
                .ok()
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            ai_severe_regression_threshold: std::env::var("AI_SEVERE_REGRESSION_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(-0.10),
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
            google_redirect_uri: std::env::var("GOOGLE_REDIRECT_URI")
                .unwrap_or_else(|_| "http://localhost:8080/api/auth/oauth/google/callback".to_string()),
            frontend_base_url: std::env::var("FRONTEND_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:5173".to_string()),
        }
    }
}
