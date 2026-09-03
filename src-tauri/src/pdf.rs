use std::process::Stdio;

use url::Url;

/// Renders `html` to a PDF at `out_path` with a system Chromium-family
/// browser in headless mode. WebKitGTK's own print pipeline (the
/// `window.print()` path) does not emit link annotations, so hyperlinks turn
/// into dead text in a PDF made that way; headless Chromium printing keeps
/// them clickable.
#[tauri::command]
pub fn export_pdf(html: String, out_path: String) -> Result<(), String> {
    let browser = platform::find_browser().ok_or_else(platform::no_browser_message)?;

    let temp_html = std::env::temp_dir().join(format!("mdx-export-{}.html", std::process::id()));
    std::fs::write(&temp_html, html).map_err(|e| e.to_string())?;

    // A plain `format!("file://{}", path.display())` mangles a Windows path
    // (`file://C:\Users\...` is not a valid URL, and any space would need
    // percent-encoding); `Url::from_file_path` gets both right on every OS.
    let file_url = Url::from_file_path(&temp_html)
        .map_err(|_| format!("could not build a file:// URL for {}", temp_html.display()))?;

    let result = platform::command(&browser)
        .args([
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            &format!("--print-to-pdf={out_path}"),
            file_url.as_str(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    let _ = std::fs::remove_file(&temp_html);

    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("{} exited with {status}", browser.display())),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(windows))]
mod platform {
    use std::path::PathBuf;
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

    pub fn find_browser() -> Option<PathBuf> {
        CANDIDATES
            .iter()
            .find(|bin| {
                Command::new(bin)
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|status| status.success())
                    .unwrap_or(false)
            })
            .map(PathBuf::from)
    }

    pub fn command(browser: &std::path::Path) -> Command {
        Command::new(browser)
    }

    pub fn no_browser_message() -> String {
        "No Chromium or Google Chrome found on PATH. Install one, or use Print… instead."
            .to_string()
    }
}

#[cfg(windows)]
mod platform {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    /// `Application` subfolder, relative to a Program Files-style root, and
    /// the executable inside it, for each browser worth checking.
    const KNOWN_INSTALLS: &[(&str, &str)] = &[
        (r"Microsoft\Edge\Application", "msedge.exe"),
        (r"Google\Chrome\Application", "chrome.exe"),
        (r"BraveSoftware\Brave-Browser\Application", "brave.exe"),
        (r"Chromium\Application", "chrome.exe"),
    ];

    /// Names the same browsers are registered under in the Windows shell —
    /// `HKLM\...\App Paths\<exe>` holds the install path for anything
    /// registered as a shell-openable app, which covers installs outside the
    /// conventional Program Files layout (a custom drive, a portable copy
    /// that still registered itself, machine-wide policy pins, etc).
    const APP_PATHS_EXES: &[&str] = &["msedge.exe", "chrome.exe", "brave.exe", "chromium.exe"];

    fn program_files_roots() -> Vec<PathBuf> {
        ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"]
            .iter()
            .filter_map(std::env::var_os)
            .map(PathBuf::from)
            .collect()
    }

    fn from_known_installs() -> Option<PathBuf> {
        program_files_roots().into_iter().find_map(|root| {
            KNOWN_INSTALLS
                .iter()
                .map(|(subdir, exe)| root.join(subdir).join(exe))
                .find(|candidate| candidate.is_file())
        })
    }

    fn from_registry() -> Option<PathBuf> {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;

        [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER].into_iter().find_map(|hive| {
            let root = RegKey::predef(hive);
            APP_PATHS_EXES.iter().find_map(|exe| {
                let key_path = format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}");
                let path: String = root.open_subkey(&key_path).ok()?.get_value("").ok()?;
                let candidate = PathBuf::from(path);
                candidate.is_file().then_some(candidate)
            })
        })
    }

    /// Existence-checked, not probed with `--version`: on Windows that would
    /// spawn a visible console flash per candidate, and Edge/Chrome do not
    /// reliably print a version to stdout when launched headlessly this way.
    pub fn find_browser() -> Option<PathBuf> {
        from_known_installs().or_else(from_registry)
    }

    pub fn command(browser: &Path) -> Command {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: the child is a console-subsystem binary even
        // though MDX itself is windows-subsystem; without this a console
        // window flashes for the duration of the export.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = Command::new(browser);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    pub fn no_browser_message() -> String {
        "No Chromium-based browser (Edge, Chrome, Brave) was found. \
         Edge ships with Windows by default, so this is unusual — install one, \
         or use Print… instead."
            .to_string()
    }
}
