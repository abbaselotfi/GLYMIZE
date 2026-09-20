fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[] as &[&str])),
    )
    .expect("failed to build the reference-only Tauri manifest");
}
