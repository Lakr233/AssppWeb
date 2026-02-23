use asspp_core::download::new_task;
use asspp_core::security::validate_download_url;
use asspp_core::types::{CreateDownloadRequest, DownloadTask, TaskStatus};
use worker::*;

use crate::services::kv_metadata::KvMetadata;
use crate::services::r2_storage::R2Storage;

/// Create a download task. On Workers, the download is done via fetch()
/// and the IPA is stored in R2.
pub async fn create_task(
  kv: &KvMetadata,
  r2: &R2Storage,
  req: CreateDownloadRequest,
) -> Result<DownloadTask> {
  let mut task = new_task(req);

  // Start download immediately
  download_and_store(kv, r2, &mut task).await?;

  Ok(task)
}

async fn download_and_store(
  kv: &KvMetadata,
  r2: &R2Storage,
  task: &mut DownloadTask,
) -> Result<()> {
  task.status = TaskStatus::Downloading;
  kv.put_task(task).await?;

  // Validate URL
  validate_download_url(&task.download_url)
    .map_err(|e| Error::RustError(e))?;

  // Fetch the IPA from Apple CDN
  let mut init = RequestInit::new();
  init.method = Method::Get;
  let request = Request::new_with_init(&task.download_url, &init)?;
  let mut resp = Fetch::Request(request).send().await?;

  if resp.status_code() >= 400 {
    task.status = TaskStatus::Failed;
    task.error = Some("Download failed".into());
    kv.put_task(task).await?;
    return Err(Error::RustError(format!(
      "HTTP {}",
      resp.status_code()
    )));
  }

  let bytes = resp.bytes().await?;

  // SINF injection on Workers: done in-memory before storing
  let r2_key = format!("packages/{}/{}/{}/{}.ipa",
    task.account_hash,
    task.software.bundle_id,
    task.software.version,
    task.id,
  );

  let final_bytes = if !task.sinfs.is_empty() {
    task.status = TaskStatus::Injecting;
    kv.put_task(task).await?;

    match inject_sinfs_in_memory(&bytes, &task.sinfs, task.itunes_metadata.as_deref()) {
      Ok(modified) => modified,
      Err(e) => {
        console_warn!("SINF injection failed: {}, storing without SINFs", e);
        bytes
      }
    }
  } else {
    bytes
  };

  // Store IPA in R2 (single write)
  r2.put(&r2_key, final_bytes).await?;
  task.file_path = Some(r2_key);

  // Mark completed and strip secrets
  task.status = TaskStatus::Completed;
  task.progress = 100;
  task.download_url = String::new();
  task.sinfs = vec![];
  task.itunes_metadata = None;
  kv.put_task(task).await?;

  Ok(())
}

fn inject_sinfs_in_memory(
  ipa_data: &[u8],
  sinfs: &[asspp_core::types::Sinf],
  itunes_metadata_b64: Option<&str>,
) -> std::result::Result<Vec<u8>, String> {
  use asspp_core::plist_util;
  use asspp_core::sinf::{self, InjectionSource};
  use base64::Engine;
  use std::io::{Cursor, Read, Write};

  let reader = Cursor::new(ipa_data);
  let mut zip = zip::ZipArchive::new(reader).map_err(|e| format!("Read ZIP: {}", e))?;

  // Find bundle name
  let bundle_name = {
    let mut name = None;
    for i in 0..zip.len() {
      let entry = zip
        .by_index_raw(i)
        .map_err(|e| format!("Read entry: {}", e))?;
      if let Some(n) = sinf::extract_bundle_name(entry.name()) {
        name = Some(n);
        break;
      }
    }
    name.ok_or_else(|| "Could not read bundle name".to_string())?
  };

  // Find injection source
  let source = {
    let mut found = None;

    // Try Manifest.plist
    for i in 0..zip.len() {
      let entry = zip
        .by_index_raw(i)
        .map_err(|e| format!("Read entry: {}", e))?;
      if sinf::is_manifest_plist(entry.name()) {
        drop(entry);
        let mut entry = zip.by_index(i).map_err(|e| format!("Read: {}", e))?;
        let mut buf = Vec::new();
        entry
          .read_to_end(&mut buf)
          .map_err(|e| format!("Read manifest: {}", e))?;
        if let Some(val) = plist_util::parse_plist(&buf) {
          if let Some(paths) = plist_util::get_string_array(&val, "SinfPaths") {
            found = Some(InjectionSource::Manifest { sinf_paths: paths });
          }
        }
        break;
      }
    }

    // Fall back to Info.plist
    if found.is_none() {
      for i in 0..zip.len() {
        let entry = zip
          .by_index_raw(i)
          .map_err(|e| format!("Read entry: {}", e))?;
        let entry_name = entry.name().to_string();
        if sinf::is_info_plist(&entry_name) {
          drop(entry);
          let mut entry = zip.by_index(i).map_err(|e| format!("Read: {}", e))?;
          let mut buf = Vec::new();
          entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("Read info: {}", e))?;
          if let Some(val) = plist_util::parse_plist(&buf) {
            if let Some(exec) = plist_util::get_string(&val, "CFBundleExecutable") {
              found = Some(InjectionSource::Info {
                bundle_executable: exec,
              });
            }
          }
          break;
        }
      }
    }

    found.ok_or_else(|| "Could not read manifest or info plist".to_string())?
  };

  // Decode sinf data
  let sinf_data: Vec<(i64, Vec<u8>)> = sinfs
    .iter()
    .map(|s| {
      let data = base64::engine::general_purpose::STANDARD
        .decode(&s.sinf)
        .map_err(|e| format!("Decode sinf: {}", e))?;
      Ok((s.id, data))
    })
    .collect::<std::result::Result<Vec<_>, String>>()?;

  // Prepare metadata
  let metadata_binary = if let Some(b64) = itunes_metadata_b64 {
    let xml_bytes = base64::engine::general_purpose::STANDARD
      .decode(b64)
      .map_err(|e| format!("Decode metadata: {}", e))?;
    let xml_str = String::from_utf8_lossy(&xml_bytes);
    match plist_util::xml_to_binary_plist(&xml_str) {
      Ok(binary) => Some(binary),
      Err(_) => Some(xml_bytes),
    }
  } else {
    None
  };

  let plan = sinf::plan_injection(&bundle_name, &source, &sinf_data, metadata_binary.as_deref());

  if plan.files.is_empty() {
    return Ok(ipa_data.to_vec());
  }

  // Rewrite ZIP in memory
  let mut out_buf = Vec::new();
  {
    let mut out_zip = zip::ZipWriter::new(Cursor::new(&mut out_buf));
    let inject_paths: std::collections::HashSet<&str> =
      plan.files.iter().map(|(p, _)| p.as_str()).collect();

    for i in 0..zip.len() {
      let entry = zip
        .by_index_raw(i)
        .map_err(|e| format!("Read entry: {}", e))?;
      let name = entry.name().to_string();
      if inject_paths.contains(name.as_str()) {
        continue;
      }
      out_zip
        .raw_copy_file(entry)
        .map_err(|e| format!("Copy: {}", e))?;
    }

    let options = zip::write::SimpleFileOptions::default()
      .compression_method(zip::CompressionMethod::Stored);

    for (path, data) in &plan.files {
      out_zip
        .start_file(path, options)
        .map_err(|e| format!("Start: {}", e))?;
      out_zip.write_all(data).map_err(|e| format!("Write: {}", e))?;
    }

    out_zip.finish().map_err(|e| format!("Finish: {}", e))?;
  }

  Ok(out_buf)
}
