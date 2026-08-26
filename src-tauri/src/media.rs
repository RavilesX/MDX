use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};

/// Extension → MIME type for the media a Markdown document can embed.
/// Good enough for a `data:` URI; anything unrecognised falls back to a
/// generic binary type, which browsers still render fine for images.
fn guess_mime(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("ogv") => "video/ogg",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        _ => "application/octet-stream",
    }
}

/// Reads a local file and returns it as a `data:` URI, so an exported
/// document can carry it inline instead of pointing at a path on disk. The
/// asset: URL the viewer normally uses only resolves inside the webview;
/// Chromium rendering the export headlessly, or the file opened later on
/// another machine, has no way to follow it.
#[tauri::command]
pub fn read_file_as_data_url(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    let mime = guess_mime(&path);
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
