use crate::types::Software;
use serde_json::Value;

/// Extract a string field from a JSON value, returning an empty string if missing.
fn str_or_default(item: &Value, key: &str) -> String {
  item
    .get(key)
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string()
}

/// Extract an optional string field from a JSON value.
fn opt_str(item: &Value, key: &str) -> Option<String> {
  item.get(key).and_then(|v| v.as_str()).map(String::from)
}

/// Map an iTunes API result item to our Software type.
/// Matches Swift CodingKeys in the reference implementation.
pub fn map_software(item: &Value) -> Option<Software> {
  Some(Software {
    id: item.get("trackId")?.as_i64()?,
    bundle_id: item.get("bundleId")?.as_str()?.to_string(),
    name: item.get("trackName")?.as_str()?.to_string(),
    version: str_or_default(item, "version"),
    price: item.get("price").and_then(|v| v.as_f64()),
    artist_name: str_or_default(item, "artistName"),
    seller_name: str_or_default(item, "sellerName"),
    description: str_or_default(item, "description"),
    average_user_rating: item
      .get("averageUserRating")
      .and_then(|v| v.as_f64())
      .unwrap_or(0.0),
    user_rating_count: item
      .get("userRatingCount")
      .and_then(|v| v.as_i64())
      .unwrap_or(0),
    artwork_url: str_or_default(item, "artworkUrl512"),
    screenshot_urls: item
      .get("screenshotUrls")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default(),
    minimum_os_version: str_or_default(item, "minimumOsVersion"),
    file_size_bytes: opt_str(item, "fileSizeBytes"),
    release_date: item
      .get("currentVersionReleaseDate")
      .or_else(|| item.get("releaseDate"))
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    release_notes: opt_str(item, "releaseNotes"),
    formatted_price: opt_str(item, "formattedPrice"),
    primary_genre_name: str_or_default(item, "primaryGenreName"),
  })
}

/// Extract the `results` array from an iTunes API wrapper response
/// and map each item to Software.
pub fn map_search_results(data: &Value) -> Vec<Software> {
  data
    .get("results")
    .and_then(|v| v.as_array())
    .map(|arr| arr.iter().filter_map(map_software).collect())
    .unwrap_or_default()
}

/// Map a single lookup result. Returns None if no results.
pub fn map_lookup_result(data: &Value) -> Option<Software> {
  let count = data
    .get("resultCount")
    .and_then(|v| v.as_i64())
    .unwrap_or(0);
  if count == 0 {
    return None;
  }
  data
    .get("results")
    .and_then(|v| v.as_array())
    .and_then(|arr| arr.first())
    .and_then(map_software)
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn test_map_software_full() {
    let item = json!({
      "trackId": 284882215,
      "bundleId": "com.facebook.Facebook",
      "trackName": "Facebook",
      "version": "400.0",
      "price": 0.0,
      "artistName": "Meta Platforms, Inc.",
      "sellerName": "Meta Platforms, Inc.",
      "description": "Connect with friends",
      "averageUserRating": 3.5,
      "userRatingCount": 1000000,
      "artworkUrl512": "https://example.com/icon.png",
      "screenshotUrls": ["https://example.com/ss1.png"],
      "minimumOsVersion": "16.0",
      "fileSizeBytes": "200000000",
      "currentVersionReleaseDate": "2024-01-01T00:00:00Z",
      "releaseNotes": "Bug fixes",
      "formattedPrice": "Free",
      "primaryGenreName": "Social Networking"
    });

    let sw = map_software(&item).unwrap();
    assert_eq!(sw.id, 284882215);
    assert_eq!(sw.bundle_id, "com.facebook.Facebook");
    assert_eq!(sw.name, "Facebook");
    assert_eq!(sw.version, "400.0");
    assert_eq!(sw.price, Some(0.0));
    assert_eq!(sw.artwork_url, "https://example.com/icon.png");
    assert_eq!(sw.release_date, "2024-01-01T00:00:00Z");
    assert_eq!(sw.primary_genre_name, "Social Networking");
  }

  #[test]
  fn test_map_software_release_date_fallback() {
    let item = json!({
      "trackId": 1,
      "bundleId": "com.test.app",
      "trackName": "Test",
      "releaseDate": "2023-06-15T00:00:00Z"
    });

    let sw = map_software(&item).unwrap();
    assert_eq!(sw.release_date, "2023-06-15T00:00:00Z");
  }

  #[test]
  fn test_map_software_current_version_preferred() {
    let item = json!({
      "trackId": 1,
      "bundleId": "com.test.app",
      "trackName": "Test",
      "releaseDate": "2023-01-01",
      "currentVersionReleaseDate": "2024-01-01"
    });

    let sw = map_software(&item).unwrap();
    assert_eq!(sw.release_date, "2024-01-01");
  }

  #[test]
  fn test_map_software_missing_required_fields() {
    let item = json!({"trackName": "NoId"});
    assert!(map_software(&item).is_none());
  }

  #[test]
  fn test_map_search_results() {
    let data = json!({
      "resultCount": 2,
      "results": [
        {"trackId": 1, "bundleId": "com.a", "trackName": "A"},
        {"trackId": 2, "bundleId": "com.b", "trackName": "B"}
      ]
    });

    let results = map_search_results(&data);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].name, "A");
    assert_eq!(results[1].name, "B");
  }

  #[test]
  fn test_map_lookup_result_found() {
    let data = json!({
      "resultCount": 1,
      "results": [{"trackId": 42, "bundleId": "com.test", "trackName": "Test"}]
    });

    let sw = map_lookup_result(&data).unwrap();
    assert_eq!(sw.id, 42);
  }

  #[test]
  fn test_map_lookup_result_empty() {
    let data = json!({"resultCount": 0, "results": []});
    assert!(map_lookup_result(&data).is_none());
  }

  #[test]
  fn test_map_software_screenshot_urls_default() {
    let item = json!({
      "trackId": 1,
      "bundleId": "com.test",
      "trackName": "Test"
    });

    let sw = map_software(&item).unwrap();
    assert!(sw.screenshot_urls.is_empty());
  }

  #[test]
  fn test_serialized_field_names() {
    let data = json!({
      "resultCount": 1,
      "results": [{
        "trackId": 1,
        "bundleId": "com.test",
        "trackName": "Test App",
        "artworkUrl512": "https://example.com/art.png",
        "currentVersionReleaseDate": "2024-01-01"
      }]
    });

    let sw = map_lookup_result(&data).unwrap();
    let json = serde_json::to_value(&sw).unwrap();

    // Verify exact JSON field names match the API contract
    assert!(json.get("bundleID").is_some());
    assert!(json.get("artworkUrl").is_some());
    assert!(json.get("releaseDate").is_some());
    assert!(json.get("averageUserRating").is_some());
    assert!(json.get("userRatingCount").is_some());
    assert!(json.get("screenshotUrls").is_some());
    assert!(json.get("minimumOsVersion").is_some());
    assert!(json.get("primaryGenreName").is_some());
  }
}
