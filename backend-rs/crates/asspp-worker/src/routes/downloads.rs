use asspp_core::download::validate_create_request;
use asspp_core::security::validate_download_url;
use asspp_core::types::{CreateDownloadRequest, TaskStatus};
use worker::*;

use super::{get_kv, get_query_param, get_r2};
use crate::services::download_manager;

pub async fn create_download(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let body: CreateDownloadRequest = req.json().await?;

  if let Err(msg) = validate_download_url(&body.download_url) {
    return Response::error(serde_json::json!({"error": msg}).to_string(), 400);
  }

  if let Err(msg) = validate_create_request(&body) {
    return Response::error(serde_json::json!({"error": msg}).to_string(), 400);
  }

  let kv = get_kv(&ctx)?;
  let r2 = get_r2(&ctx)?;

  let task = download_manager::create_task(&kv, &r2, body).await?;

  let file_exists = task.file_path.is_some();
  let sanitized = task.sanitize(file_exists);
  let mut resp = Response::from_json(&sanitized)?;
  resp = resp.with_status(201);
  Ok(resp)
}

pub async fn list_downloads(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let hashes_param = get_query_param(&url, "accountHashes").unwrap_or_default();

  if hashes_param.is_empty() {
    return Response::from_json(&Vec::<serde_json::Value>::new());
  }

  let hashes: Vec<String> = hashes_param
    .split(',')
    .filter(|s| !s.is_empty())
    .map(String::from)
    .collect();

  let kv = get_kv(&ctx)?;
  let tasks = kv.list_tasks(&hashes).await?;

  let sanitized: Vec<_> = tasks
    .iter()
    .map(|t| t.sanitize(t.file_path.is_some()))
    .collect();
  Response::from_json(&sanitized)
}

pub async fn get_download(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash parameter"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Download not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  let sanitized = task.sanitize(task.file_path.is_some());
  Response::from_json(&sanitized)
}

pub async fn progress_stream(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  // On Workers, SSE is simulated by returning current state as a single event
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash parameter"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Download not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  let sanitized = task.sanitize(task.file_path.is_some());
  let data = serde_json::to_string(&sanitized)
    .map_err(|e| Error::RustError(e.to_string()))?;

  let body = format!("data: {}\n\n", data);
  let headers = Headers::new();
  headers.set("Content-Type", "text/event-stream")?;
  headers.set("Cache-Control", "no-cache")?;
  headers.set("Connection", "keep-alive")?;
  Ok(Response::ok(body)?.with_headers(headers))
}

pub async fn pause_download(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash parameter"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let mut task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Download not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  if task.status != TaskStatus::Downloading {
    return Response::error(
      serde_json::json!({"error": "Cannot pause this download"}).to_string(),
      400,
    );
  }

  task.status = TaskStatus::Paused;
  kv.put_task(&task).await?;

  let sanitized = task.sanitize(task.file_path.is_some());
  Response::from_json(&sanitized)
}

pub async fn resume_download(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash parameter"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Download not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  if task.status != TaskStatus::Paused {
    return Response::error(
      serde_json::json!({"error": "Cannot resume this download"}).to_string(),
      400,
    );
  }

  // On Workers, resume re-triggers download
  let r2 = get_r2(&ctx)?;
  download_manager::create_task(&kv, &r2, asspp_core::types::CreateDownloadRequest {
    software: task.software.clone(),
    account_hash: task.account_hash.clone(),
    download_url: task.download_url.clone(),
    sinfs: task.sinfs.clone(),
    itunes_metadata: task.itunes_metadata.clone(),
  }).await?;

  let updated = kv.get_task(&id).await?.unwrap_or(task);
  let sanitized = updated.sanitize(updated.file_path.is_some());
  Response::from_json(&sanitized)
}

pub async fn delete_download(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash parameter"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Download not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  // Delete R2 object if exists
  if let Some(file_path) = &task.file_path {
    let r2 = get_r2(&ctx)?;
    let _ = r2.delete(file_path).await;
  }

  kv.delete_task(&id).await?;
  Response::from_json(&serde_json::json!({"success": true}))
}
