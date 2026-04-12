use actix_web::{web, HttpRequest, HttpResponse, Responder};
use beaker_macros::{circuit_breaker, rate_limit};
use uuid::Uuid;

use crate::models::*;
use crate::services::{CupedService, ExperimentService, NotificationService};
use crate::utils::*;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/experiments")
            .route("", web::post().to(create_experiment))
            .route("", web::get().to(list_experiments))
            .route("/{id}", web::get().to(get_experiment))
            .route("/{id}/start", web::post().to(start_experiment))
            .route("/{id}/restart", web::post().to(restart_experiment))
            .route("/{id}/pause", web::post().to(pause_experiment))
            .route("/{id}/stop", web::post().to(stop_experiment))
            .route("/{id}/analysis", web::get().to(get_analysis))
            .route("/{id}/cuped/config", web::get().to(get_cuped_config))
            .route("/{id}/cuped/config", web::post().to(save_cuped_config))
            .route("/{id}/jira/create-issue", web::post().to(jira_create_issue))
            .route("/{id}/jira/link", web::put().to(jira_link_issue))
            .route("/{id}/jira/link", web::delete().to(jira_unlink_issue))
            // Telemetry events — nested under /{experiment_id}/telemetry
            .service(
                web::scope("/{experiment_id}")
                    .service(super::telemetry::scope())
            ),
    );
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn create_experiment(
    service: web::Data<ExperimentService>,
    req: web::Json<CreateExperimentRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .create_experiment(req.into_inner(), user.account_id)
        .await
    {
        Ok(experiment) => HttpResponse::Created().json(experiment),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn list_experiments(
    service: web::Data<ExperimentService>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.list_experiments(user.account_id).await {
        Ok(experiments) => HttpResponse::Ok().json(experiments),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_experiment(
    service: web::Data<ExperimentService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .get_experiment(user.account_id, id.into_inner())
        .await
    {
        Ok(experiment) => HttpResponse::Ok().json(experiment),
        Err(e) => HttpResponse::NotFound().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn start_experiment(
    service: web::Data<ExperimentService>,
    notification_service: web::Data<NotificationService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .start_experiment(user.account_id, id.into_inner())
        .await
    {
        Ok(experiment) => {
            let ns = notification_service.clone().into_inner();
            let exp_clone = experiment.clone();
            let account_id = user.account_id;
            tokio::spawn(async move {
                ns.notify_experiment_status_changed(account_id, &exp_clone, "running").await;
            });
            HttpResponse::Ok().json(experiment)
        }
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn restart_experiment(
    service: web::Data<ExperimentService>,
    id: web::Path<Uuid>,
    http: HttpRequest
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .restart_experiment(user.account_id, id.into_inner())
        .await
    {
        Ok(experiment) => HttpResponse::Ok().json(experiment),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn pause_experiment(
    service: web::Data<ExperimentService>,
    notification_service: web::Data<NotificationService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .pause_experiment(user.account_id, id.into_inner())
        .await
    {
        Ok(experiment) => {
            let ns = notification_service.clone().into_inner();
            let exp_clone = experiment.clone();
            let account_id = user.account_id;
            tokio::spawn(async move {
                ns.notify_experiment_status_changed(account_id, &exp_clone, "paused").await;
            });
            HttpResponse::Ok().json(experiment)
        }
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn stop_experiment(
    service: web::Data<ExperimentService>,
    notification_service: web::Data<NotificationService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .stop_experiment(user.account_id, id.into_inner())
        .await
    {
        Ok(experiment) => {
            let ns = notification_service.clone().into_inner();
            let exp_clone = experiment.clone();
            let account_id = user.account_id;
            tokio::spawn(async move {
                ns.notify_experiment_status_changed(account_id, &exp_clone, "stopped").await;
            });
            HttpResponse::Ok().json(experiment)
        }
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_analysis(
    experiment_service: web::Data<ExperimentService>,
    cuped_service: web::Data<CupedService>,
    id: web::Path<Uuid>,
    query: web::Query<AnalysisQuery>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    let experiment_id = id.into_inner();

    match experiment_service
        .analyze_experiment(user.account_id, experiment_id)
        .await
    {
        Ok(mut analysis) => {
            // If CUPED is requested, run the CUPED analysis on top
            if query.use_cuped.unwrap_or(false) {
                match cuped_service
                    .run_cuped_analysis(experiment_id, &analysis.experiment)
                    .await
                {
                    Ok(cuped_results) => {
                        analysis.cuped_adjusted_results = Some(cuped_results);
                    }
                    Err(e) => {
                        // Return the standard analysis with a CUPED error note
                        return HttpResponse::Ok().json(serde_json::json!({
                            "experiment": analysis.experiment,
                            "results": analysis.results,
                            "sample_sizes": analysis.sample_sizes,
                            "health_checks": analysis.health_checks,
                            "cuped_adjusted_results": null,
                            "cuped_error": e.to_string()
                        }));
                    }
                }
            }
            HttpResponse::Ok().json(analysis)
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn get_cuped_config(
    cuped_service: web::Data<CupedService>,
    id: web::Path<Uuid>,
) -> impl Responder {
    match cuped_service.get_config(id.into_inner()).await {
        Ok(config) => HttpResponse::Ok().json(config),
        Err(e) => HttpResponse::NotFound().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn save_cuped_config(
    cuped_service: web::Data<CupedService>,
    id: web::Path<Uuid>,
    req: web::Json<CupedConfigRequest>,
) -> impl Responder {
    match cuped_service
        .save_config(id.into_inner(), req.into_inner())
        .await
    {
        Ok(config) => HttpResponse::Created().json(config),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

// ---------------------------------------------------------------------------
// Jira routes
// ---------------------------------------------------------------------------

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn jira_create_issue(
    pool: web::Data<sqlx::PgPool>,
    notification_service: web::Data<NotificationService>,
    id: web::Path<Uuid>,
    req: web::Json<CreateJiraIssueRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    let experiment_id = id.into_inner();
    let req = req.into_inner();

    let result = notification_service
        .create_jira_issue(
            user.account_id,
            req.summary,
            req.description,
            req.issue_type,
            req.project_key,
        )
        .await;

    match result {
        Ok(resp) => {
            // Store the issue key on the experiment
            if let Err(e) = sqlx::query(
                "UPDATE experiments SET jira_issue_key = $1 \
                 WHERE id = $2 AND account_id = $3",
            )
            .bind(&resp.issue_key)
            .bind(experiment_id)
            .bind(user.account_id)
            .execute(pool.get_ref())
            .await
            {
                log::warn!("Failed to save jira_issue_key to experiment: {}", e);
            }
            HttpResponse::Ok().json(resp)
        }
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn jira_link_issue(
    pool: web::Data<sqlx::PgPool>,
    id: web::Path<Uuid>,
    req: web::Json<LinkJiraIssueRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    match sqlx::query(
        "UPDATE experiments SET jira_issue_key = $1 \
         WHERE id = $2 AND account_id = $3",
    )
    .bind(&req.jira_issue_key)
    .bind(id.into_inner())
    .bind(user.account_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[rate_limit(group = "api-default")]
#[circuit_breaker(failure_threshold = 10, recovery_timeout = 30)]
async fn jira_unlink_issue(
    pool: web::Data<sqlx::PgPool>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };

    match sqlx::query(
        "UPDATE experiments SET jira_issue_key = NULL \
         WHERE id = $1 AND account_id = $2",
    )
    .bind(id.into_inner())
    .bind(user.account_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "ok": true })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}
