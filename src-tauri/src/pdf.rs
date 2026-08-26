use std::process::{Command, Stdio};

/// Checked in order; the first one found on `PATH` renders the PDF.
const CANDIDATES: &[&str] = &[
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "brave-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
];

fn find_browser() -> Option<&'static str> {
    CANDIDATES.iter().copied().find(|bin| {
        Command::new(bin)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    })
}

/// Renders `html` to a PDF at `out_path` with a system Chromium/Chrome in
/// headless mode. WebKitGTK's own print pipeline (the `window.print()` path)
/// does not emit link annotations, so hyperlinks turn into dead text in a
/// PDF made that way; Chromium's headless printing keeps them clickable.
#[tauri::command]
pub fn export_pdf(html: String, out_path: String) -> Result<(), String> {
    let browser = find_browser().ok_or_else(|| {
        "No Chromium or Google Chrome found on PATH. Install one, or use Print… instead.".to_string()
    })?;

    let temp_html = std::env::temp_dir().join(format!("mdx-export-{}.html", std::process::id()));
    std::fs::write(&temp_html, html).map_err(|e| e.to_string())?;

    let file_url = format!("file://{}", temp_html.display());
    let result = Command::new(browser)
        .args([
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            &format!("--print-to-pdf={out_path}"),
            &file_url,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    let _ = std::fs::remove_file(&temp_html);

    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("{browser} exited with {status}")),
        Err(e) => Err(e.to_string()),
    }
}
