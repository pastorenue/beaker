use anyhow::{Context, Result};
use clickhouse::Client;
use log::info;

#[derive(Clone)]
pub struct ClickHouseClient {
    client: Client,
}

impl ClickHouseClient {
    pub fn new(url: &str) -> Result<Self> {
        let client = Client::default().with_url(url);

        Ok(Self { client })
    }

    pub fn with_database(self, database: &str) -> Self {
        Self {
            client: self.client.with_database(database),
        }
    }

    pub async fn init_schema(&self) -> Result<()> {
        info!("Initializing ClickHouse schema...");

        // Create database
        self.client
            .query("CREATE DATABASE IF NOT EXISTS beaker")
            .execute()
            .await
            .context("Failed to create database")?;

        // User assignments table
        self.client
            .query(
                "CREATE TABLE IF NOT EXISTS beaker.user_assignments (
                    user_id String,
                    experiment_id String,
                    variant String,
                    group_id String,
                    assigned_at DateTime
                ) ENGINE = ReplacingMergeTree(assigned_at)
                ORDER BY (user_id, experiment_id)
                PARTITION BY toYYYYMM(assigned_at)",
            )
            .execute()
            .await
            .context("Failed to create user_assignments table")?;

        // Ensure account_id exists on user_assignments
        self.client
            .query("ALTER TABLE beaker.user_assignments ADD COLUMN IF NOT EXISTS account_id String DEFAULT 'default-org'")
            .execute()
            .await
            .context("Failed to alter user_assignments table (account_id)")?;

        // Metric events table
        self.client
            .query(
                "CREATE TABLE IF NOT EXISTS beaker.metric_events (
                    account_id String DEFAULT 'default-org',
                    event_id String,
                    experiment_id String,
                    user_id String,
                    variant String,
                    metric_name String,
                    metric_value Float64,
                    attributes Nullable(String),
                    timestamp DateTime
                ) ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (experiment_id, metric_name, timestamp)",
            )
            .execute()
            .await
            .context("Failed to create metric_events table")?;

        let metric_event_alters = [
            "ALTER TABLE beaker.metric_events ADD COLUMN IF NOT EXISTS attributes Nullable(String)",
            "ALTER TABLE beaker.metric_events ADD COLUMN IF NOT EXISTS account_id String DEFAULT 'default-org'",
        ];

        for alter in metric_event_alters {
            self.client.query(alter).execute().await?;
        }

        // Sessions table
        self.client
            .query(
                "CREATE TABLE IF NOT EXISTS beaker.sessions (
                    session_id String,
                    user_id Nullable(String),
                    entry_url String,
                    referrer Nullable(String),
                    user_agent Nullable(String),
                    metadata Nullable(String),
                    started_at DateTime,
                    ended_at Nullable(DateTime),
                    duration_seconds Nullable(UInt32),
                    updated_at DateTime
                ) ENGINE = ReplacingMergeTree(updated_at)
                ORDER BY session_id",
            )
            .execute()
            .await
            .context("Failed to create sessions table")?;

        let session_alters = [
            "ALTER TABLE beaker.sessions ADD COLUMN IF NOT EXISTS updated_at DateTime DEFAULT now()",
        ];

        for alter in session_alters {
            self.client.query(alter).execute().await?;
        }

        // Activity events table
        self.client
            .query(
                "CREATE TABLE IF NOT EXISTS beaker.activity_events (
                    event_id String,
                    session_id String,
                    user_id Nullable(String),
                    event_name String,
                    event_type String,
                    url String,
                    selector Nullable(String),
                    x Nullable(Float64),
                    y Nullable(Float64),
                    metadata Nullable(String),
                    timestamp DateTime
                ) ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (session_id, timestamp)",
            )
            .execute()
            .await
            .context("Failed to create activity_events table")?;

        // Replay events table
        self.client
            .query(
                "CREATE TABLE IF NOT EXISTS beaker.replay_events (
                    session_id String,
                    sequence UInt32,
                    event String,
                    timestamp DateTime
                ) ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (session_id, sequence)",
            )
            .execute()
            .await
            .context("Failed to create replay_events table")?;

        // Metric events table, user_assignments, sessions, activity_events, replay_events, analytics_alerts
        // stay in ClickHouse.
        // Configuration tables (experiments, flags, gates, groups, cuped) moved to Postgres.

        info!("Schema initialization complete");
        Ok(())
    }

    pub fn client(&self) -> &Client {
        &self.client
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_creation() {
        let client = ClickHouseClient::new("http://localhost:8123");
        assert!(client.is_ok());
    }
}
