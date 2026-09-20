use tauri::webview::NewWindowResponse;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or_else(|| std::io::Error::other("REFERENCE_WINDOW_CONFIG_REQUIRED"))?;
            tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
                .use_https_scheme(true)
                .on_navigation(|url| {
                    let local_origin = url.scheme() == "https"
                        && url.host_str() == Some("tauri.localhost");
                    local_origin
                        && matches!(url.path(), "/offline/" | "/offline/index.html")
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(|_, _| false)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("GLYMIZE reference shell failed");
}
