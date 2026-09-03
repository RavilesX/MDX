#!/usr/bin/env pwsh
# Build MDX and install it for the current user.
#
# Installs to %LOCALAPPDATA%\Programs\MDX so no admin is needed, adds it to
# the user PATH, and registers Markdown as the default file association —
# all under HKEY_CURRENT_USER, mirroring what install-linux.sh does with
# ~/.local and xdg-mime. Set $env:MDX_PREFIX to install somewhere else.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$Prefix = if ($env:MDX_PREFIX) { $env:MDX_PREFIX } else { "$env:LOCALAPPDATA\Programs\MDX" }

Write-Host "==> Building"
npm install
npm run app:build

$Binary = "src-tauri\target\release\mdx.exe"
if (-not (Test-Path $Binary)) {
    throw "Build produced no binary at $Binary"
}

Write-Host "==> Installing to $Prefix"
New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
Copy-Item $Binary "$Prefix\mdx.exe" -Force
Copy-Item "src-tauri\icons\icon.ico" "$Prefix\mdx.ico" -Force

# Add to the user's PATH if it is not already there.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$Prefix*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$Prefix", "User")
    Write-Host "Added $Prefix to your user PATH (open a new terminal to pick it up)."
}

Write-Host "==> Making MDX the default for Markdown"
$progId = "MDX.Markdown"
New-Item -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Force |
    Set-ItemProperty -Name "(Default)" -Value "`"$Prefix\mdx.exe`" `"%1`""
New-Item -Path "HKCU:\Software\Classes\$progId\DefaultIcon" -Force |
    Set-ItemProperty -Name "(Default)" -Value "$Prefix\mdx.ico"
foreach ($ext in ".md", ".markdown", ".mdown", ".mkd", ".mkdn", ".mdx", ".qmd", ".rmd") {
    New-Item -Path "HKCU:\Software\Classes\$ext" -Force | Set-ItemProperty -Name "(Default)" -Value $progId
}

$startupSnippet = @'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MDX.lnk")
$shortcut.TargetPath = "{0}\mdx.exe"
$shortcut.Arguments = "--hidden"
$shortcut.Save()
'@ -f $Prefix

Write-Host @"

Installed: $Prefix\mdx.exe

Open a new terminal, then:

    mdx README.md

Optional — keep a warm instance so files open instantly (paste into PowerShell):

$startupSnippet
"@
