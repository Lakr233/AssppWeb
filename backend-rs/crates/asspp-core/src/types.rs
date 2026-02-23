use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Software {
  pub id: i64,
  #[serde(rename = "bundleID")]
  pub bundle_id: String,
  pub name: String,
  pub version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub price: Option<f64>,
  pub artist_name: String,
  pub seller_name: String,
  pub description: String,
  pub average_user_rating: f64,
  pub user_rating_count: i64,
  #[serde(rename = "artworkUrl")]
  pub artwork_url: String,
  pub screenshot_urls: Vec<String>,
  pub minimum_os_version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_size_bytes: Option<String>,
  pub release_date: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub release_notes: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub formatted_price: Option<String>,
  pub primary_genre_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sinf {
  pub id: i64,
  pub sinf: String, // base64 encoded
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
  Pending,
  Downloading,
  Paused,
  Injecting,
  Completed,
  Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
  pub id: String,
  pub software: Software,
  pub account_hash: String,
  pub download_url: String,
  pub sinfs: Vec<Sinf>,
  #[serde(rename = "iTunesMetadata")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub itunes_metadata: Option<String>,
  pub status: TaskStatus,
  pub progress: u8,
  pub speed: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_path: Option<String>,
  pub created_at: String,
}

/// Sanitized task for API responses — no secrets, no file path
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizedTask {
  pub id: String,
  pub software: Software,
  pub account_hash: String,
  pub status: TaskStatus,
  pub progress: u8,
  pub speed: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub has_file: Option<bool>,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
  pub id: String,
  pub software: Software,
  pub account_hash: String,
  pub file_size: u64,
  pub created_at: String,
}

/// Request body for creating a download task
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDownloadRequest {
  pub software: Software,
  pub account_hash: String,
  #[serde(rename = "downloadURL")]
  pub download_url: String,
  pub sinfs: Vec<Sinf>,
  #[serde(rename = "iTunesMetadata")]
  pub itunes_metadata: Option<String>,
}

impl DownloadTask {
  pub fn sanitize(&self, file_exists: bool) -> SanitizedTask {
    SanitizedTask {
      id: self.id.clone(),
      software: self.software.clone(),
      account_hash: self.account_hash.clone(),
      status: self.status,
      progress: self.progress,
      speed: self.speed.clone(),
      error: self.error.clone(),
      has_file: if file_exists { Some(true) } else { None },
      created_at: self.created_at.clone(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sample_software() -> Software {
    Software {
      id: 284882215,
      bundle_id: "com.facebook.Facebook".into(),
      name: "Facebook".into(),
      version: "400.0".into(),
      price: Some(0.0),
      artist_name: "Meta Platforms, Inc.".into(),
      seller_name: "Meta Platforms, Inc.".into(),
      description: "Connect with friends".into(),
      average_user_rating: 3.5,
      user_rating_count: 1000000,
      artwork_url: "https://example.com/icon.png".into(),
      screenshot_urls: vec!["https://example.com/ss1.png".into()],
      minimum_os_version: "16.0".into(),
      file_size_bytes: Some("200000000".into()),
      release_date: "2024-01-01T00:00:00Z".into(),
      release_notes: Some("Bug fixes".into()),
      formatted_price: Some("Free".into()),
      primary_genre_name: "Social Networking".into(),
    }
  }

  #[test]
  fn test_software_serialization() {
    let sw = sample_software();
    let json = serde_json::to_value(&sw).unwrap();
    assert_eq!(json["id"], 284882215);
    assert_eq!(json["bundleID"], "com.facebook.Facebook");
    assert_eq!(json["artworkUrl"], "https://example.com/icon.png");
    assert_eq!(json["artistName"], "Meta Platforms, Inc.");
    assert_eq!(json["screenshotUrls"][0], "https://example.com/ss1.png");
    assert_eq!(json["fileSizeBytes"], "200000000");
    assert_eq!(json["primaryGenreName"], "Social Networking");
  }

  #[test]
  fn test_software_optional_fields_omitted() {
    let mut sw = sample_software();
    sw.price = None;
    sw.file_size_bytes = None;
    sw.release_notes = None;
    sw.formatted_price = None;
    let json = serde_json::to_value(&sw).unwrap();
    assert!(json.get("price").is_none());
    assert!(json.get("fileSizeBytes").is_none());
    assert!(json.get("releaseNotes").is_none());
    assert!(json.get("formattedPrice").is_none());
  }

  #[test]
  fn test_task_status_serialization() {
    assert_eq!(
      serde_json::to_string(&TaskStatus::Downloading).unwrap(),
      "\"downloading\""
    );
    assert_eq!(
      serde_json::to_string(&TaskStatus::Completed).unwrap(),
      "\"completed\""
    );
  }

  #[test]
  fn test_sanitize_task() {
    let task = DownloadTask {
      id: "test-id".into(),
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "https://secret.apple.com/file.ipa".into(),
      sinfs: vec![Sinf {
        id: 0,
        sinf: "c2VjcmV0".into(),
      }],
      itunes_metadata: Some("bWV0YWRhdGE=".into()),
      status: TaskStatus::Completed,
      progress: 100,
      speed: "0 B/s".into(),
      error: None,
      file_path: Some("/data/packages/test.ipa".into()),
      created_at: "2024-01-01T00:00:00Z".into(),
    };

    let sanitized = task.sanitize(true);
    let json = serde_json::to_value(&sanitized).unwrap();

    // Secrets must not be present
    assert!(json.get("downloadURL").is_none());
    assert!(json.get("downloadUrl").is_none());
    assert!(json.get("download_url").is_none());
    assert!(json.get("sinfs").is_none());
    assert!(json.get("iTunesMetadata").is_none());
    assert!(json.get("filePath").is_none());
    assert!(json.get("file_path").is_none());

    // hasFile should be present
    assert_eq!(json["hasFile"], true);
    assert_eq!(json["id"], "test-id");
  }

  #[test]
  fn test_download_task_itunes_metadata_field_name() {
    let task = DownloadTask {
      id: "t".into(),
      software: sample_software(),
      account_hash: "abcdef1234567890".into(),
      download_url: "https://cdn.apple.com/a.ipa".into(),
      sinfs: vec![],
      itunes_metadata: Some("dGVzdA==".into()),
      status: TaskStatus::Pending,
      progress: 0,
      speed: "0 B/s".into(),
      error: None,
      file_path: None,
      created_at: "2024-01-01T00:00:00Z".into(),
    };

    let json = serde_json::to_value(&task).unwrap();
    // Must be "iTunesMetadata" not "itunesMetadata"
    assert!(json.get("iTunesMetadata").is_some());
  }
}
