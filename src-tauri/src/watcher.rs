use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

/// Editors rarely write a file once. Vim and friends write a temp file and
/// rename it over the target, which arrives as a burst of events; this window
/// collapses the burst into a single reload.
const DEBOUNCE: Duration = Duration::from_millis(120);

pub const CHANGED_EVENT: &str = "document:changed";
pub const REMOVED_EVENT: &str = "document:removed";

#[derive(Clone, Serialize)]
pub struct FileEvent {
    pub path: String,
}

#[derive(Default)]
pub struct WatchState {
    /// Dropping the watcher stops the OS notifications and closes the channel,
    /// which in turn ends the worker thread.
    active: Mutex<Option<(RecommendedWatcher, PathBuf)>>,
}

impl WatchState {
    pub fn clear(&self) {
        if let Ok(mut guard) = self.active.lock() {
            *guard = None;
        }
    }
}

fn spawn_worker<R: Runtime>(
    app: AppHandle<R>,
    rx: mpsc::Receiver<notify::Result<Event>>,
    watched: PathBuf,
) {
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut touched = matches_event(&first, &watched);
            let mut removed = is_removal(&first, &watched);

            // Drain whatever else arrives inside the debounce window.
            while let Ok(next) = rx.recv_timeout(DEBOUNCE) {
                touched |= matches_event(&next, &watched);
                removed |= is_removal(&next, &watched);
            }

            if !touched && !removed {
                continue;
            }

            let payload = FileEvent {
                path: watched.to_string_lossy().into_owned(),
            };

            // A rename-into-place looks like a removal followed immediately by
            // a create, so only report a removal the file has not come back from.
            if removed && !watched.exists() {
                let _ = app.emit(REMOVED_EVENT, payload);
            } else {
                let _ = app.emit(CHANGED_EVENT, payload);
            }
        }
    });
}

fn event_paths(event: &notify::Result<Event>) -> Vec<PathBuf> {
    match event {
        Ok(ev) => ev.paths.clone(),
        Err(_) => Vec::new(),
    }
}

fn matches_event(event: &notify::Result<Event>, watched: &Path) -> bool {
    let kind_ok = matches!(
        event.as_ref().map(|e| e.kind),
        Ok(EventKind::Create(_)) | Ok(EventKind::Modify(_)) | Ok(EventKind::Any)
    );
    kind_ok && event_paths(event).iter().any(|p| p == watched)
}

fn is_removal(event: &notify::Result<Event>, watched: &Path) -> bool {
    matches!(event.as_ref().map(|e| e.kind), Ok(EventKind::Remove(_)))
        && event_paths(event).iter().any(|p| p == watched)
}

/// Watch a single document for changes, replacing any previous watch.
///
/// The parent directory is watched rather than the file itself: an editor that
/// replaces the file by rename would otherwise leave the watch pointing at a
/// deleted inode and go silent.
#[tauri::command]
pub fn watch_document<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, WatchState>,
    path: String,
) -> Result<(), String> {
    let file = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let dir = file
        .parent()
        .ok_or_else(|| String::from("document has no parent directory"))?
        .to_path_buf();

    let mut guard = state.active.lock().map_err(|e| e.to_string())?;
    if let Some((_, current)) = guard.as_ref() {
        if current == &file {
            return Ok(());
        }
    }
    // Drop the previous watcher before creating the next one.
    *guard = None;

    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    spawn_worker(app, rx, file.clone());
    *guard = Some((watcher, file));
    Ok(())
}

#[tauri::command]
pub fn unwatch_document(state: tauri::State<'_, WatchState>) {
    state.clear();
}
