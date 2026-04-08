use crate::config::Config;
use dashmap::DashMap;
use governor::clock::DefaultClock;
use governor::state::keyed::DefaultKeyedStateStore;
use governor::{Quota, RateLimiter};
use once_cell::sync::Lazy;
use std::num::NonZeroU32;
use std::sync::Arc;

type KeyedLimiter = RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>;

static REGISTRY: Lazy<DashMap<String, Arc<KeyedLimiter>>> = Lazy::new(DashMap::new);

fn make_limiter(requests_per_minute: u32) -> Arc<KeyedLimiter> {
    let n = NonZeroU32::new(requests_per_minute).unwrap_or_else(|| NonZeroU32::new(1).unwrap());
    Arc::new(RateLimiter::keyed(Quota::per_minute(n)))
}

/// Called once at startup to populate the rate-limit group registry from config.
pub fn init_groups(config: &Config) {
    let groups = [
        ("auth-strict", config.rate_limit_auth_strict),
        ("auth-loose", config.rate_limit_auth_loose),
        ("tracking", config.rate_limit_tracking),
        ("sdk", config.rate_limit_sdk),
        ("api-default", config.rate_limit_api_default),
    ];
    for (name, quota) in groups {
        REGISTRY.insert(name.to_string(), make_limiter(quota));
    }
}

/// Returns `true` if the request is within the rate limit; `false` if it should be rejected.
///
/// If the group is not found in the registry the request is allowed through.
pub fn check(group: &str, ip: &str) -> bool {
    match REGISTRY.get(group) {
        Some(limiter) => limiter.check_key(&ip.to_string()).is_ok(),
        None => true,
    }
}
