use crate::types::Software;

/// Build an iTunes OTA installation manifest plist XML.
pub fn build_manifest(
  software: &Software,
  payload_url: &str,
  display_image_small_url: &str,
  display_image_large_url: &str,
) -> String {
  format!(
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>{}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>display-image</string>
                    <key>url</key>
                    <string>{}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>full-size-image</string>
                    <key>url</key>
                    <string>{}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>{}</string>
                <key>bundle-version</key>
                <string>{}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>{}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>"#,
    escape_xml(payload_url),
    escape_xml(display_image_small_url),
    escape_xml(display_image_large_url),
    escape_xml(&software.bundle_id),
    escape_xml(&software.version),
    escape_xml(&software.name),
  )
}

fn escape_xml(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for c in s.chars() {
    match c {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      _ => out.push(c),
    }
  }
  out
}

/// Minimal valid 1x1 white PNG (70 bytes).
/// Decoded from the same base64 constant used by the Node.js backend.
pub const WHITE_PNG: &[u8] = &[
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff,
  0x0f, 0x00, 0x09, 0x06, 0x03, 0x01, 0x30, 0x74, 0x44, 0xbb, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[cfg(test)]
mod tests {
  use super::*;

  fn test_software() -> Software {
    Software {
      id: 1,
      bundle_id: "com.example.app".into(),
      name: "Test App".into(),
      version: "1.0".into(),
      price: None,
      artist_name: "Test".into(),
      seller_name: "Test".into(),
      description: "A test".into(),
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
  fn test_build_manifest_structure() {
    let sw = test_software();
    let xml = build_manifest(
      &sw,
      "https://example.com/payload.ipa",
      "https://example.com/small.png",
      "https://example.com/large.png",
    );

    assert!(xml.starts_with("<?xml"));
    assert!(xml.contains("<!DOCTYPE plist"));
    assert!(xml.contains("<string>software-package</string>"));
    assert!(xml.contains("<string>display-image</string>"));
    assert!(xml.contains("<string>full-size-image</string>"));
    assert!(xml.contains("<string>https://example.com/payload.ipa</string>"));
    assert!(xml.contains("<string>com.example.app</string>"));
    assert!(xml.contains("<string>1.0</string>"));
    assert!(xml.contains("<string>Test App</string>"));
    assert!(xml.contains("<string>software</string>"));
  }

  #[test]
  fn test_build_manifest_xml_escaping() {
    let mut sw = test_software();
    sw.name = "App & \"Friends\" <More>".into();
    let xml = build_manifest(&sw, "https://a.com/b?x=1&y=2", "", "");
    assert!(xml.contains("App &amp; &quot;Friends&quot; &lt;More&gt;"));
    assert!(xml.contains("https://a.com/b?x=1&amp;y=2"));
  }

  #[test]
  fn test_white_png_valid() {
    assert_eq!(WHITE_PNG.len(), 70);
    // PNG magic bytes
    assert_eq!(&WHITE_PNG[0..4], &[0x89, 0x50, 0x4e, 0x47]);
    // IEND chunk
    assert_eq!(
      &WHITE_PNG[WHITE_PNG.len() - 8..],
      &[0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]
    );
  }
}
