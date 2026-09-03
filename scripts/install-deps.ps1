#!/usr/bin/env pwsh
# Install what is needed to build MDX on Windows.
#
# Requires winget (bundled with Windows 10 2004+ and Windows 11, otherwise
# available as "App Installer" from the Microsoft Store). Installs the MSVC
# Rust toolchain — the GNU one cannot link against WebView2 — the Visual
# Studio Build Tools' C++ workload Tauri needs, Node, and the WebView2
# runtime MDX runs against at dev time.

$ErrorActionPreference = "Stop"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget not found. Install 'App Installer' from the Microsoft Store, then re-run this script."
    exit 1
}

function Install-Winget {
    param([string]$Id, [string[]]$ExtraArgs = @())
    winget install --id $Id --silent --accept-package-agreements --accept-source-agreements @ExtraArgs
}

Write-Host "==> Visual Studio Build Tools (C++ workload)"
Install-Winget "Microsoft.VisualStudio.2022.BuildTools" @(
    "--override", "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
)

Write-Host "==> Node.js"
Install-Winget "OpenJS.NodeJS.LTS"

Write-Host "==> WebView2 Runtime"
Install-Winget "Microsoft.EdgeWebView2Runtime"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "==> Rust toolchain"
    Install-Winget "Rustlang.Rustup"
    Write-Host "Open a new terminal so PATH picks up cargo, then re-run this script."
} else {
    rustup target add x86_64-pc-windows-msvc 2>$null
    rustup default stable-x86_64-pc-windows-msvc
}

Write-Host ""
Write-Host "Done. Open a new terminal, then build with:  npm install ; npm run app:build"
