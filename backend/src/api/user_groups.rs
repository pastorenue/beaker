use actix_web::HttpMessage;
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use uuid::Uuid;

use crate::middleware::auth::AuthedUser;
use crate::models::*;
use crate::services::UserGroupService;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/user-groups")
            .route("", web::post().to(create_user_group))
            .route("", web::get().to(list_user_groups))
            .route("/{id}", web::get().to(get_user_group))
            .route("/{id}", web::put().to(update_user_group))
            .route("/{id}", web::delete().to(delete_user_group))
            .route("/{id}/move", web::post().to(move_user_group))
            .route("/{id}/metrics", web::get().to(get_group_metrics))
            .route("/{id}/sync", web::post().to(sync_user_group))
            .route("/{id}/users", web::get().to(get_group_users))
            .route("/assign", web::post().to(assign_user)),
    );
}

fn authed(req: &HttpRequest) -> Option<AuthedUser> {
    req.extensions().get::<AuthedUser>().cloned()
}

async fn create_user_group(
    service: web::Data<UserGroupService>,
    req: web::Json<CreateUserGroupRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .create_user_group(req.into_inner(), user.account_id)
        .await
    {
        Ok(group) => HttpResponse::Created().json(group),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn list_user_groups(
    service: web::Data<UserGroupService>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service.list_user_groups(user.account_id).await {
        Ok(groups) => HttpResponse::Ok().json(groups),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn get_user_group(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .get_user_group(user.account_id, id.into_inner())
        .await
    {
        Ok(group) => HttpResponse::Ok().json(group),
        Err(e) => HttpResponse::NotFound().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn update_user_group(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    req: web::Json<UpdateUserGroupRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .update_user_group(user.account_id, id.into_inner(), req.into_inner())
        .await
    {
        Ok(group) => HttpResponse::Ok().json(group),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn delete_user_group(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .delete_user_group(user.account_id, id.into_inner())
        .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "message": "User group deleted"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn move_user_group(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    req: web::Json<MoveUserGroupRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .move_user_group(
            user.account_id,
            id.into_inner(),
            req.from_experiment_id,
            req.to_experiment_id,
        )
        .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "message": "User group moved successfully"
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn get_group_metrics(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .get_group_metrics(user.account_id, id.into_inner())
        .await
    {
        Ok(metrics) => HttpResponse::Ok().json(metrics),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn assign_user(
    service: web::Data<UserGroupService>,
    req: web::Json<AssignUserRequest>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    let req = req.into_inner();
    match service
        .assign_user_auto(
            user.account_id,
            &req.user_id,
            req.experiment_id,
            req.group_id,
            req.attributes,
        )
        .await
    {
        Ok(assignment) => HttpResponse::Ok().json(assignment),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn sync_user_group(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .sync_user_group(user.account_id, id.into_inner())
        .await
    {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn get_group_users(
    service: web::Data<UserGroupService>,
    id: web::Path<Uuid>,
    http: HttpRequest,
) -> impl Responder {
    let Some(user) = authed(&http) else {
        return HttpResponse::Unauthorized().finish();
    };
    match service
        .get_group_data(user.account_id, id.into_inner())
        .await
    {
        Ok(data) => HttpResponse::Ok().json(data),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}
