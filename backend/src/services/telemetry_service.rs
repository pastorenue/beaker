use crate::models::*;
use anyhow::{Context, Result};
use chrono::Utc;
use log::info;
use sqlx::PgPool;
use uuid::Uuid;

pub struct TelemetryService {
    pg: PgPool,
}

impl TelemetryService {
    pub fn new(pg: PgPool) -> Self {
        Self { pg }
    }

    // ── REST API methods (event-level) ────────────────────────────────────────

    pub async fn list_all_events(&self, account_id: Uuid) -> Result<Vec<TelemetryEventFlat>> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            definition_id: Uuid,
            experiment_id: Uuid,
            is_active: bool,
            name: String,
            description: String,
            event_type: String,
            selector: Option<String>,
            url_pattern: Option<String>,
            visual_guide: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
        }

        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT te.id, te.definition_id, td.experiment_id, td.is_active,
                      te.name, te.description, te.event_type,
                      te.selector, te.url_pattern, te.visual_guide,
                      td.created_at
               FROM telemetry_events te
               JOIN telemetry_definitions td ON td.id = te.definition_id
               WHERE td.account_id = $1
               ORDER BY td.created_at DESC, te.id"#,
        )
        .bind(account_id)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch telemetry events")?;

        Ok(rows
            .into_iter()
            .map(|r| TelemetryEventFlat {
                id: r.id,
                definition_id: r.definition_id,
                experiment_id: r.experiment_id,
                is_active: r.is_active,
                name: r.name,
                description: r.description,
                event_type: r.event_type,
                selector: r.selector,
                url_pattern: r.url_pattern,
                visual_guide: r.visual_guide,
                created_at: r.created_at,
            })
            .collect())
    }

    pub async fn list_events_for_experiment(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Vec<TelemetryEventFlat>> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            definition_id: Uuid,
            experiment_id: Uuid,
            is_active: bool,
            name: String,
            description: String,
            event_type: String,
            selector: Option<String>,
            url_pattern: Option<String>,
            visual_guide: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
        }

        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT te.id, te.definition_id, td.experiment_id, td.is_active,
                      te.name, te.description, te.event_type,
                      te.selector, te.url_pattern, te.visual_guide,
                      td.created_at
               FROM telemetry_events te
               JOIN telemetry_definitions td ON td.id = te.definition_id
               WHERE td.account_id = $1 AND td.experiment_id = $2
               ORDER BY td.created_at DESC, te.id"#,
        )
        .bind(account_id)
        .bind(experiment_id)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch telemetry events")?;

        Ok(rows
            .into_iter()
            .map(|r| TelemetryEventFlat {
                id: r.id,
                definition_id: r.definition_id,
                experiment_id: r.experiment_id,
                is_active: r.is_active,
                name: r.name,
                description: r.description,
                event_type: r.event_type,
                selector: r.selector,
                url_pattern: r.url_pattern,
                visual_guide: r.visual_guide,
                created_at: r.created_at,
            })
            .collect())
    }

    pub async fn create_event(
        &self,
        req: CreateTelemetryEventRequest,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<TelemetryEventFlat> {
        info!("Creating telemetry event for experiment {}", experiment_id);

        let def_id = Uuid::new_v4();
        let event_id = Uuid::new_v4();
        let now = Utc::now();
        let is_active = req.is_active.unwrap_or(true);
        let event_type = req.event_type.unwrap_or_else(|| "custom".to_string());
        let description = req.description.unwrap_or_default();

        let mut tx = self
            .pg
            .begin()
            .await
            .context("Failed to begin transaction")?;

        sqlx::query(
            r#"INSERT INTO telemetry_definitions
                   (id, account_id, experiment_id, is_active, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(def_id)
        .bind(account_id)
        .bind(experiment_id)
        .bind(is_active)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .context("Failed to insert telemetry definition")?;

        sqlx::query(
            r#"INSERT INTO telemetry_events
                   (id, definition_id, name, description, event_type, selector, url_pattern, visual_guide)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        )
        .bind(event_id)
        .bind(def_id)
        .bind(&req.name)
        .bind(&description)
        .bind(&event_type)
        .bind(&req.selector)
        .bind(&req.url_pattern)
        .bind(&req.visual_guide)
        .execute(&mut *tx)
        .await
        .context("Failed to insert telemetry event")?;

        tx.commit().await.context("Failed to commit transaction")?;

        Ok(TelemetryEventFlat {
            id: event_id,
            definition_id: def_id,
            experiment_id,
            is_active,
            name: req.name,
            description,
            event_type,
            selector: req.selector,
            url_pattern: req.url_pattern,
            visual_guide: req.visual_guide,
            created_at: now,
        })
    }

    pub async fn bulk_create_events(
        &self,
        req: BulkCreateTelemetryEventRequest,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Vec<TelemetryEventFlat>> {
        info!(
            "Bulk-creating {} telemetry events for experiment {}",
            req.events.len(),
            experiment_id
        );

        let now = Utc::now();
        let mut tx = self
            .pg
            .begin()
            .await
            .context("Failed to begin transaction")?;
        let mut results: Vec<TelemetryEventFlat> = Vec::with_capacity(req.events.len());

        for event_req in req.events {
            let def_id = Uuid::new_v4();
            let event_id = Uuid::new_v4();
            let is_active = event_req.is_active.unwrap_or(true);
            let event_type = event_req.event_type.unwrap_or_else(|| "custom".to_string());
            let description = event_req.description.unwrap_or_default();

            sqlx::query(
                r#"INSERT INTO telemetry_definitions
                       (id, account_id, experiment_id, is_active, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6)"#,
            )
            .bind(def_id)
            .bind(account_id)
            .bind(experiment_id)
            .bind(is_active)
            .bind(now)
            .bind(now)
            .execute(&mut *tx)
            .await
            .context("Failed to insert telemetry definition")?;

            sqlx::query(
                r#"INSERT INTO telemetry_events
                       (id, definition_id, name, description, event_type, selector, url_pattern, visual_guide)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
            )
            .bind(event_id)
            .bind(def_id)
            .bind(&event_req.name)
            .bind(&description)
            .bind(&event_type)
            .bind(&event_req.selector)
            .bind(&event_req.url_pattern)
            .bind(&event_req.visual_guide)
            .execute(&mut *tx)
            .await
            .context("Failed to insert telemetry event")?;

            results.push(TelemetryEventFlat {
                id: event_id,
                definition_id: def_id,
                experiment_id,
                is_active,
                name: event_req.name,
                description,
                event_type,
                selector: event_req.selector,
                url_pattern: event_req.url_pattern,
                visual_guide: event_req.visual_guide,
                created_at: now,
            });
        }

        tx.commit().await.context("Failed to commit transaction")?;

        Ok(results)
    }

    pub async fn update_event(
        &self,
        event_id: Uuid,
        account_id: Uuid,
        experiment_id: Uuid,
        req: UpdateTelemetryEventRequest,
    ) -> Result<TelemetryEventFlat> {
        let current = self
            .get_event_flat(event_id, account_id, experiment_id)
            .await?;

        let name = req.name.unwrap_or(current.name);
        let description = req.description.unwrap_or(current.description);
        let event_type = req.event_type.unwrap_or(current.event_type);
        let selector: Option<String> = match req.selector {
            Some(s) if s.is_empty() => None,
            Some(s) => Some(s),
            None => current.selector,
        };
        let url_pattern: Option<String> = match req.url_pattern {
            Some(s) if s.is_empty() => None,
            Some(s) => Some(s),
            None => current.url_pattern,
        };
        let visual_guide: Option<String> = match req.visual_guide {
            Some(s) if s.is_empty() => None,
            Some(s) => Some(s),
            None => current.visual_guide,
        };
        let is_active = req.is_active.unwrap_or(current.is_active);
        let now = Utc::now();

        let mut tx = self
            .pg
            .begin()
            .await
            .context("Failed to begin transaction")?;

        sqlx::query(
            r#"UPDATE telemetry_events
               SET name = $1, description = $2, event_type = $3,
                   selector = $4, url_pattern = $5, visual_guide = $6
               WHERE id = $7"#,
        )
        .bind(&name)
        .bind(&description)
        .bind(&event_type)
        .bind(&selector)
        .bind(&url_pattern)
        .bind(&visual_guide)
        .bind(event_id)
        .execute(&mut *tx)
        .await
        .context("Failed to update telemetry event")?;

        sqlx::query(
            "UPDATE telemetry_definitions SET is_active = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(is_active)
        .bind(now)
        .bind(current.definition_id)
        .execute(&mut *tx)
        .await
        .context("Failed to update telemetry definition")?;

        tx.commit().await.context("Failed to commit transaction")?;

        Ok(TelemetryEventFlat {
            id: event_id,
            definition_id: current.definition_id,
            experiment_id,
            is_active,
            name,
            description,
            event_type,
            selector,
            url_pattern,
            visual_guide,
            created_at: current.created_at,
        })
    }

    pub async fn delete_event(
        &self,
        event_id: Uuid,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<()> {
        // Verify ownership and fetch definition_id
        let (def_id,): (Uuid,) = sqlx::query_as(
            r#"SELECT te.definition_id
               FROM telemetry_events te
               JOIN telemetry_definitions td ON td.id = te.definition_id
               WHERE te.id = $1 AND td.account_id = $2 AND td.experiment_id = $3"#,
        )
        .bind(event_id)
        .bind(account_id)
        .bind(experiment_id)
        .fetch_one(&self.pg)
        .await
        .context("Telemetry event not found")?;

        sqlx::query("DELETE FROM telemetry_events WHERE id = $1")
            .bind(event_id)
            .execute(&self.pg)
            .await
            .context("Failed to delete telemetry event")?;

        // Clean up the parent definition if it has no remaining events
        let (remaining,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM telemetry_events WHERE definition_id = $1")
                .bind(def_id)
                .fetch_one(&self.pg)
                .await
                .context("Failed to count remaining events")?;

        if remaining == 0 {
            sqlx::query("DELETE FROM telemetry_definitions WHERE id = $1")
                .bind(def_id)
                .execute(&self.pg)
                .await
                .context("Failed to delete empty telemetry definition")?;
        }

        Ok(())
    }

    async fn get_event_flat(
        &self,
        event_id: Uuid,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<TelemetryEventFlat> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            definition_id: Uuid,
            experiment_id: Uuid,
            is_active: bool,
            name: String,
            description: String,
            event_type: String,
            selector: Option<String>,
            url_pattern: Option<String>,
            visual_guide: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
        }

        let r = sqlx::query_as::<_, Row>(
            r#"SELECT te.id, te.definition_id, td.experiment_id, td.is_active,
                      te.name, te.description, te.event_type,
                      te.selector, te.url_pattern, te.visual_guide,
                      td.created_at
               FROM telemetry_events te
               JOIN telemetry_definitions td ON td.id = te.definition_id
               WHERE te.id = $1 AND td.account_id = $2 AND td.experiment_id = $3"#,
        )
        .bind(event_id)
        .bind(account_id)
        .bind(experiment_id)
        .fetch_one(&self.pg)
        .await
        .context("Telemetry event not found")?;

        Ok(TelemetryEventFlat {
            id: r.id,
            definition_id: r.definition_id,
            experiment_id: r.experiment_id,
            is_active: r.is_active,
            name: r.name,
            description: r.description,
            event_type: r.event_type,
            selector: r.selector,
            url_pattern: r.url_pattern,
            visual_guide: r.visual_guide,
            created_at: r.created_at,
        })
    }

    // ── SDK methods (definition-level) ────────────────────────────────────────

    pub async fn create_definition(
        &self,
        req: CreateTelemetryDefinitionRequest,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<TelemetryDefinition> {
        info!(
            "Creating telemetry definition for experiment {}",
            experiment_id
        );

        let def_id = Uuid::new_v4();
        let now = Utc::now();
        let is_active = req.is_active.unwrap_or(true);

        let mut tx = self
            .pg
            .begin()
            .await
            .context("Failed to begin transaction")?;

        sqlx::query(
            r#"INSERT INTO telemetry_definitions
                   (id, account_id, experiment_id, is_active, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(def_id)
        .bind(account_id)
        .bind(experiment_id)
        .bind(is_active)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .context("Failed to insert telemetry definition")?;

        let mut events: Vec<TelemetryEvent> = Vec::with_capacity(req.events.len());
        for e in req.events {
            let event_id = Uuid::new_v4();
            let event_type = e.event_type.unwrap_or_else(|| "custom".to_string());
            let description = e.description.unwrap_or_default();
            sqlx::query(
                r#"INSERT INTO telemetry_events
                       (id, definition_id, name, description, event_type, selector, url_pattern, visual_guide)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
            )
            .bind(event_id)
            .bind(def_id)
            .bind(&e.name)
            .bind(&description)
            .bind(&event_type)
            .bind(&e.selector)
            .bind(&e.url_pattern)
            .bind(&e.visual_guide)
            .execute(&mut *tx)
            .await
            .context("Failed to insert telemetry event")?;

            events.push(TelemetryEvent {
                id: event_id,
                definition_id: def_id,
                description,
                name: e.name,
                event_type,
                selector: e.selector,
                url_pattern: e.url_pattern,
                visual_guide: e.visual_guide,
            });
        }

        tx.commit().await.context("Failed to commit transaction")?;

        Ok(TelemetryDefinition {
            id: def_id,
            account_id,
            experiment_id,
            is_active,
            events,
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn list_active_definitions_for_sdk(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Vec<TelemetryDefinition>> {
        #[derive(sqlx::FromRow)]
        struct DefRow {
            id: Uuid,
            account_id: Uuid,
            experiment_id: Uuid,
            is_active: bool,
            created_at: chrono::DateTime<chrono::Utc>,
            updated_at: chrono::DateTime<chrono::Utc>,
        }

        let rows = sqlx::query_as::<_, DefRow>(
            r#"SELECT id, account_id, experiment_id, is_active, created_at, updated_at
               FROM telemetry_definitions
               WHERE account_id = $1 AND experiment_id = $2 AND is_active = true
               ORDER BY updated_at DESC"#,
        )
        .bind(account_id)
        .bind(experiment_id)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch active telemetry definitions")?;

        if rows.is_empty() {
            return Ok(vec![]);
        }

        let def_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
        let events = self.load_events_for_definitions(&def_ids).await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let evs = events.get(&r.id).cloned().unwrap_or_default();
                TelemetryDefinition {
                    id: r.id,
                    account_id: r.account_id,
                    experiment_id: r.experiment_id,
                    is_active: r.is_active,
                    events: evs,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                }
            })
            .collect())
    }

    async fn load_events_for_definitions(
        &self,
        def_ids: &[Uuid],
    ) -> Result<std::collections::HashMap<Uuid, Vec<TelemetryEvent>>> {
        #[derive(sqlx::FromRow)]
        struct EventRow {
            id: Uuid,
            definition_id: Uuid,
            description: String,
            name: String,
            event_type: String,
            selector: Option<String>,
            url_pattern: Option<String>,
            visual_guide: Option<String>,
        }

        let rows = sqlx::query_as::<_, EventRow>(
            r#"SELECT id, definition_id, description, name, event_type,
                      selector, url_pattern, visual_guide
               FROM telemetry_events
               WHERE definition_id = ANY($1)"#,
        )
        .bind(def_ids)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch telemetry events")?;

        let mut map: std::collections::HashMap<Uuid, Vec<TelemetryEvent>> =
            std::collections::HashMap::new();
        for r in rows {
            map.entry(r.definition_id)
                .or_default()
                .push(TelemetryEvent {
                    id: r.id,
                    definition_id: r.definition_id,
                    description: r.description,
                    name: r.name,
                    event_type: r.event_type,
                    selector: r.selector,
                    url_pattern: r.url_pattern,
                    visual_guide: r.visual_guide,
                });
        }
        Ok(map)
    }
}
