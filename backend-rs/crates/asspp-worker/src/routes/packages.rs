use asspp_core::security::sanitize_filename;
use asspp_core::types::TaskStatus;
use worker::*;

use super::{get_kv, get_query_param, get_r2};

pub async fn list_packages(req: Request, ctx: RouteContext<()>) -> Result<Response> {
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
  let r2 = get_r2(&ctx)?;
  let tasks = kv.list_tasks(&hashes).await?;

  let mut packages = Vec::new();
  for task in &tasks {
    if task.status != TaskStatus::Completed {
      continue;
    }
    if let Some(key) = &task.file_path {
      if let Some(size) = r2.size(key).await? {
        packages.push(serde_json::json!({
          "id": task.id,
          "software": task.software,
          "accountHash": task.account_hash,
          "fileSize": size,
          "createdAt": task.created_at,
        }));
      }
    }
  }

  Response::from_json(&packages)
}

pub async fn download_file(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) if t.status == TaskStatus::Completed => t,
    _ => return Response::error(serde_json::json!({"error": "Package not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  let r2_key = task.file_path.as_ref().ok_or_else(|| {
    Error::RustError("No file path".into())
  })?;

  let r2 = get_r2(&ctx)?;
  let data = r2.get(r2_key).await?.ok_or_else(|| {
    Error::RustError("File not found in R2".into())
  })?;

  let safe_name = sanitize_filename(&task.software.name);
  let safe_version = sanitize_filename(&task.software.version);
  let filename = format!("{}_{}.ipa", safe_name, safe_version);

  let headers = Headers::new();
  headers.set("Content-Type", "application/octet-stream")?;
  headers.set("Content-Disposition", &format!("attachment; filename=\"{}\"", filename))?;
  headers.set("Content-Length", &data.len().to_string())?;

  Ok(Response::from_bytes(data)?.with_headers(headers))
}

pub async fn delete_package(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let url = req.url()?;
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let account_hash = get_query_param(&url, "accountHash").unwrap_or_default();

  if account_hash.len() < 8 {
    return Response::error(
      serde_json::json!({"error": "Missing or invalid accountHash"}).to_string(),
      400,
    );
  }

  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) => t,
    None => return Response::error(serde_json::json!({"error": "Package not found"}).to_string(), 404),
  };

  if task.account_hash != account_hash {
    return Response::error(serde_json::json!({"error": "Access denied"}).to_string(), 403);
  }

  if let Some(key) = &task.file_path {
    let r2 = get_r2(&ctx)?;
    let _ = r2.delete(key).await;
  }

  Response::from_json(&serde_json::json!({"success": true}))
}
