use tauri::webview::NewWindowResponse;

fn is_allowed_navigation(url: &tauri::Url) -> bool {
    let local_origin = url.scheme() == "https"
        && url.host_str() == Some("tauri.localhost")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none();

    local_origin
        && matches!(url.path(), "/offline/" | "/offline/index.html")
        && url.query().is_none()
        && url.fragment().is_none()
}

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
                .on_navigation(is_allowed_navigation)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(|_, _| false)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("GLYMIZE reference shell failed");
}

#[cfg(test)]
mod tests {
    use super::is_allowed_navigation;

    fn url(value: &str) -> tauri::Url {
        tauri::Url::parse(value).expect("test URL must parse")
    }

    #[test]
    fn accepts_only_the_two_bundled_reference_routes() {
        assert!(is_allowed_navigation(&url(
            "https://tauri.localhost/offline/"
        )));
        assert!(is_allowed_navigation(&url(
            "https://tauri.localhost/offline/index.html"
        )));
    }

    #[test]
    fn rejects_external_origins_and_non_https_schemes() {
        assert!(!is_allowed_navigation(&url(
            "https://example.com/offline/index.html"
        )));
        assert!(!is_allowed_navigation(&url(
            "http://tauri.localhost/offline/index.html"
        )));
        assert!(!is_allowed_navigation(&url(
            "https://tauri.localhost:444/offline/index.html"
        )));
    }

    #[test]
    fn rejects_other_paths_queries_fragments_and_credentials() {
        for candidate in [
            "https://tauri.localhost/",
            "https://tauri.localhost/admin/",
            "https://tauri.localhost/offline/index.html?remote=true",
            "https://tauri.localhost/offline/index.html#fragment",
            "https://user@tauri.localhost/offline/index.html",
            "https://tauri.localhost/offline/%2e%2e/admin",
        ] {
            assert!(!is_allowed_navigation(&url(candidate)), "{candidate}");
        }
    }
}
