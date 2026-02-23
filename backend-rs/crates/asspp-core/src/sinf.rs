/// Represents the injection plan for SINF files into an IPA.
#[derive(Debug, Clone)]
pub struct InjectionPlan {
  /// Files to add/replace in the ZIP archive: (archive_path, data)
  pub files: Vec<(String, Vec<u8>)>,
}

/// Injection source: either from Manifest.plist SinfPaths or Info.plist CFBundleExecutable.
#[derive(Debug)]
pub enum InjectionSource {
  /// Use SinfPaths from Manifest.plist
  Manifest { sinf_paths: Vec<String> },
  /// Use CFBundleExecutable from Info.plist to derive sinf path
  Info { bundle_executable: String },
}

/// Plan the SINF injection given the bundle name, injection source, sinf data,
/// and optional iTunesMetadata.
///
/// This is a pure function — it computes what files to add/replace without I/O.
pub fn plan_injection(
  bundle_name: &str,
  source: &InjectionSource,
  sinfs: &[(i64, Vec<u8>)],
  itunes_metadata_binary: Option<&[u8]>,
) -> InjectionPlan {
  let mut files = Vec::new();

  match source {
    InjectionSource::Manifest { sinf_paths } => {
      for (sinf_path, (_id, data)) in sinf_paths.iter().zip(sinfs.iter()) {
        let full_path = format!("Payload/{}.app/{}", bundle_name, sinf_path);
        files.push((full_path, data.clone()));
      }
    }
    InjectionSource::Info { bundle_executable } => {
      if !sinfs.is_empty() {
        let sinf_path = format!(
          "Payload/{}.app/SC_Info/{}.sinf",
          bundle_name, bundle_executable
        );
        files.push((sinf_path, sinfs[0].1.clone()));
      }
    }
  }

  if let Some(metadata) = itunes_metadata_binary {
    files.push(("iTunesMetadata.plist".into(), metadata.to_vec()));
  }

  InjectionPlan { files }
}

/// Extract the bundle name from a ZIP entry path like "Payload/MyApp.app/Info.plist".
/// Returns the part before ".app" (e.g., "MyApp").
pub fn extract_bundle_name(entry_path: &str) -> Option<String> {
  // Skip Watch app paths
  if entry_path.contains("/Watch/") {
    return None;
  }

  if !entry_path.contains(".app/Info.plist") {
    return None;
  }

  for component in entry_path.split('/') {
    if component.ends_with(".app") {
      return Some(component.strip_suffix(".app")?.to_string());
    }
  }
  None
}

/// Check if a ZIP entry is a Manifest.plist in the SC_Info directory.
pub fn is_manifest_plist(entry_path: &str) -> bool {
  entry_path.ends_with(".app/SC_Info/Manifest.plist")
}

/// Check if a ZIP entry is an Info.plist in the app bundle (not in Watch).
pub fn is_info_plist(entry_path: &str) -> bool {
  entry_path.contains(".app/Info.plist") && !entry_path.contains("/Watch/")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_extract_bundle_name() {
    assert_eq!(
      extract_bundle_name("Payload/MyApp.app/Info.plist"),
      Some("MyApp".into())
    );
    assert_eq!(
      extract_bundle_name("Payload/My App.app/Info.plist"),
      Some("My App".into())
    );
    assert_eq!(extract_bundle_name("Payload/Watch/WatchApp.app/Info.plist"), None);
    assert_eq!(extract_bundle_name("random/file.txt"), None);
  }

  #[test]
  fn test_is_manifest_plist() {
    assert!(is_manifest_plist("Payload/MyApp.app/SC_Info/Manifest.plist"));
    assert!(!is_manifest_plist("Payload/MyApp.app/Info.plist"));
    assert!(!is_manifest_plist("other/path"));
  }

  #[test]
  fn test_is_info_plist() {
    assert!(is_info_plist("Payload/MyApp.app/Info.plist"));
    assert!(!is_info_plist("Payload/Watch/WatchApp.app/Info.plist"));
    assert!(!is_info_plist("random/file"));
  }

  #[test]
  fn test_plan_injection_from_manifest() {
    let sinfs = vec![
      (0, vec![1, 2, 3]),
      (1, vec![4, 5, 6]),
    ];

    let plan = plan_injection(
      "MyApp",
      &InjectionSource::Manifest {
        sinf_paths: vec![
          "SC_Info/MyApp.sinf".into(),
          "SC_Info/MyAppExt.sinf".into(),
        ],
      },
      &sinfs,
      None,
    );

    assert_eq!(plan.files.len(), 2);
    assert_eq!(plan.files[0].0, "Payload/MyApp.app/SC_Info/MyApp.sinf");
    assert_eq!(plan.files[0].1, vec![1, 2, 3]);
    assert_eq!(plan.files[1].0, "Payload/MyApp.app/SC_Info/MyAppExt.sinf");
    assert_eq!(plan.files[1].1, vec![4, 5, 6]);
  }

  #[test]
  fn test_plan_injection_from_info() {
    let sinfs = vec![(0, vec![10, 20, 30])];

    let plan = plan_injection(
      "MyApp",
      &InjectionSource::Info {
        bundle_executable: "MyAppExec".into(),
      },
      &sinfs,
      None,
    );

    assert_eq!(plan.files.len(), 1);
    assert_eq!(
      plan.files[0].0,
      "Payload/MyApp.app/SC_Info/MyAppExec.sinf"
    );
  }

  #[test]
  fn test_plan_injection_with_metadata() {
    let sinfs = vec![(0, vec![1])];
    let metadata = b"<plist>test</plist>";

    let plan = plan_injection(
      "App",
      &InjectionSource::Info {
        bundle_executable: "App".into(),
      },
      &sinfs,
      Some(metadata),
    );

    assert_eq!(plan.files.len(), 2);
    assert_eq!(plan.files[1].0, "iTunesMetadata.plist");
    assert_eq!(plan.files[1].1, metadata.to_vec());
  }

  #[test]
  fn test_plan_injection_empty_sinfs() {
    let plan = plan_injection(
      "App",
      &InjectionSource::Info {
        bundle_executable: "App".into(),
      },
      &[],
      None,
    );
    assert!(plan.files.is_empty());
  }

  #[test]
  fn test_plan_injection_fewer_sinfs_than_paths() {
    let sinfs = vec![(0, vec![1])];
    let plan = plan_injection(
      "App",
      &InjectionSource::Manifest {
        sinf_paths: vec!["a.sinf".into(), "b.sinf".into(), "c.sinf".into()],
      },
      &sinfs,
      None,
    );
    // Only 1 sinf provided, so only first path gets injected
    assert_eq!(plan.files.len(), 1);
  }
}
