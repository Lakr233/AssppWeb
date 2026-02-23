use crate::security::{sanitize_path_segment, validate_download_url, validate_path_segment};
use crate::types::{CreateDownloadRequest, DownloadTask, TaskStatus};

/// Validate a create-download request body.
pub fn validate_create_request(req: &CreateDownloadRequest) -> Result<(), String> {
  if req.sinfs.is_empty() {
    return Err("Missing required fields: software, accountHash, downloadURL, sinfs".into());
  }

  validate_download_url(&req.download_url)?;
  validate_path_segment(&req.account_hash, "accountHash")?;
  validate_path_segment(&req.software.bundle_id, "bundleID")?;
  validate_path_segment(&req.software.version, "version")?;

  Ok(())
}

/// Build the storage directory path for a download task.
pub fn build_task_dir(
  packages_dir: &str,
  account_hash: &str,
  bundle_id: &str,
  version: &str,
) -> Result<String, String> {
  let safe_hash = sanitize_path_segment(account_hash)?;
  let safe_bundle = sanitize_path_segment(bundle_id)?;
  let safe_version = sanitize_path_segment(version)?;
  Ok(format!(
    "{}/{}/{}/{}",
    packages_dir, safe_hash, safe_bundle, safe_version
  ))
}

/// Build the IPA file path for a task.
pub fn build_ipa_path(dir: &str, task_id: &str) -> String {
  format!("{}/{}.ipa", dir, task_id)
}

/// Create a new DownloadTask struct (does not start the download).
pub fn new_task(req: CreateDownloadRequest) -> DownloadTask {
  DownloadTask {
    id: uuid::Uuid::new_v4().to_string(),
    software: req.software,
    account_hash: req.account_hash,
    download_url: req.download_url,
    sinfs: req.sinfs,
    itunes_metadata: req.itunes_metadata,
    status: TaskStatus::Pending,
    progress: 0,
    speed: "0 B/s".into(),
    error: None,
    file_path: None,
    created_at: chrono_now_iso(),
  }
}

fn chrono_now_iso() -> String {
  #[cfg(not(target_arch = "wasm32"))]
  {
    let now = std::time::SystemTime::now();
    let dur = now
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_default();
    format_unix_timestamp(dur.as_secs())
  }
  #[cfg(target_arch = "wasm32")]
  {
    let ms = js_sys::Date::now();
    format_unix_timestamp((ms / 1000.0) as u64)
  }
}

fn format_unix_timestamp(secs: u64) -> String {
  // Basic ISO 8601 formatter — no external dependency
  const SECS_PER_DAY: u64 = 86400;
  const DAYS_PER_YEAR: u64 = 365;

  let mut days = secs / SECS_PER_DAY;
  let day_secs = secs % SECS_PER_DAY;

  let hours = day_secs / 3600;
  let minutes = (day_secs % 3600) / 60;
  let seconds = day_secs % 60;

  let mut year: u64 = 1970;
  loop {
    let days_in_year = if is_leap(year) {
      DAYS_PER_YEAR + 1
    } else {
      DAYS_PER_YEAR
    };
    if days < days_in_year {
      break;
    }
    days -= days_in_year;
    year += 1;
  }

  let days_in_months: [u64; 12] = if is_leap(year) {
    [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  } else {
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  };

  let mut month: u64 = 0;
  for (i, &d) in days_in_months.iter().enumerate() {
    if days < d {
      month = i as u64;
      break;
    }
    days -= d;
  }

  format!(
    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
    year,
    month + 1,
    days + 1,
    hours,
    minutes,
    seconds
  )
}

fn is_leap(year: u64) -> bool {
  (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// Validate accountHash format (hex string, >= 8 chars).
pub fn validate_account_hash(hash: &str) -> bool {
  hash.len() >= 8
    && hash.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::types::{Sinf, Software};

  fn sample_software() -> Software {
    Software {
      id: 1,
      bundle_id: "com.test.app".into(),
      name: "Test".into(),
      version: "1.0".into(),
      price: None,
      artist_name: "Dev".into(),
      seller_name: "Dev".into(),
      description: "Test".into(),
      average_user_rating: 0.0,
      user_rating_count: 0,
      artwork_url: String::new(),
      screenshot_urls: vec![],
      minimum_os_version: "16.0".into(),
      file_size_bytes: None,
      release_date: "2024-01-01".into(),
      release_notes: None,
      formatted_price: None,
      primary_genre_name: "Utilities".into(),
    }
  }

  #[test]
  fn test_validate_create_request_valid() {
    let req = CreateDownloadRequest {
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "https://cdn.apple.com/file.ipa".into(),
      sinfs: vec![Sinf {
        id: 0,
        sinf: "dGVzdA==".into(),
      }],
      itunes_metadata: None,
    };
    assert!(validate_create_request(&req).is_ok());
  }

  #[test]
  fn test_validate_create_request_empty_sinfs() {
    let req = CreateDownloadRequest {
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "https://cdn.apple.com/file.ipa".into(),
      sinfs: vec![],
      itunes_metadata: None,
    };
    assert!(validate_create_request(&req).is_err());
  }

  #[test]
  fn test_validate_create_request_bad_url() {
    let req = CreateDownloadRequest {
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "http://evil.com/file.ipa".into(),
      sinfs: vec![Sinf {
        id: 0,
        sinf: "dGVzdA==".into(),
      }],
      itunes_metadata: None,
    };
    assert!(validate_create_request(&req).is_err());
  }

  #[test]
  fn test_build_task_dir() {
    let dir = build_task_dir("/data/packages", "abc123", "com.test.app", "1.0").unwrap();
    assert_eq!(dir, "/data/packages/abc123/com.test.app/1.0");
  }

  #[test]
  fn test_build_ipa_path() {
    let p = build_ipa_path("/data/packages/abc/com.test/1.0", "task-123");
    assert_eq!(p, "/data/packages/abc/com.test/1.0/task-123.ipa");
  }

  #[test]
  fn test_validate_account_hash() {
    assert!(validate_account_hash("abcdef1234567890"));
    assert!(validate_account_hash("12345678"));
    assert!(!validate_account_hash("short"));
    assert!(!validate_account_hash(""));
    assert!(!validate_account_hash("abc/def12345678"));
  }

  #[test]
  fn test_format_unix_timestamp() {
    assert_eq!(format_unix_timestamp(0), "1970-01-01T00:00:00Z");
    // 2024-01-01 00:00:00 UTC = 1704067200
    assert_eq!(format_unix_timestamp(1704067200), "2024-01-01T00:00:00Z");
  }

  #[test]
  fn test_new_task() {
    let req = CreateDownloadRequest {
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "https://cdn.apple.com/file.ipa".into(),
      sinfs: vec![Sinf {
        id: 0,
        sinf: "dGVzdA==".into(),
      }],
      itunes_metadata: Some("bWV0YQ==".into()),
    };
    let task = new_task(req);
    assert!(!task.id.is_empty());
    assert_eq!(task.status, TaskStatus::Pending);
    assert_eq!(task.progress, 0);
    assert_eq!(task.speed, "0 B/s");
    assert!(task.itunes_metadata.is_some());
  }
}
