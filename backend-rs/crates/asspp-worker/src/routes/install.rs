use asspp_core::manifest::{build_manifest, WHITE_PNG};
use asspp_core::types::TaskStatus;
use worker::*;

use super::{get_kv, get_r2};

fn get_base_url(req: &Request) -> String {
  let url = req.url().ok();
  let host = url
    .as_ref()
    .map(|u| u.host_str().unwrap_or("localhost").to_string())
    .unwrap_or_else(|| "localhost".to_string());
  let scheme = url
    .as_ref()
    .map(|u| u.scheme().to_string())
    .unwrap_or_else(|| "https".to_string());
  format!("{}://{}", scheme, host)
}

pub async fn manifest(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) if t.status == TaskStatus::Completed && t.file_path.is_some() => t,
    _ => return Response::error(serde_json::json!({"error": "Package not found"}).to_string(), 404),
  };

  let base_url = get_base_url(&req);
  let payload_url = format!("{}/api/install/{}/payload.ipa", base_url, id);
  let small_icon_url = format!("{}/api/install/{}/icon-small.png", base_url, id);
  let large_icon_url = format!("{}/api/install/{}/icon-large.png", base_url, id);

  let xml = build_manifest(&task.software, &payload_url, &small_icon_url, &large_icon_url);

  let headers = Headers::new();
  headers.set("Content-Type", "application/xml")?;
  Ok(Response::ok(xml)?.with_headers(headers))
}

pub async fn install_url(req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let kv = get_kv(&ctx)?;
  let _task = match kv.get_task(&id).await? {
    Some(t) if t.status == TaskStatus::Completed && t.file_path.is_some() => t,
    _ => return Response::error(serde_json::json!({"error": "Package not found"}).to_string(), 404),
  };

  let base_url = get_base_url(&req);
  let manifest_url = format!("{}/api/install/{}/manifest.plist", base_url, id);
  let install_url_str = format!(
    "itms-services://?action=download-manifest&url={}",
    urlencoding::encode(&manifest_url)
  );

  Response::from_json(&serde_json::json!({
    "installUrl": install_url_str,
    "manifestUrl": manifest_url,
  }))
}

pub async fn payload(_req: Request, ctx: RouteContext<()>) -> Result<Response> {
  let id = ctx.param("id").unwrap_or(&String::new()).clone();
  let kv = get_kv(&ctx)?;
  let task = match kv.get_task(&id).await? {
    Some(t) if t.status == TaskStatus::Completed => t,
    _ => return Response::error(serde_json::json!({"error": "Package not found"}).to_string(), 404),
  };

  let r2_key = task.file_path.as_ref().ok_or_else(|| {
    Error::RustError("No file path".into())
  })?;

  let r2 = get_r2(&ctx)?;
  let data = r2.get(r2_key).await?.ok_or_else(|| {
    Error::RustError("File not found in R2".into())
  })?;

  let headers = Headers::new();
  headers.set("Content-Type", "application/octet-stream")?;
  headers.set("Content-Length", &data.len().to_string())?;
  Ok(Response::from_bytes(data)?.with_headers(headers))
}

fn white_png_response() -> Result<Response> {
  let headers = Headers::new();
  headers.set("Content-Type", "image/png")?;
  headers.set("Content-Length", &WHITE_PNG.len().to_string())?;
  Ok(Response::from_bytes(WHITE_PNG.to_vec())?.with_headers(headers))
}

pub async fn icon_small(_req: Request, _ctx: RouteContext<()>) -> Result<Response> {
  white_png_response()
}

pub async fn icon_large(_req: Request, _ctx: RouteContext<()>) -> Result<Response> {
  white_png_response()
}
