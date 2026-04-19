#![allow(dead_code)]
use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use log::info;
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

mod api;
mod config;
mod db;
mod mcp;
mod middleware;
mod models;
mod services;
mod stats;
mod utils;

use config::Config;
use db::{connect_postgres, ClickHouseClient};
use mcp::server::McpServer;
use services::{
    AnalyticsService, AuthService, CupedService, EventService, ExperimentService,
    FeatureFlagService, FeatureGateService, InviteService, NotificationService, PollingService,
    SdkTokenService, TelemetryService, TrackingService, UserGroupService,
};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let config = Config::from_env();
    middleware::rate_limit::init_groups(&config);
    info!("Starting Beaker backend...");

    // Connect to databases
    let pg_pool = connect_postgres(&config.postgres_url)
        .await
        .expect("Failed to connect to Postgres");
    let db_client =
        ClickHouseClient::new(&config.clickhouse_url).expect("Failed to connect to ClickHouse");

    // Initial schema setup
    if let Err(err) = db_client.init_schema().await {
        log::warn!("Failed to initialize ClickHouse schema: {err}");
    }

    // Run migrations
    if let Err(err) = sqlx::migrate!("./migrations").run(&pg_pool).await {
        panic!("Failed to run Postgres migrations: {err}");
    }

    if let (Some(email), Some(password)) = (
        config.default_admin_email.clone(),
        config.default_admin_password.clone(),
    ) {
        let auth_service = AuthService::new(pg_pool.clone(), config.clone());
        if let Err(err) = auth_service.ensure_admin(&email, &password).await {
            log::warn!("Failed to create default admin: {}", err);
        }
    }

    // Get default account for SDK tokens
    let account_id = match sqlx::query("SELECT id FROM accounts LIMIT 1")
        .fetch_one(&pg_pool)
        .await
    {
        Ok(row) => row.get::<Uuid, _>("id"),
        Err(_) => Uuid::nil(),
    };

    let sdk_token_service = SdkTokenService::new(pg_pool.clone());
    if !account_id.is_nil() {
        if let Err(err) = sdk_token_service
            .ensure_tokens(
                account_id,
                config.tracking_api_key.clone(),
                config.feature_flags_api_key.clone(),
            )
            .await
        {
            log::warn!("Failed to ensure SDK tokens: {}", err);
        }
    }

    // Create services with database set
    let db_with_auth = db_client.clone().with_database("beaker");
    let experiment_service = web::Data::new(ExperimentService::new(
        pg_pool.clone(),
        db_with_auth.clone(),
    ));
    let user_group_service =
        web::Data::new(UserGroupService::new(pg_pool.clone(), db_with_auth.clone()));
    let feature_flag_service = web::Data::new(FeatureFlagService::new(pg_pool.clone()));
    let feature_gate_service = web::Data::new(FeatureGateService::new(pg_pool.clone()));
    let telemetry_service = web::Data::new(TelemetryService::new(pg_pool.clone()));
    let event_service = web::Data::new(EventService::new(db_with_auth.clone()));
    let analytics_service =
        web::Data::new(AnalyticsService::new(db_with_auth.clone(), pg_pool.clone()));
    let cuped_service = web::Data::new(CupedService::new(pg_pool.clone(), db_with_auth.clone()));
    let invite_service = web::Data::new(InviteService::new(pg_pool.clone(), config.clone()));
    let auth_service_data = web::Data::new(AuthService::new(pg_pool.clone(), config.clone()));
    let sdk_token_service_data = web::Data::new(sdk_token_service);
    let tracking_service = web::Data::new(TrackingService::new(
        db_with_auth.clone(),
        config.session_ttl_minutes,
    ));
    let notification_service = web::Data::new(NotificationService::new(pg_pool.clone()));

    // MCP server (shared across requests)
    let mcp_server = web::Data::new(McpServer::new(
        Arc::new(ExperimentService::new(
            pg_pool.clone(),
            db_with_auth.clone(),
        )),
        Arc::new(FeatureFlagService::new(pg_pool.clone())),
        Arc::new(FeatureGateService::new(pg_pool.clone())),
        Arc::new(AnalyticsService::new(db_with_auth.clone(), pg_pool.clone())),
        pg_pool.clone(),
    ));

    let ai_runtime_config: api::ai::SharedAiConfig =
        std::sync::Arc::new(tokio::sync::RwLock::new(api::ai::AiRuntimeConfig {
            polling_enabled: config.ai_polling_enabled,
            polling_interval_minutes: config.ai_polling_interval_minutes,
            auto_stop_regressions: config.ai_auto_stop_regressions,
            severe_regression_threshold: config.ai_severe_regression_threshold,
        }));

    // Spawn AI polling background task
    if config.ai_polling_enabled {
        let polling = PollingService::new(
            pg_pool.clone(),
            db_client.clone(),
            config.clone(),
            NotificationService::new(pg_pool.clone()),
        );
        tokio::spawn(async move {
            polling.run_loop().await;
        });
        info!("AI polling service spawned");
    }

    let port = config.server_port;

    info!("Server starting on 0.0.0.0:{}", port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(actix_web::middleware::Logger::default())
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(pg_pool.clone()))
            .app_data(experiment_service.clone())
            .app_data(user_group_service.clone())
            .app_data(feature_flag_service.clone())
            .app_data(feature_gate_service.clone())
            .app_data(event_service.clone())
            .app_data(analytics_service.clone())
            .app_data(cuped_service.clone())
            .app_data(invite_service.clone())
            .app_data(auth_service_data.clone())
            .app_data(sdk_token_service_data.clone())
            .app_data(tracking_service.clone())
            .app_data(notification_service.clone())
            .app_data(telemetry_service.clone())
            .app_data(mcp_server.clone())
            .app_data(web::Data::new(ai_runtime_config.clone()))
            .configure(|cfg| api::configure(cfg, pg_pool.clone(), config.clone()))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
