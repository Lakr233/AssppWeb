// --- Path segment validation ---

fn is_safe_segment_char(c: char) -> bool {
  c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-'
}

/// Validate a path segment (accountHash, bundleID, version).
/// Must contain only alphanumeric, dots, dashes, or underscores.
pub fn validate_path_segment(value: &str, label: &str) -> Result<(), String> {
  if value.is_empty() || !value.chars().all(is_safe_segment_char) {
    return Err(format!(
      "Invalid {label}: must contain only alphanumeric characters, dots, dashes, or underscores"
    ));
  }
  if value == "." || value == ".." {
    return Err(format!("Invalid {label}"));
  }
  Ok(())
}

/// Sanitize a path segment by replacing invalid characters with underscores.
pub fn sanitize_path_segment(value: &str) -> Result<String, String> {
  let cleaned: String = value
    .chars()
    .map(|c| if is_safe_segment_char(c) { c } else { '_' })
    .collect();
  if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
    return Err("Invalid path segment".into());
  }
  Ok(cleaned)
}

// --- Download URL validation ---

/// Check if a hostname ends with `.apple.com` (case-insensitive).
fn is_apple_domain(host: &str) -> bool {
  let lower = host.to_ascii_lowercase();
  lower.ends_with(".apple.com")
}

/// Maximum download file size (4 GB).
pub const MAX_DOWNLOAD_SIZE: u64 = 4 * 1024 * 1024 * 1024;

/// Download timeout in seconds.
pub const DOWNLOAD_TIMEOUT_SECS: u64 = 10 * 60;

/// Validate a download URL (must be HTTPS, *.apple.com, no IP addresses).
pub fn validate_download_url(url: &str) -> Result<(), String> {
  let parsed = url::Url::parse(url).map_err(|_| "Invalid download URL".to_string())?;

  if parsed.scheme() != "https" {
    return Err("Download URL must use HTTPS".into());
  }

  let host = parsed.host_str().ok_or("Invalid download URL")?;

  // Block IP addresses (check before domain match so error message is specific)
  if is_ip_address(host) {
    return Err("Download URL must not use IP addresses".into());
  }

  if !is_apple_domain(host) {
    return Err("Download URL must be from an Apple domain (*.apple.com)".into());
  }

  Ok(())
}

fn is_ip_address(host: &str) -> bool {
  host.parse::<std::net::Ipv4Addr>().is_ok()
    || host.parse::<std::net::Ipv6Addr>().is_ok()
    || host.starts_with('[') // bracketed IPv6
}

// --- Host header sanitization ---

/// Sanitize a hostname for use in redirect URLs (prevent injection).
pub fn sanitize_host(host: &str) -> String {
  host
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == ':')
    .collect()
}

// --- Filename sanitization ---

/// Sanitize a filename for Content-Disposition header.
pub fn sanitize_filename(name: &str) -> String {
  let cleaned: String = name
    .chars()
    .filter(|&c| c.is_ascii_graphic() || c == ' ')
    .filter(|&c| c != '"' && c != '\\')
    .take(200)
    .collect();
  cleaned
}

/// Format download speed in human-readable form.
pub fn format_speed(bytes_per_sec: f64) -> String {
  if bytes_per_sec < 1024.0 {
    format!("{} B/s", bytes_per_sec.round() as u64)
  } else if bytes_per_sec < 1024.0 * 1024.0 {
    format!("{:.1} KB/s", bytes_per_sec / 1024.0)
  } else {
    format!("{:.1} MB/s", bytes_per_sec / (1024.0 * 1024.0))
  }
}

/// Verify a resolved path is within a base directory.
pub fn path_within_base(resolved: &std::path::Path, base: &std::path::Path) -> bool {
  resolved.starts_with(base)
    && resolved
      .to_str()
      .map(|s| {
        let base_str = base.to_str().unwrap_or("");
        s.len() > base_str.len()
          && s.as_bytes().get(base_str.len()) == Some(&b'/')
      })
      .unwrap_or(false)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::Path;

  #[test]
  fn test_validate_path_segment_valid() {
    assert!(validate_path_segment("abcdef12345678", "test").is_ok());
    assert!(validate_path_segment("com.example.app", "test").is_ok());
    assert!(validate_path_segment("my-app_v2.0", "test").is_ok());
  }

  #[test]
  fn test_validate_path_segment_invalid() {
    assert!(validate_path_segment("", "test").is_err());
    assert!(validate_path_segment(".", "test").is_err());
    assert!(validate_path_segment("..", "test").is_err());
    assert!(validate_path_segment("a/b", "test").is_err());
    assert!(validate_path_segment("a b", "test").is_err());
    assert!(validate_path_segment("../../etc", "test").is_err());
  }

  #[test]
  fn test_sanitize_path_segment() {
    assert_eq!(sanitize_path_segment("hello").unwrap(), "hello");
    assert_eq!(sanitize_path_segment("a/b").unwrap(), "a_b");
    assert_eq!(sanitize_path_segment("a b").unwrap(), "a_b");
    assert!(sanitize_path_segment("").is_err());
  }

  #[test]
  fn test_validate_download_url_valid() {
    assert!(validate_download_url("https://iosapps.itunes.apple.com/itunes-assets/file.ipa").is_ok());
    assert!(validate_download_url("https://cdn.apple.com/file.ipa").is_ok());
  }

  #[test]
  fn test_validate_download_url_not_https() {
    let err = validate_download_url("http://cdn.apple.com/file.ipa").unwrap_err();
    assert!(err.contains("HTTPS"));
  }

  #[test]
  fn test_validate_download_url_wrong_domain() {
    let err = validate_download_url("https://evil.com/file.ipa").unwrap_err();
    assert!(err.contains("Apple domain"));
  }

  #[test]
  fn test_validate_download_url_ip_address() {
    let err = validate_download_url("https://1.2.3.4/file.ipa").unwrap_err();
    assert!(err.contains("IP address"));
  }

  #[test]
  fn test_sanitize_host() {
    assert_eq!(sanitize_host("localhost:8080"), "localhost:8080");
    assert_eq!(sanitize_host("my.host.com"), "my.host.com");
    assert_eq!(sanitize_host("evil\r\nhost"), "evilhost");
  }

  #[test]
  fn test_sanitize_filename() {
    assert_eq!(sanitize_filename("App_1.0.ipa"), "App_1.0.ipa");
    assert_eq!(sanitize_filename("My \"App\""), "My App");
    let long = "a".repeat(300);
    assert_eq!(sanitize_filename(&long).len(), 200);
  }

  #[test]
  fn test_format_speed() {
    assert_eq!(format_speed(500.0), "500 B/s");
    assert_eq!(format_speed(1536.0), "1.5 KB/s");
    assert_eq!(format_speed(1572864.0), "1.5 MB/s");
  }

  #[test]
  fn test_path_within_base() {
    assert!(path_within_base(
      Path::new("/data/packages/abc/file.ipa"),
      Path::new("/data/packages")
    ));
    assert!(!path_within_base(
      Path::new("/data/packages"),
      Path::new("/data/packages")
    ));
    assert!(!path_within_base(
      Path::new("/data/other/file"),
      Path::new("/data/packages")
    ));
    assert!(!path_within_base(
      Path::new("/data/packages-evil/file"),
      Path::new("/data/packages")
    ));
  }
}
