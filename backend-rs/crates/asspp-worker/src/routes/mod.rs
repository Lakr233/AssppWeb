pub mod bag;
pub mod downloads;
pub mod install;
pub mod packages;
pub mod search;
pub mod settings;
pub mod wisp;

use crate::services::kv_metadata::KvMetadata;
use crate::services::r2_storage::R2Storage;
use worker::*;

pub fn get_kv(ctx: &RouteContext<()>) -> Result<KvMetadata> {
  Ok(KvMetadata::new(ctx.kv("TASK_KV")?))
}

pub fn get_r2(ctx: &RouteContext<()>) -> Result<R2Storage> {
  Ok(R2Storage::new(ctx.bucket("IPA_BUCKET")?))
}

pub fn get_query_param(url: &url::Url, key: &str) -> Option<String> {
  url
    .query_pairs()
    .find(|(k, _)| k == key)
    .map(|(_, v)| v.to_string())
}
