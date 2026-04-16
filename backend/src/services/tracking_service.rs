use crate::db::ClickHouseClient;
use crate::models::*;
use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use uuid::Uuid;

pub struct TrackingService {
    db: ClickHouseClient,
    session_ttl_minutes: Option<i64>,
}

#[derive(clickhouse::Row, serde::Deserialize)]
struct CountRow {
    total: u64,
}

impl TrackingService {
    pub fn new(db: ClickHouseClient, session_ttl_minutes: Option<i64>) -> Self {
        Self {
            db,
            session_ttl_minutes,
        }
    }

    pub async fn start_session(
        &self,
        account_id: Uuid,
        req: StartSessionRequest,
    ) -> Result<StartSessionResponse> {
        let session_id = req.session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let started_at = Utc::now();

        let session = Session {
            session_id: session_id.clone(),
            user_id: req.user_id,
            entry_url: req.entry_url,
            referrer: req.referrer,
            user_agent: req.user_agent,
            metadata: req.metadata,
            started_at,
            ended_at: None,
            duration_seconds: None,
            clicks_count: None,
            replay_events_count: None,
            experiment_id: req.experiment_id,
        };

        self.write_session_row(&account_id.to_string(), &session, started_at)
            .await?;

        Ok(StartSessionResponse {
            session_id,
            started_at,
        })
    }

    pub async fn end_session(&self, account_id: Uuid, req: EndSessionRequest) -> Result<Session> {
        let ended_at = req.ended_at.unwrap_or_else(Utc::now);
        let account_id_str = account_id.to_string();
        let mut session = match self.get_session(&req.session_id).await {
            Ok(session) => session,
            Err(_) => {
                let fallback = Session {
                    session_id: req.session_id.clone(),
                    user_id: None,
                    entry_url: String::new(),
                    referrer: None,
                    user_agent: None,
                    metadata: None,
                    started_at: ended_at,
                    ended_at: Some(ended_at),
                    duration_seconds: Some(0),
                    clicks_count: None,
                    replay_events_count: None,
                    experiment_id: None,
                };
                self.write_session_row(&account_id_str, &fallback, ended_at)
                    .await?;
                return Ok(fallback);
            }
        };

        let duration_seconds = ended_at
            .signed_duration_since(session.started_at)
            .num_seconds()
            .max(0) as u32;

        session.ended_at = Some(ended_at);
        session.duration_seconds = Some(duration_seconds);

        self.write_session_row(&account_id_str, &session, ended_at)
            .await?;

        Ok(session)
    }

    pub async fn track_event(&self, req: TrackEventRequest) -> Result<ActivityEvent> {
        let timestamp = req.timestamp.unwrap_or_else(Utc::now);
        let event = ActivityEvent {
            event_id: Uuid::new_v4(),
            session_id: req.session_id,
            user_id: req.user_id,
            event_name: req.event_name,
            event_type: req.event_type,
            url: req.url,
            selector: req.selector,
            x: req.x,
            y: req.y,
            metadata: req.metadata,
            timestamp,
        };

        let row = ActivityEventRow {
            event_id: event.event_id.to_string(),
            session_id: event.session_id.clone(),
            user_id: event.user_id.clone(),
            event_name: event.event_name.clone(),
            event_type: event.event_type.clone(),
            url: event.url.clone(),
            selector: event.selector.clone(),
            x: event.x,
            y: event.y,
            metadata: event.metadata.as_ref().map(|value| value.to_string()),
            timestamp: Self::datetime_to_ts(event.timestamp),
        };

        let insert = format!(
            "INSERT INTO activity_events (event_id, session_id, user_id, event_name, event_type, url, selector, x, y, metadata, timestamp) VALUES ({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})",
            Self::sql_str(&row.event_id),
            Self::sql_str(&row.session_id),
            Self::sql_opt_str(&row.user_id),
            Self::sql_str(&row.event_name),
            Self::sql_str(&row.event_type),
            Self::sql_str(&row.url),
            Self::sql_opt_str(&row.selector),
            Self::sql_opt_f64(row.x),
            Self::sql_opt_f64(row.y),
            Self::sql_opt_str(&row.metadata),
            row.timestamp,
        );
        self.db.client().query(&insert).execute().await?;

        Ok(event)
    }

    pub async fn track_replay(&self, req: TrackReplayRequest) -> Result<usize> {
        let start_sequence = self.get_next_replay_sequence(&req.session_id).await?;
        for (idx, event) in req.events.into_iter().enumerate() {
            let timestamp = event
                .get("timestamp")
                .and_then(|value| value.as_i64())
                .and_then(|ts| Utc.timestamp_millis_opt(ts).single())
                .unwrap_or_else(Utc::now);
            let row = ReplayEventRow {
                session_id: req.session_id.clone(),
                sequence: start_sequence + idx as u32,
                event: event.to_string(),
                timestamp: Self::datetime_to_ts(timestamp),
            };

            self.db
                .client()
                .query(
                    "INSERT INTO replay_events (session_id, sequence, event, timestamp) VALUES (?, ?, ?, ?)",
                )
                .bind(&row.session_id)
                .bind(row.sequence)
                .bind(&row.event)
                .bind(row.timestamp)
                .execute()
                .await?;
        }
        Ok(start_sequence as usize)
    }

    pub async fn list_sessions(
        &self,
        account_id: Uuid,
        limit: usize,
        offset: usize,
    ) -> Result<(Vec<Session>, u64)> {
        let account_id_str = account_id.to_string();

        let total_row = self
            .db
            .client()
            .query("SELECT count() as total FROM sessions FINAL WHERE account_id = ?")
            .bind(&account_id_str)
            .fetch_one::<CountRow>()
            .await
            .context("Failed to count sessions")?;

        let rows = self
            .db
            .client()
            .query("SELECT ?fields FROM sessions FINAL WHERE account_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?")
            .bind(&account_id_str)
            .bind(limit as u64)
            .bind(offset as u64)
            .fetch_all::<SessionRow>()
            .await
            .context("Failed to fetch sessions")?;

        let now = Utc::now();
        let mut sessions: Vec<Session> = rows
            .into_iter()
            .map(Self::row_to_session)
            .collect::<Result<_>>()?;
        if let Some(ttl_minutes) = self.session_ttl_minutes {
            let ttl_seconds = ttl_minutes.saturating_mul(60);
            for session in &mut sessions {
                if session.ended_at.is_none() {
                    let elapsed = now.signed_duration_since(session.started_at).num_seconds();
                    if elapsed >= ttl_seconds {
                        let ended_at = session.started_at + chrono::Duration::seconds(ttl_seconds);
                        session.ended_at = Some(ended_at);
                        session.duration_seconds = Some(ttl_seconds.max(0) as u32);
                    }
                }
            }
        }

        let session_ids: Vec<String> = sessions
            .iter()
            .map(|session| session.session_id.clone())
            .collect();

        if !session_ids.is_empty() {
            let id_list = session_ids
                .iter()
                .map(|id| Self::sql_str(id))
                .collect::<Vec<_>>()
                .join(", ");
            let query = format!(
                "SELECT session_id, count() as clicks FROM activity_events WHERE event_type = 'click' AND session_id IN ({}) GROUP BY session_id",
                id_list
            );
            #[derive(clickhouse::Row, serde::Deserialize)]
            struct ClickRow {
                session_id: String,
                clicks: u64,
            }
            let click_rows = self
                .db
                .client()
                .query(&query)
                .fetch_all::<ClickRow>()
                .await?;
            let mut click_map = std::collections::HashMap::new();
            for row in click_rows {
                click_map.insert(row.session_id, row.clicks);
            }
            for session in &mut sessions {
                session.clicks_count = click_map.get(&session.session_id).copied();
            }

            let replay_query = format!(
                "SELECT session_id, count() as events FROM replay_events WHERE session_id IN ({}) GROUP BY session_id",
                id_list
            );
            #[derive(clickhouse::Row, serde::Deserialize)]
            struct ReplayRow {
                session_id: String,
                events: u64,
            }
            let replay_rows = self
                .db
                .client()
                .query(&replay_query)
                .fetch_all::<ReplayRow>()
                .await?;
            let mut replay_map = std::collections::HashMap::new();
            for row in replay_rows {
                replay_map.insert(row.session_id, row.events);
            }
            for session in &mut sessions {
                session.replay_events_count = replay_map.get(&session.session_id).copied();
            }
        }

        Ok((sessions, total_row.total))
    }

    pub async fn get_replay_events(
        &self,
        session_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<serde_json::Value>> {
        let rows = self
            .db
            .client()
            .query(
                "SELECT ?fields FROM replay_events WHERE session_id = ? ORDER BY sequence ASC LIMIT ? OFFSET ?",
            )
            .bind(session_id)
            .bind(limit as u64)
            .bind(offset as u64)
            .fetch_all::<ReplayEventRow>()
            .await
            .context("Failed to fetch replay events")?;

        let events: Vec<serde_json::Value> = rows
            .into_iter()
            .filter_map(|row| serde_json::from_str(&row.event).ok())
            .collect();

        let start_index = events
            .iter()
            .position(|event| event.get("type").and_then(|value| value.as_i64()) == Some(2))
            .unwrap_or(0);

        Ok(events.into_iter().skip(start_index).collect())
    }

    pub async fn list_account_activity_events(
        &self,
        account_id: Uuid,
        event_type: Option<&str>,
        event_name: Option<&str>,
        days_back: u32,
        from_date: Option<&str>,
        to_date: Option<&str>,
        limit: usize,
        offset: usize,
        experiment_id: Option<&str>,
    ) -> Result<(Vec<ActivityEvent>, u64)> {
        let account_id_str = account_id.to_string();

        let session_subquery = if let Some(eid) = experiment_id {
            format!(
                "SELECT session_id FROM sessions FINAL WHERE account_id = {} AND experiment_id = {}",
                Self::sql_str(&account_id_str),
                Self::sql_str(eid),
            )
        } else {
            format!(
                "SELECT session_id FROM sessions FINAL WHERE account_id = {}",
                Self::sql_str(&account_id_str),
            )
        };

        let time_clause = Self::build_time_clause(days_back, from_date, to_date);

        let mut count_query = format!(
            "SELECT count() as total FROM activity_events ae INNER JOIN ({}) AS s ON ae.session_id = s.session_id WHERE {}",
            session_subquery, time_clause,
        );
        if let Some(et) = event_type {
            count_query.push_str(&format!(" AND ae.event_type = {}", Self::sql_str(et)));
        }
        if let Some(en) = event_name {
            count_query.push_str(&format!(
                " AND ae.event_name LIKE {}",
                Self::sql_str(&format!("%{}%", en))
            ));
        }

        let total_row = self
            .db
            .client()
            .query(&count_query)
            .fetch_one::<CountRow>()
            .await
            .context("Failed to count account activity events")?;

        let mut data_query = format!(
            "SELECT ae.event_id, ae.session_id, ae.user_id, ae.event_name, ae.event_type, ae.url, ae.selector, ae.x, ae.y, ae.metadata, ae.timestamp FROM activity_events ae INNER JOIN ({}) AS s ON ae.session_id = s.session_id WHERE {}",
            session_subquery, time_clause,
        );
        if let Some(et) = event_type {
            data_query.push_str(&format!(" AND ae.event_type = {}", Self::sql_str(et)));
        }
        if let Some(en) = event_name {
            data_query.push_str(&format!(
                " AND ae.event_name LIKE {}",
                Self::sql_str(&format!("%{}%", en))
            ));
        }
        data_query.push_str(&format!(
            " ORDER BY ae.timestamp DESC LIMIT {} OFFSET {}",
            limit, offset
        ));

        let rows = self
            .db
            .client()
            .query(&data_query)
            .fetch_all::<ActivityEventRow>()
            .await
            .context("Failed to fetch account activity events")?;

        let events = rows
            .into_iter()
            .map(Self::row_to_activity_event)
            .collect::<Result<_>>()?;
        Ok((events, total_row.total))
    }

    pub async fn daily_event_counts(
        &self,
        account_id: Uuid,
        event_type: Option<&str>,
        event_name: Option<&str>,
        days_back: u32,
        from_date: Option<&str>,
        to_date: Option<&str>,
        experiment_id: Option<&str>,
    ) -> Result<Vec<DailyEventCount>> {
        let account_id_str = account_id.to_string();

        let session_subquery = if let Some(eid) = experiment_id {
            format!(
                "SELECT session_id FROM sessions FINAL WHERE account_id = {} AND experiment_id = {}",
                Self::sql_str(&account_id_str),
                Self::sql_str(eid),
            )
        } else {
            format!(
                "SELECT session_id FROM sessions FINAL WHERE account_id = {}",
                Self::sql_str(&account_id_str),
            )
        };

        let time_clause = Self::build_time_clause(days_back, from_date, to_date);

        let mut query = format!(
            "SELECT toString(toDate(ae.timestamp)) as day, ae.event_name, ae.event_type, toUInt64(count()) as count \
             FROM activity_events ae \
             INNER JOIN ({}) AS s ON ae.session_id = s.session_id \
             WHERE {}",
            session_subquery, time_clause,
        );
        if let Some(et) = event_type {
            query.push_str(&format!(" AND ae.event_type = {}", Self::sql_str(et)));
        }
        if let Some(en) = event_name {
            query.push_str(&format!(
                " AND ae.event_name LIKE {}",
                Self::sql_str(&format!("%{}%", en))
            ));
        }
        query.push_str(" GROUP BY day, ae.event_name, ae.event_type ORDER BY day");

        #[derive(clickhouse::Row, serde::Deserialize)]
        struct Row {
            day: String,
            event_name: String,
            event_type: String,
            count: u64,
        }

        let rows = self
            .db
            .client()
            .query(&query)
            .fetch_all::<Row>()
            .await
            .context("Failed to fetch daily event counts")?;

        Ok(rows
            .into_iter()
            .map(|r| DailyEventCount {
                day: r.day,
                event_name: r.event_name,
                event_type: r.event_type,
                count: r.count,
            })
            .collect())
    }

    pub async fn list_activity_events(
        &self,
        session_id: &str,
        event_type: Option<&str>,
        limit: usize,
    ) -> Result<Vec<ActivityEvent>> {
        let mut query = String::from("SELECT ?fields FROM activity_events WHERE session_id = ?");
        if event_type.is_some() {
            query.push_str(" AND event_type = ?");
        }
        query.push_str(" ORDER BY timestamp DESC LIMIT ?");

        let mut request = self.db.client().query(&query).bind(session_id);
        if let Some(kind) = event_type {
            request = request.bind(kind);
        }
        let rows = request
            .bind(limit as u64)
            .fetch_all::<ActivityEventRow>()
            .await
            .context("Failed to fetch activity events")?;

        rows.into_iter().map(Self::row_to_activity_event).collect()
    }

    async fn get_session(&self, session_id: &str) -> Result<Session> {
        let row = self
            .db
            .client()
            .query("SELECT ?fields FROM sessions FINAL WHERE session_id = ?")
            .bind(session_id)
            .fetch_one::<SessionRow>()
            .await
            .context("Failed to fetch session")?;

        Self::row_to_session(row)
    }

    async fn write_session_row(
        &self,
        account_id: &str,
        session: &Session,
        updated_at: DateTime<Utc>,
    ) -> Result<()> {
        let row = SessionRow {
            account_id: account_id.to_string(),
            session_id: session.session_id.clone(),
            user_id: session.user_id.clone(),
            entry_url: session.entry_url.clone(),
            referrer: session.referrer.clone(),
            user_agent: session.user_agent.clone(),
            metadata: session.metadata.as_ref().map(|value| value.to_string()),
            started_at: Self::datetime_to_ts(session.started_at),
            ended_at: session.ended_at.map(Self::datetime_to_ts),
            duration_seconds: session.duration_seconds,
            updated_at: Self::datetime_to_ts(updated_at),
            experiment_id: session.experiment_id.clone(),
        };

        let insert = format!(
            "INSERT INTO sessions (account_id, session_id, user_id, entry_url, referrer, user_agent, metadata, started_at, ended_at, duration_seconds, updated_at, experiment_id) VALUES ({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})",
            Self::sql_str(&row.account_id),
            Self::sql_str(&row.session_id),
            Self::sql_opt_str(&row.user_id),
            Self::sql_str(&row.entry_url),
            Self::sql_opt_str(&row.referrer),
            Self::sql_opt_str(&row.user_agent),
            Self::sql_opt_str(&row.metadata),
            row.started_at,
            Self::sql_opt_u32(row.ended_at),
            Self::sql_opt_u32(row.duration_seconds),
            row.updated_at,
            Self::sql_opt_str(&row.experiment_id),
        );
        self.db.client().query(&insert).execute().await?;
        Ok(())
    }

    async fn get_next_replay_sequence(&self, session_id: &str) -> Result<u32> {
        #[derive(clickhouse::Row, serde::Deserialize)]
        struct MaxSeqRow {
            max_seq: Option<u64>,
        }

        let row = self
            .db
            .client()
            .query("SELECT max(sequence) as max_seq FROM replay_events WHERE session_id = ?")
            .bind(session_id)
            .fetch_one::<MaxSeqRow>()
            .await
            .unwrap_or(MaxSeqRow { max_seq: None });

        Ok(row
            .max_seq
            .map(|value| value.saturating_add(1) as u32)
            .unwrap_or(0))
    }

    fn row_to_session(row: SessionRow) -> Result<Session> {
        let metadata = match row.metadata {
            Some(payload) => serde_json::from_str(&payload).ok(),
            None => None,
        };
        Ok(Session {
            session_id: row.session_id,
            user_id: row.user_id,
            entry_url: row.entry_url,
            referrer: row.referrer,
            user_agent: row.user_agent,
            metadata,
            started_at: Self::ts_to_datetime(row.started_at),
            ended_at: row.ended_at.map(Self::ts_to_datetime),
            duration_seconds: row.duration_seconds,
            clicks_count: None,
            replay_events_count: None,
            experiment_id: row.experiment_id,
        })
    }

    fn row_to_activity_event(row: ActivityEventRow) -> Result<ActivityEvent> {
        let metadata = match row.metadata {
            Some(payload) => serde_json::from_str(&payload).ok(),
            None => None,
        };
        Ok(ActivityEvent {
            event_id: Uuid::parse_str(&row.event_id).unwrap_or_else(|_| Uuid::new_v4()),
            session_id: row.session_id,
            user_id: row.user_id,
            event_name: row.event_name,
            event_type: row.event_type,
            url: row.url,
            selector: row.selector,
            x: row.x,
            y: row.y,
            metadata,
            timestamp: Self::ts_to_datetime(row.timestamp),
        })
    }

    fn ts_to_datetime(ts: u32) -> DateTime<Utc> {
        Utc.timestamp_opt(ts as i64, 0)
            .single()
            .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap())
    }

    fn datetime_to_ts(dt: DateTime<Utc>) -> u32 {
        dt.timestamp() as u32
    }

    fn sql_str(value: &str) -> String {
        format!("'{}'", value.replace('\'', "\\'"))
    }

    fn sql_opt_str(value: &Option<String>) -> String {
        value
            .as_ref()
            .map(|val| Self::sql_str(val))
            .unwrap_or_else(|| "NULL".to_string())
    }

    fn sql_opt_u32(value: Option<u32>) -> String {
        value
            .map(|val| val.to_string())
            .unwrap_or_else(|| "NULL".to_string())
    }

    fn sql_opt_f64(value: Option<f64>) -> String {
        value
            .map(|val| val.to_string())
            .unwrap_or_else(|| "NULL".to_string())
    }

    fn build_time_clause(days_back: u32, from_date: Option<&str>, to_date: Option<&str>) -> String {
        let valid_from = from_date.and_then(|d| {
            NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .ok()
                .map(|nd| nd.format("%Y-%m-%d").to_string())
        });
        let valid_to = to_date.and_then(|d| {
            NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .ok()
                .map(|nd| nd.format("%Y-%m-%d").to_string())
        });
        match (valid_from, valid_to) {
            (Some(from), Some(to)) => format!(
                "ae.timestamp >= toDateTime('{}') AND ae.timestamp < toDateTime('{}') + INTERVAL 1 DAY",
                from, to
            ),
            _ => format!("ae.timestamp >= now() - INTERVAL {} DAY", days_back),
        }
    }
}
