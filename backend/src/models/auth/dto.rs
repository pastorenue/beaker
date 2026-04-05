use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub invite_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    pub remember_me: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyOtpRequest {
    pub email: String,
    pub code: String,
    pub totp_code: Option<String>,
    pub remember_me: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct EnableTotpRequest {
    pub user_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct DisableTotpRequest {
    pub user_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct VerifyTotpRequest {
    pub user_id: Uuid,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct AuthStatusResponse {
    pub requires_otp: bool,
    pub totp_enabled: bool,
    pub dev_code: Option<String>,
    pub token: Option<String>,
    pub user_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct AuthTokenResponse {
    pub token: String,
    pub user_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub otpauth_url: String,
}
