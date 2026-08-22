use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// Refuse to slurp something that is clearly not a document. 64 MB of
/// Markdown is already far past anything a human wrote.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

const MARKDOWN_EXTENSIONS: &[&str] = &[
    "md", "markdown", "mdown", "mkd", "mkdn", "mdx", "qmd", "rmd", "text", "txt",
];

#[derive(Serialize)]
pub struct Document {
    pub path: String,
    pub name: String,
    pub dir: String,
    pub content: String,
    pub size: u64,
    pub modified: Option<u64>,
    /// True when the bytes were not valid UTF-8 and had to be replaced.
    pub lossy: bool,
}

fn to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Grant the webview permission to load images, video and fonts sitting next
/// to the document. Without this the `asset:` protocol refuses the request.
fn allow_directory<R: Runtime>(app: &AppHandle<R>, dir: &Path) {
    let scope = app.asset_protocol_scope();
    let _ = scope.allow_directory(dir, true);
}

#[tauri::command]
pub fn read_document<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Document, String> {
    let raw = PathBuf::from(&path);
    let resolved = fs::canonicalize(&raw).map_err(|e| format!("{}: {}", path, e))?;

    let meta = fs::metadata(&resolved).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err(format!("{} is a directory", resolved.display()));
    }
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File is {:.1} MB; the limit is {} MB",
            meta.len() as f64 / 1_048_576.0,
            MAX_BYTES / 1_048_576
        ));
    }

    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;
    // Valid UTF-8 is taken as-is; anything else is decoded with replacement
    // characters and flagged, so the reader is told rather than shown mojibake
    // without explanation.
    let (content, lossy) = match String::from_utf8(bytes) {
        Ok(text) => (text, false),
        Err(err) => (String::from_utf8_lossy(err.as_bytes()).into_owned(), true),
    };

    let dir = resolved
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("/"));
    allow_directory(&app, &dir);

    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);

    Ok(Document {
        name: resolved
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| String::from("untitled")),
        path: to_string(&resolved),
        dir: to_string(&dir),
        content,
        size: meta.len(),
        modified,
        lossy,
    })
}

fn candidate_paths(base: &Path, target: &str) -> Vec<PathBuf> {
    let cleaned = target.split('#').next().unwrap_or(target).trim();
    let direct = base.join(cleaned);
    let mut out = vec![direct.clone()];

    if direct.extension().is_none() {
        for ext in MARKDOWN_EXTENSIONS {
            out.push(direct.with_extension(ext));
        }
    }
    out
}

/// Walk `dir` looking for a file whose stem matches `name`. Wiki links name a
/// note rather than a path, so this is how `[[Design Notes]]` finds
/// `docs/architecture/design-notes.md`.
fn search_by_stem(dir: &Path, name: &str, depth: usize, budget: &mut usize) -> Option<PathBuf> {
    if depth == 0 || *budget == 0 {
        return None;
    }
    let wanted = name.to_lowercase();
    let entries = fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();

    for entry in entries.flatten() {
        if *budget == 0 {
            return None;
        }
        *budget -= 1;
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            let skip = path
                .file_name()
                .map(|n| n.to_string_lossy().starts_with('.') || n == "node_modules")
                .unwrap_or(true);
            if !skip {
                subdirs.push(path);
            }
            continue;
        }
        let stem_matches = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_lowercase() == wanted)
            .unwrap_or(false);
        let ext_ok = path
            .extension()
            .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
            .unwrap_or(false);
        if stem_matches && ext_ok {
            return Some(path);
        }
    }

    for sub in subdirs {
        if let Some(found) = search_by_stem(&sub, name, depth - 1, budget) {
            return Some(found);
        }
    }
    None
}

/// Turn a relative path or wiki-link target into an absolute file path.
#[tauri::command]
pub fn resolve_link<R: Runtime>(
    app: AppHandle<R>,
    base_dir: String,
    target: String,
) -> Result<Option<String>, String> {
    let base = PathBuf::from(&base_dir);
    if !base.is_dir() {
        return Err(format!("{} is not a directory", base_dir));
    }

    for candidate in candidate_paths(&base, &target) {
        if candidate.is_file() {
            let resolved = fs::canonicalize(&candidate).map_err(|e| e.to_string())?;
            if let Some(parent) = resolved.parent() {
                allow_directory(&app, parent);
            }
            return Ok(Some(to_string(&resolved)));
        }
    }

    let stem = target.split('#').next().unwrap_or(&target).trim();
    let stem = Path::new(stem)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| stem.to_string());

    let mut budget = 4000usize;
    if let Some(found) = search_by_stem(&base, &stem, 5, &mut budget) {
        let resolved = fs::canonicalize(&found).map_err(|e| e.to_string())?;
        if let Some(parent) = resolved.parent() {
            allow_directory(&app, parent);
        }
        return Ok(Some(to_string(&resolved)));
    }

    Ok(None)
}

/// Sibling documents, so the viewer can offer next/previous navigation.
#[tauri::command]
pub fn list_siblings(path: String) -> Result<Vec<String>, String> {
    let file = PathBuf::from(&path);
    let dir = file.parent().ok_or_else(|| String::from("no parent"))?;

    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_markdown_path(&p.to_string_lossy()))
        .collect();

    files.sort();
    Ok(files.iter().map(|p| to_string(p)).collect())
}

pub fn is_markdown_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}
