use plist::Value;

/// Parse a plist from binary or XML data.
pub fn parse_plist(data: &[u8]) -> Option<Value> {
  // plist::from_bytes handles both binary and XML formats
  plist::from_bytes::<Value>(data).ok()
}

/// Extract a string value from a plist dictionary.
pub fn get_string(dict: &Value, key: &str) -> Option<String> {
  dict
    .as_dictionary()?
    .get(key)?
    .as_string()
    .map(String::from)
}

/// Extract a string array from a plist dictionary.
pub fn get_string_array(dict: &Value, key: &str) -> Option<Vec<String>> {
  let arr = dict.as_dictionary()?.get(key)?.as_array()?;
  Some(
    arr
      .iter()
      .filter_map(|v| v.as_string().map(String::from))
      .collect(),
  )
}

/// Convert an XML plist string to binary plist data.
pub fn xml_to_binary_plist(xml: &str) -> Result<Vec<u8>, String> {
  let value: Value =
    plist::from_bytes(xml.as_bytes()).map_err(|e| format!("Failed to parse XML plist: {}", e))?;
  let mut buf = Vec::new();
  plist::to_writer_binary(&mut buf, &value)
    .map_err(|e| format!("Failed to write binary plist: {}", e))?;
  Ok(buf)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_xml_plist() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>MyApp</string>
    <key>SinfPaths</key>
    <array>
        <string>SC_Info/MyApp.sinf</string>
    </array>
</dict>
</plist>"#;

    let val = parse_plist(xml).unwrap();
    assert_eq!(get_string(&val, "CFBundleExecutable"), Some("MyApp".into()));
    assert_eq!(
      get_string_array(&val, "SinfPaths"),
      Some(vec!["SC_Info/MyApp.sinf".into()])
    );
  }

  #[test]
  fn test_xml_to_binary_plist() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>test</key>
    <string>value</string>
</dict>
</plist>"#;

    let binary = xml_to_binary_plist(xml).unwrap();
    assert!(!binary.is_empty());
    // Binary plist magic: "bplist"
    assert!(binary.starts_with(b"bplist"));

    // Verify roundtrip
    let val = parse_plist(&binary).unwrap();
    assert_eq!(get_string(&val, "test"), Some("value".into()));
  }

  #[test]
  fn test_get_string_missing_key() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>a</key>
    <string>b</string>
</dict>
</plist>"#;

    let val = parse_plist(xml).unwrap();
    assert_eq!(get_string(&val, "a"), Some("b".into()));
    assert_eq!(get_string(&val, "missing"), None);
  }
}
