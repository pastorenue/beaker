use crate::db::ClickHouseClient;
use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use log::info;
use uuid::Uuid;

pub struct EventService {
    db: ClickHouseClient,
}

impl EventService {
    pub fn new(db: ClickHouseClient) -> Self {
        Self { db }
    }

    pub async fn ingest_event(
        &self,
        req: IngestEventRequest,
        account_id: uuid::Uuid,
    ) -> Result<MetricEvent> {
        info!("Ingesting event for experiment: {}", req.experiment_id);

        let event = MetricEvent {
            event_id: Uuid::new_v4(),
            experiment_id: req.experiment_id,
            user_id: req.user_id,
            variant: req.variant,
            metric_name: req.metric_name,
            metric_value: req.metric_value,
            attributes: req.attributes.clone(),
            timestamp: req.timestamp.unwrap_or_else(Utc::now),
        };

        let row = MetricEventRow {
            account_id: account_id.to_string(),
            event_id: event.event_id.to_string(),
            experiment_id: event.experiment_id.to_string(),
            user_id: event.user_id.clone(),
            variant: event.variant.clone(),
            metric_name: event.metric_name.clone(),
            metric_value: event.metric_value,
            attributes: event.attributes.as_ref().map(|value| value.to_string()),
            timestamp: event.timestamp.timestamp() as u32,
        };

        let mut insert = self.db.client().insert("metric_events")?;
        insert.write(&row).await?;
        insert.end().await?;

        Ok(event)
    }
}
