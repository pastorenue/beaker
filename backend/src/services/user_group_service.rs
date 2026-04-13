use crate::db::ClickHouseClient;
use crate::models::*;
use crate::services::targeting::TargetingEngine;
use anyhow::{Context, Result};
use chrono::Utc;
use log::info;
use reqwest::Client;
use sqlx::PgPool;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use uuid::Uuid;

pub struct UserGroupService {
    pg: PgPool,
    ch: ClickHouseClient,
    http_client: Client,
}

impl UserGroupService {
    pub fn new(pg: PgPool, ch: ClickHouseClient) -> Self {
        Self {
            pg,
            ch,
            http_client: Client::new(),
        }
    }

    pub async fn create_user_group(
        &self,
        req: CreateUserGroupRequest,
        account_id: Uuid,
    ) -> Result<UserGroup> {
        info!("Creating user group: {}", req.name);

        let data_source_type = req.data_source_type.unwrap_or_else(|| "none".to_string());
        let data_source_config = req.data_source_config.unwrap_or(serde_json::json!({}));

        let group = UserGroup {
            account_id,
            id: Uuid::new_v4(),
            name: req.name,
            description: req.description,
            assignment_rule: req.assignment_rule,
            size: 0,
            data_source_type,
            data_source_config,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.upsert_user_group(&group).await?;
        Ok(group)
    }

    pub async fn get_user_group(&self, account_id: Uuid, group_id: Uuid) -> Result<UserGroup> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            account_id: Uuid,
            name: String,
            description: String,
            assignment_rule: String,
            size: i32,
            data_source_type: String,
            data_source_config: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
            updated_at: chrono::DateTime<chrono::Utc>,
        }

        let r = sqlx::query_as::<_, Row>(
            r#"SELECT id, account_id, name, description, assignment_rule, size,
                      data_source_type, data_source_config::text AS data_source_config,
                      created_at, updated_at
               FROM user_groups
               WHERE id = $1 AND account_id = $2"#,
        )
        .bind(group_id)
        .bind(account_id)
        .fetch_one(&self.pg)
        .await
        .context("Failed to fetch user group")?;

        let data_source_config: serde_json::Value =
            serde_json::from_str(r.data_source_config.as_deref().unwrap_or("{}"))
                .unwrap_or(serde_json::json!({}));

        Ok(UserGroup {
            account_id: r.account_id,
            id: r.id,
            name: r.name,
            description: r.description,
            assignment_rule: r.assignment_rule,
            size: r.size as usize,
            data_source_type: r.data_source_type,
            data_source_config,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }

    pub async fn list_user_groups(&self, account_id: Uuid) -> Result<Vec<UserGroup>> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            account_id: Uuid,
            name: String,
            description: String,
            assignment_rule: String,
            size: i32,
            data_source_type: String,
            data_source_config: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
            updated_at: chrono::DateTime<chrono::Utc>,
        }

        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT id, account_id, name, description, assignment_rule, size,
                      data_source_type, data_source_config::text AS data_source_config,
                      created_at, updated_at
               FROM user_groups
               WHERE account_id = $1
               ORDER BY updated_at DESC"#,
        )
        .bind(account_id)
        .fetch_all(&self.pg)
        .await
        .context("Failed to fetch user groups")?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let data_source_config: serde_json::Value =
                    serde_json::from_str(r.data_source_config.as_deref().unwrap_or("{}"))
                        .unwrap_or(serde_json::json!({}));
                UserGroup {
                    account_id: r.account_id,
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    assignment_rule: r.assignment_rule,
                    size: r.size as usize,
                    data_source_type: r.data_source_type,
                    data_source_config,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                }
            })
            .collect::<Vec<_>>())
    }

    pub async fn update_user_group(
        &self,
        account_id: Uuid,
        group_id: Uuid,
        req: UpdateUserGroupRequest,
    ) -> Result<UserGroup> {
        let mut group = self.get_user_group(account_id, group_id).await?;

        if let Some(name) = req.name {
            group.name = name;
        }
        if let Some(description) = req.description {
            group.description = description;
        }
        if let Some(assignment_rule) = req.assignment_rule {
            group.assignment_rule = assignment_rule;
        }
        if let Some(data_source_type) = req.data_source_type {
            group.data_source_type = data_source_type;
        }
        if let Some(data_source_config) = req.data_source_config {
            group.data_source_config = data_source_config;
        }

        group.updated_at = Utc::now();
        self.upsert_user_group(&group).await?;
        Ok(group)
    }

    pub async fn delete_user_group(&self, account_id: Uuid, group_id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM user_groups WHERE id = $1 AND account_id = $2")
            .bind(group_id)
            .bind(account_id)
            .execute(&self.pg)
            .await
            .context("Failed to delete user group")?;

        Ok(())
    }

    pub async fn assign_user_to_variant(
        &self,
        account_id: Uuid,
        user_id: &str,
        experiment_id: Uuid,
        group_id: Uuid,
        variants: &[Variant],
        sampling_method: SamplingMethod,
        sampling_seed: u64,
        attributes: Option<serde_json::Value>,
    ) -> Result<UserAssignment> {
        info!("Assigning user {} to experiment {}", user_id, experiment_id);

        let variant_name = self.select_variant(
            user_id,
            experiment_id,
            variants,
            sampling_method,
            sampling_seed,
            attributes,
        );

        let assignment = UserAssignment {
            account_id,
            user_id: user_id.to_string(),
            experiment_id,
            variant: variant_name,
            group_id,
            assigned_at: Utc::now(),
        };

        // user_assignments stays in ClickHouse (analytics write-path)
        self.save_assignment_ch(account_id, &assignment).await?;

        Ok(assignment)
    }

    pub async fn assign_user_auto(
        &self,
        account_id: Uuid,
        user_id: &str,
        experiment_id: Uuid,
        group_id: Uuid,
        attributes: Option<serde_json::Value>,
    ) -> Result<UserAssignment> {
        let experiment = self
            .get_experiment_from_pg(account_id, experiment_id)
            .await?;
        let group = self.get_user_group(account_id, group_id).await?;

        if !group.assignment_rule.is_empty()
            && group.assignment_rule != "random"
            && group.assignment_rule != "hash"
            && group.assignment_rule != "manual"
        {
            let attrs = attributes.clone().unwrap_or(serde_json::json!({}));
            if !TargetingEngine::evaluate(&group.assignment_rule, &attrs) {
                return Err(anyhow::anyhow!(
                    "User does not meet targeting criteria for group {}",
                    group.name
                ));
            }
        }

        self.assign_user_to_variant(
            account_id,
            user_id,
            experiment_id,
            group_id,
            &experiment.variants,
            experiment.sampling_method,
            experiment.sampling_seed,
            attributes,
        )
        .await
    }

    pub async fn move_user_group(
        &self,
        account_id: Uuid,
        group_id: Uuid,
        from_experiment_id: Uuid,
        to_experiment_id: Uuid,
    ) -> Result<()> {
        info!(
            "Moving user group {} from experiment {} to {}",
            group_id, from_experiment_id, to_experiment_id
        );

        let user_ids = self.get_group_user_ids(group_id).await?;
        let to_experiment = self
            .get_experiment_from_pg(account_id, to_experiment_id)
            .await?;

        for user_id in user_ids {
            self.assign_user_to_variant(
                account_id,
                &user_id,
                to_experiment_id,
                group_id,
                &to_experiment.variants,
                to_experiment.sampling_method.clone(),
                to_experiment.sampling_seed,
                None,
            )
            .await?;
        }

        Ok(())
    }

    pub async fn get_group_metrics(
        &self,
        account_id: Uuid,
        group_id: Uuid,
    ) -> Result<GroupMetrics> {
        let group = self.get_user_group(account_id, group_id).await?;

        Ok(GroupMetrics {
            group_id,
            total_users: group.size,
            active_users: group.size,
            conversion_rate: 0.15,
        })
    }

    pub async fn get_group_data(
        &self,
        account_id: Uuid,
        group_id: Uuid,
    ) -> Result<GroupDataResponse> {
        let group = self.get_user_group(account_id, group_id).await?;

        match group.data_source_type.as_str() {
            "csv" => {
                let config: CsvDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid CSV data source config")?;
                if !config.headers.is_empty() {
                    Ok(GroupDataResponse {
                        headers: config.headers,
                        rows: config.rows,
                    })
                } else {
                    Ok(GroupDataResponse {
                        headers: vec!["user_id".to_string()],
                        rows: config.user_ids.into_iter().map(|id| vec![id]).collect(),
                    })
                }
            }
            "looker" => {
                let config: LookerDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid Looker data source config")?;
                let user_ids = self.sync_from_looker(&config).await?;
                Ok(GroupDataResponse {
                    headers: vec!["user_id".to_string()],
                    rows: user_ids.into_iter().map(|id| vec![id]).collect(),
                })
            }
            "postgres_query" => {
                let config: PostgresDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid PostgreSQL data source config")?;
                self.fetch_rows_from_postgres(&config).await
            }
            other => {
                anyhow::bail!("Cannot retrieve data for data_source_type '{}'", other);
            }
        }
    }

    pub async fn sync_user_group(
        &self,
        account_id: Uuid,
        group_id: Uuid,
    ) -> Result<SyncGroupResponse> {
        let mut group = self.get_user_group(account_id, group_id).await?;

        let user_ids: Vec<String> = match group.data_source_type.as_str() {
            "csv" => {
                let config: CsvDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid CSV data source config")?;
                if config.user_ids.len() > 100_000 {
                    anyhow::bail!("CSV data source exceeds maximum of 100,000 user IDs");
                }
                config.user_ids
            }
            "looker" => {
                let config: LookerDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid Looker data source config")?;
                self.sync_from_looker(&config).await?
            }
            "postgres_query" => {
                let config: PostgresDataSourceConfig =
                    serde_json::from_value(group.data_source_config.clone())
                        .context("Invalid PostgreSQL data source config")?;
                self.sync_from_postgres(&config).await?
            }
            other => {
                anyhow::bail!("Cannot sync group with data_source_type '{}'", other);
            }
        };

        let synced_count = user_ids.len();
        group.size = synced_count;
        group.updated_at = Utc::now();
        self.upsert_user_group(&group).await?;

        Ok(SyncGroupResponse {
            group_id,
            synced_user_count: synced_count,
            data_source_type: group.data_source_type.clone(),
        })
    }

    async fn fetch_rows_from_postgres(
        &self,
        config: &PostgresDataSourceConfig,
    ) -> Result<GroupDataResponse> {
        let query = config.query.trim().trim_end_matches(';');
        if !query.to_uppercase().starts_with("SELECT") {
            anyhow::bail!("PostgreSQL query must start with SELECT");
        }

        let wrapped = format!(
            "SELECT row_to_json(_t)::text AS _row FROM ({}) AS _t LIMIT 100000",
            query
        );

        let json_strs: Vec<String> = if config.is_internal {
            sqlx::query_scalar::<_, String>(&wrapped)
                .fetch_all(&self.pg)
                .await
                .context("Failed to execute internal PostgreSQL query")?
        } else {
            let conn_str = config
                .connection_string
                .as_deref()
                .context("External PostgreSQL requires a connection_string")?;
            let pool = sqlx::PgPool::connect(conn_str)
                .await
                .context("Failed to connect to external PostgreSQL")?;
            let results = sqlx::query_scalar::<_, String>(&wrapped)
                .fetch_all(&pool)
                .await
                .context("Failed to execute external PostgreSQL query")?;
            pool.close().await;
            results
        };

        if json_strs.is_empty() {
            return Ok(GroupDataResponse {
                headers: vec![],
                rows: vec![],
            });
        }

        let first: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&json_strs[0]).context("Failed to parse row JSON")?;
        let headers: Vec<String> = first.keys().cloned().collect();

        let rows: Vec<Vec<String>> = json_strs
            .iter()
            .filter_map(|s| {
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(s).ok()
            })
            .map(|obj| {
                headers
                    .iter()
                    .map(|h| {
                        obj.get(h)
                            .map(|v| match v {
                                serde_json::Value::Null => String::new(),
                                serde_json::Value::String(s) => s.clone(),
                                other => other.to_string(),
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .collect();

        Ok(GroupDataResponse { headers, rows })
    }

    async fn sync_from_looker(&self, config: &LookerDataSourceConfig) -> Result<Vec<String>> {
        // Authenticate with Looker API
        let login_url = format!("{}/api/4.0/login", config.api_url.trim_end_matches('/'));
        let login_resp: serde_json::Value = self
            .http_client
            .post(&login_url)
            .form(&[
                ("client_id", config.client_id.as_str()),
                ("client_secret", config.client_secret.as_str()),
            ])
            .send()
            .await
            .context("Failed to connect to Looker API")?
            .json()
            .await
            .context("Failed to parse Looker login response")?;

        let token = login_resp["access_token"]
            .as_str()
            .context("Missing access_token in Looker login response")?
            .to_string();

        // Run the Look and get JSON results
        let look_url = format!(
            "{}/api/4.0/looks/{}/run/json",
            config.api_url.trim_end_matches('/'),
            config.look_id
        );
        let rows: Vec<serde_json::Value> = self
            .http_client
            .get(&look_url)
            .bearer_auth(&token)
            .query(&[("limit", "100000")])
            .send()
            .await
            .context("Failed to run Looker Look")?
            .json()
            .await
            .context("Failed to parse Looker Look response")?;

        // Extract the first string field from each row
        let user_ids: Vec<String> = rows
            .into_iter()
            .filter_map(|row| {
                row.as_object()
                    .and_then(|obj| obj.values().next())
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect();

        Ok(user_ids)
    }

    async fn sync_from_postgres(&self, config: &PostgresDataSourceConfig) -> Result<Vec<String>> {
        let trimmed = config.query.trim().to_uppercase();
        if !trimmed.starts_with("SELECT") {
            anyhow::bail!("PostgreSQL query must start with SELECT");
        }

        let user_ids: Vec<String> = if config.is_internal {
            sqlx::query_scalar::<_, String>(&config.query)
                .fetch_all(&self.pg)
                .await
                .context("Failed to execute internal PostgreSQL query")?
                .into_iter()
                .take(100_000)
                .collect()
        } else {
            let conn_str = config
                .connection_string
                .as_deref()
                .context("External PostgreSQL requires a connection_string")?;
            let pool = sqlx::PgPool::connect(conn_str)
                .await
                .context("Failed to connect to external PostgreSQL")?;
            let results = sqlx::query_scalar::<_, String>(&config.query)
                .fetch_all(&pool)
                .await
                .context("Failed to execute external PostgreSQL query")?;
            pool.close().await;
            results.into_iter().take(100_000).collect()
        };

        Ok(user_ids)
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    async fn upsert_user_group(&self, group: &UserGroup) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO user_groups
                (id, account_id, name, description, assignment_rule, size,
                 data_source_type, data_source_config, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (id) DO UPDATE SET
                 name               = EXCLUDED.name,
                 description        = EXCLUDED.description,
                 assignment_rule    = EXCLUDED.assignment_rule,
                 size               = EXCLUDED.size,
                 data_source_type   = EXCLUDED.data_source_type,
                 data_source_config = EXCLUDED.data_source_config,
                 updated_at         = EXCLUDED.updated_at"#,
        )
        .bind(group.id)
        .bind(group.account_id)
        .bind(&group.name)
        .bind(&group.description)
        .bind(&group.assignment_rule)
        .bind(group.size as i32)
        .bind(&group.data_source_type)
        .bind(&group.data_source_config)
        .bind(group.created_at)
        .bind(group.updated_at)
        .execute(&self.pg)
        .await
        .context("Failed to upsert user group")?;

        Ok(())
    }

    /// user_assignments write path stays in ClickHouse
    async fn save_assignment_ch(
        &self,
        account_id: Uuid,
        assignment: &UserAssignment,
    ) -> Result<()> {
        info!(
            "Saving user assignment (ClickHouse): user={} experiment={} variant={}",
            assignment.user_id, assignment.experiment_id, assignment.variant
        );

        let row = UserAssignmentRow {
            account_id: account_id.to_string(),
            user_id: assignment.user_id.clone(),
            experiment_id: assignment.experiment_id.to_string(),
            variant: assignment.variant.clone(),
            group_id: assignment.group_id.to_string(),
            assigned_at: assignment.assigned_at.timestamp() as u32,
        };

        let mut insert = self.ch.client().insert("user_assignments")?;
        insert.write(&row).await?;
        insert.end().await?;

        Ok(())
    }

    /// Read experiment variants from Postgres (after migration)
    async fn get_experiment_from_pg(
        &self,
        account_id: Uuid,
        experiment_id: Uuid,
    ) -> Result<Experiment> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            account_id: Uuid,
            name: String,
            description: String,
            status: String,
            experiment_type: String,
            sampling_method: String,
            analysis_engine: String,
            sampling_seed: i64,
            variants: Option<String>,
            user_groups: Option<String>,
            primary_metric: Option<String>,
            feature_flag_id: Option<Uuid>,
            feature_gate_id: Option<Uuid>,
        }

        let r = sqlx::query_as::<_, Row>(
            r#"SELECT id, account_id, name, description, status, experiment_type,
                      sampling_method, analysis_engine, sampling_seed,
                      variants::text AS variants, user_groups::text AS user_groups,
                      primary_metric, feature_flag_id, feature_gate_id
               FROM experiments
               WHERE id = $1 AND account_id = $2"#,
        )
        .bind(experiment_id)
        .bind(account_id)
        .fetch_one(&self.pg)
        .await
        .context("Failed to fetch experiment for assignment")?;

        let variants: Vec<Variant> = serde_json::from_str(r.variants.as_deref().unwrap_or("[]"))?;
        let user_groups: Vec<Uuid> =
            serde_json::from_str(r.user_groups.as_deref().unwrap_or("[]"))?;

        let status = match r.status.as_str() {
            "running" => ExperimentStatus::Running,
            "paused" => ExperimentStatus::Paused,
            "stopped" => ExperimentStatus::Stopped,
            _ => ExperimentStatus::Draft,
        };

        let sampling_method = match r.sampling_method.as_str() {
            "random" => SamplingMethod::Random,
            "stratified" => SamplingMethod::Stratified,
            _ => SamplingMethod::Hash,
        };

        Ok(Experiment {
            account_id: r.account_id,
            id: r.id,
            name: r.name,
            description: r.description,
            status,
            experiment_type: ExperimentType::AbTest,
            sampling_method,
            analysis_engine: AnalysisEngine::Frequentist,
            sampling_seed: r.sampling_seed as u64,
            feature_flag_id: r.feature_flag_id,
            feature_gate_id: r.feature_gate_id,
            health_checks: vec![],
            hypothesis: None,
            variants,
            user_groups,
            primary_metric: r.primary_metric.unwrap_or_default(),
            start_date: None,
            end_date: None,
            jira_issue_key: None,
            requires_existing_users: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
    }

    async fn get_group_user_ids(&self, _group_id: Uuid) -> Result<Vec<String>> {
        // Placeholder: querying user list would require scanning user_assignments in CH
        Ok(vec![])
    }

    fn hash_user_to_variant(
        &self,
        user_id: &str,
        experiment_id: Uuid,
        variants: &[Variant],
    ) -> String {
        let mut hasher = DefaultHasher::new();
        user_id.hash(&mut hasher);
        experiment_id.hash(&mut hasher);
        let hash = hasher.finish();

        let mut cumulative = 0.0;
        let hash_percent = (hash % 10000) as f64 / 100.0;

        for variant in variants {
            cumulative += variant.allocation_percent;
            if hash_percent < cumulative {
                return variant.name.clone();
            }
        }

        variants[0].name.clone()
    }

    fn hash_user_to_variant_with_salt(
        &self,
        user_id: &str,
        experiment_id: Uuid,
        variants: &[Variant],
        salt: &str,
    ) -> String {
        let mut hasher = DefaultHasher::new();
        user_id.hash(&mut hasher);
        experiment_id.hash(&mut hasher);
        salt.hash(&mut hasher);
        let hash = hasher.finish();

        let mut cumulative = 0.0;
        let hash_percent = (hash % 10000) as f64 / 100.0;

        for variant in variants {
            cumulative += variant.allocation_percent;
            if hash_percent < cumulative {
                return variant.name.clone();
            }
        }

        variants[0].name.clone()
    }

    fn select_variant(
        &self,
        user_id: &str,
        experiment_id: Uuid,
        variants: &[Variant],
        sampling_method: SamplingMethod,
        sampling_seed: u64,
        attributes: Option<serde_json::Value>,
    ) -> String {
        match sampling_method {
            SamplingMethod::Random => {
                let salt = format!("seed:{}", sampling_seed);
                self.hash_user_to_variant_with_salt(user_id, experiment_id, variants, &salt)
            }
            SamplingMethod::Stratified => {
                let salt = attributes
                    .as_ref()
                    .and_then(|attrs| {
                        attrs
                            .get("stratum")
                            .or_else(|| attrs.get("segment"))
                            .or_else(|| attrs.get("region"))
                    })
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "default".to_string());
                self.hash_user_to_variant_with_salt(user_id, experiment_id, variants, &salt)
            }
            SamplingMethod::Hash => self.hash_user_to_variant(user_id, experiment_id, variants),
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct GroupMetrics {
    pub group_id: Uuid,
    pub total_users: usize,
    pub active_users: usize,
    pub conversion_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_consistency() {
        let variants = vec![
            Variant {
                name: "A".to_string(),
                description: "".to_string(),
                allocation_percent: 50.0,
                is_control: true,
            },
            Variant {
                name: "B".to_string(),
                description: "".to_string(),
                allocation_percent: 50.0,
                is_control: false,
            },
        ];

        let experiment_id = Uuid::new_v4();
        let mut hasher = DefaultHasher::new();
        "user123".hash(&mut hasher);
        experiment_id.hash(&mut hasher);
        let h1 = hasher.finish();

        let mut hasher2 = DefaultHasher::new();
        "user123".hash(&mut hasher2);
        experiment_id.hash(&mut hasher2);
        let h2 = hasher2.finish();

        assert_eq!(h1, h2);
    }
}
