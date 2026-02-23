/// Validate that a GUID is a hex string.
pub fn validate_guid(guid: &str) -> bool {
  !guid.is_empty() && guid.chars().all(|c| c.is_ascii_hexdigit())
}

/// Build the bag URL for the given GUID.
pub fn bag_url(guid: &str) -> String {
  format!(
    "https://init.itunes.apple.com/bag.xml?guid={}",
    urlencoding::encode(guid)
  )
}

/// Extract the `<plist>...</plist>` block from an XML bag response.
pub fn extract_plist(body: &str) -> Option<&str> {
  let start = body.find("<plist")?;
  let end = body.find("</plist>")?;
  Some(&body[start..end + "</plist>".len()])
}

/// Apple Configurator user agent for bag requests.
pub const BAG_USER_AGENT: &str =
  "Configurator/2.17 (Macintosh; OS X 15.2; 24C5089c) AppleWebKit/0620.1.16.11.6";

/// Maximum bag response size (1 MB).
pub const BAG_MAX_RESPONSE_BYTES: usize = 1024 * 1024;

/// Bag request timeout in seconds.
pub const BAG_TIMEOUT_SECS: u64 = 15;

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_validate_guid_valid() {
    assert!(validate_guid("abcdef123456"));
    assert!(validate_guid("ABCDEF"));
    assert!(validate_guid("0123456789"));
    assert!(validate_guid("aAbBcC"));
  }

  #[test]
  fn test_validate_guid_invalid() {
    assert!(!validate_guid(""));
    assert!(!validate_guid("xyz"));
    assert!(!validate_guid("ab cd"));
    assert!(!validate_guid("ab-cd"));
    assert!(!validate_guid("hello!"));
  }

  #[test]
  fn test_bag_url() {
    assert_eq!(
      bag_url("abcdef123456"),
      "https://init.itunes.apple.com/bag.xml?guid=abcdef123456"
    );
  }

  #[test]
  fn test_extract_plist() {
    let body = r#"<?xml version="1.0"?>
some garbage
<plist version="1.0">
<dict>
  <key>test</key>
  <string>value</string>
</dict>
</plist>
more garbage"#;

    let result = extract_plist(body).unwrap();
    assert!(result.starts_with("<plist"));
    assert!(result.ends_with("</plist>"));
    assert!(result.contains("<key>test</key>"));
  }

  #[test]
  fn test_extract_plist_not_found() {
    assert!(extract_plist("no plist here").is_none());
  }
}
