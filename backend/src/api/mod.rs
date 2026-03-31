pub mod accounts;
pub mod ai;
pub mod analytics;
pub mod auth;
pub mod events;
pub mod experiments;
pub mod feature_flags;
pub mod feature_gates;
pub mod invites;
pub mod mcp;
pub mod sdk;
pub mod track;
pub mod user_groups;

use crate::config::Config;
use crate::middleware::auth::AuthMiddleware;
use actix_web::web;
use sqlx::PgPool;

pub fn configure(cfg: &mut web::ServiceConfig, pool: PgPool, config: Config) {
    let mcp_enabled = config.mcp_enabled;
    cfg.service(
        web::scope("/api")
            .wrap(AuthMiddleware::new(pool, config))
            .configure(auth::configure)
            .configure(experiments::configure)
            .configure(user_groups::configure)
            .configure(events::configure)
            .configure(analytics::configure)
            .configure(feature_flags::configure)
            .configure(feature_gates::configure)
            .configure(accounts::configure)
            .configure(invites::configure)
            .configure(sdk::configure)
            .configure(ai::configure)
            .configure(track::configure)
            .configure(move |cfg| {
                if mcp_enabled {
                    mcp::configure(cfg);
                }
            }),
    );
}
