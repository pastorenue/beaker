use dashmap::DashMap;
use once_cell::sync::Lazy;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

pub enum CbState {
    Closed { consecutive_failures: u32 },
    Open { until: Instant },
    HalfOpen,
}

pub struct CircuitBreaker {
    pub failure_threshold: u32,
    pub recovery_timeout: Duration,
    pub state: RwLock<CbState>,
}

impl CircuitBreaker {
    fn new(failure_threshold: u32, recovery_timeout_secs: u64) -> Self {
        Self {
            failure_threshold,
            recovery_timeout: Duration::from_secs(recovery_timeout_secs),
            state: RwLock::new(CbState::Closed {
                consecutive_failures: 0,
            }),
        }
    }

    /// Returns `true` if a new request should be allowed through.
    ///
    /// Transitions `Open → HalfOpen` once the recovery window has elapsed.
    pub async fn should_allow(&self) -> bool {
        let mut state = self.state.write().await;
        match &*state {
            CbState::Closed { .. } => true,
            CbState::Open { until } => {
                if Instant::now() >= *until {
                    *state = CbState::HalfOpen;
                    true
                } else {
                    false
                }
            }
            CbState::HalfOpen => true,
        }
    }

    /// Record a successful response; resets the breaker to Closed.
    pub async fn record_success(&self) {
        let mut state = self.state.write().await;
        *state = CbState::Closed {
            consecutive_failures: 0,
        };
    }

    /// Record a failed response.
    ///
    /// * `Closed` → increments counter; trips to `Open` after `failure_threshold` consecutive failures.
    /// * `HalfOpen` → immediately trips back to `Open`.
    /// * `Open` → no-op.
    pub async fn record_failure(&self) {
        let mut state = self.state.write().await;
        match &*state {
            CbState::Closed {
                consecutive_failures,
            } => {
                let new_failures = consecutive_failures + 1;
                if new_failures >= self.failure_threshold {
                    *state = CbState::Open {
                        until: Instant::now() + self.recovery_timeout,
                    };
                } else {
                    *state = CbState::Closed {
                        consecutive_failures: new_failures,
                    };
                }
            }
            CbState::HalfOpen => {
                *state = CbState::Open {
                    until: Instant::now() + self.recovery_timeout,
                };
            }
            CbState::Open { .. } => {}
        }
    }
}

static REGISTRY: Lazy<DashMap<String, Arc<CircuitBreaker>>> = Lazy::new(DashMap::new);

/// Fetches an existing `CircuitBreaker` from the global registry or creates a new one.
///
/// The `name` key should be the fully-qualified handler path produced by
/// `concat!(module_path!(), "::", fn_name)` in the generated code.
pub fn get_or_create(name: &str, failure_threshold: u32, recovery_timeout_secs: u64) -> Arc<CircuitBreaker> {
    if let Some(cb) = REGISTRY.get(name) {
        return cb.clone();
    }
    let cb = Arc::new(CircuitBreaker::new(failure_threshold, recovery_timeout_secs));
    REGISTRY.insert(name.to_string(), cb.clone());
    cb
}
