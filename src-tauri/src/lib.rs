mod document;
mod media;
mod pdf;
mod watcher;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const OPEN_EVENT: &str = "document:open";

/// How this process was launched: the document to open, if any, and whether
/// it should stay windowless until one arrives.
#[derive(Default)]
struct Startup {
    document: Mutex<Option<String>>,
    /// Set by `--hidden`. The webview still loads — that is the whole point,
    /// it is the warm part — but the window is not shown.
    stay_hidden: AtomicBool,
}

#[derive(Clone, Serialize)]
struct OpenPayload {
    path: String,
}

/// Strip a `file://` scheme off a launch argument, if present. Delegated to
/// `url::Url` rather than a plain prefix-cut: on Windows a `file://` URL
/// looks like `file:///C:/Users/x/a.md`, so `strip_prefix("file://")` alone
/// would leave a leading `/C:/...` that no longer names a real path, and
/// spaces or accents in the path can arrive percent-encoded either way.
fn strip_file_scheme(arg: &str) -> String {
    url::Url::parse(arg)
        .ok()
        .filter(|url| url.scheme() == "file")
        .and_then(|url| url.to_file_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| arg.to_string())
}

/// Pick the first argument that names a file on disk. Flags and the argv[0]
/// program path are skipped.
fn first_file_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| strip_file_scheme(&a))
        .find(|a| std::path::Path::new(a).is_file())
        .and_then(|a| document::canonical(a).ok())
        .map(|p| p.to_string_lossy().into_owned())
}

fn wants_hidden<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter().any(|a| a == "--hidden" || a == "--background")
}

/// Bring the existing window forward and hand it a new document. This is what
/// makes the second `mdx some.md` reuse the already-warm process instead of
/// paying webview startup again.
fn focus_with_document<R: Runtime>(app: &AppHandle<R>, path: Option<String>) {
    // A document has arrived, so the warm-start window is wanted on screen.
    if let Some(state) = app.try_state::<Startup>() {
        state.stay_hidden.store(false, Ordering::Relaxed);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(path) = path {
            let _ = window.emit(OPEN_EVENT, OpenPayload { path });
        }
    }
}

#[tauri::command]
fn startup_document(state: tauri::State<'_, Startup>) -> Option<String> {
    state.document.lock().ok().and_then(|mut guard| guard.take())
}

/// Called by the webview once the first paint is done. Keeping the window
/// hidden until then avoids showing an empty white rectangle on cold start.
///
/// Under `--hidden` this must do nothing: the process is warming up in the
/// background and has no document to show yet.
#[tauri::command]
fn ready<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, Startup>) {
    if state.stay_hidden.load(Ordering::Relaxed) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            focus_with_document(app, first_file_arg(argv));
        }));
    }

    builder
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(watcher::WatchState::default())
        .manage(Startup::default())
        .invoke_handler(tauri::generate_handler![
            startup_document,
            ready,
            document::read_document,
            document::resolve_link,
            document::list_siblings,
            media::read_file_as_data_url,
            pdf::export_pdf,
            watcher::watch_document,
            watcher::unwatch_document,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let file = first_file_arg(args.clone());
            // `--hidden` is how the systemd user service keeps a warm process
            // around: the app runs with no window until a file shows up. A
            // file named on the same command line wins over the flag.
            let hidden = wants_hidden(args) && file.is_none();

            if let Some(state) = app.try_state::<Startup>() {
                state.stay_hidden.store(hidden, Ordering::Relaxed);
                if let (Some(path), Ok(mut guard)) = (file, state.document.lock()) {
                    *guard = Some(path);
                }
            }

            // The window is created hidden either way; it is shown by `ready`
            // once the first paint lands, or by the single-instance handler
            // when a document arrives.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MDX");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_flags_and_argv_zero() {
        let args = vec![
            String::from("/usr/bin/mdx"),
            String::from("--hidden"),
            String::from("/definitely/missing.md"),
        ];
        assert_eq!(first_file_arg(args), None);
    }

    #[test]
    fn detects_hidden_flag() {
        assert!(wants_hidden(vec![String::from("mdx"), String::from("--hidden")]));
        assert!(!wants_hidden(vec![String::from("mdx")]));
    }

    #[test]
    fn finds_an_existing_file() {
        let dir = std::env::temp_dir().join("mdx-arg-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("note.md");
        std::fs::write(&file, "# hi").unwrap();

        let args = vec![
            String::from("mdx"),
            String::from("--hidden"),
            file.to_string_lossy().into_owned(),
        ];
        let found = first_file_arg(args).expect("file argument should be found");
        assert!(found.ends_with("note.md"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recognises_markdown_extensions() {
        assert!(document::is_markdown_path("/tmp/a.MD"));
        assert!(document::is_markdown_path("/tmp/a.markdown"));
        assert!(!document::is_markdown_path("/tmp/a.png"));
    }

    // A `file:///home/...` URL has no drive letter, so it isn't representable
    // as a Windows path — `Url::to_file_path()` correctly refuses it there and
    // `strip_file_scheme` falls back to returning the string unchanged. That
    // fallback is the right behaviour (the caller still has *something*
    // usable), just not one a Unix-shaped URL can round-trip through on
    // Windows, so these two are POSIX-only.
    #[cfg(not(windows))]
    #[test]
    fn strips_unix_file_url() {
        assert_eq!(strip_file_scheme("file:///home/x/notes.md"), "/home/x/notes.md");
    }

    #[cfg(not(windows))]
    #[test]
    fn strips_percent_encoding_in_file_url() {
        assert_eq!(
            strip_file_scheme("file:///home/x/my%20notes.md"),
            "/home/x/my notes.md"
        );
    }

    #[test]
    fn leaves_plain_paths_untouched() {
        assert_eq!(strip_file_scheme("/home/x/notes.md"), "/home/x/notes.md");
        assert_eq!(strip_file_scheme("notes.md"), "notes.md");
        // A bare Windows drive path parses as a scheme-looking string, but its
        // scheme is "c", not "file", so it must pass through unchanged.
        assert_eq!(
            strip_file_scheme("C:\\Users\\x\\notes.md"),
            "C:\\Users\\x\\notes.md"
        );
    }

    #[cfg(windows)]
    #[test]
    fn strips_windows_file_url() {
        assert_eq!(
            strip_file_scheme("file:///C:/Users/x/notes.md"),
            "C:\\Users\\x\\notes.md"
        );
    }
}
