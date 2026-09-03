<div align="center">

<img src="assets/logo.png" width="120" alt="MDX logo" />

# MDX

**A fast Markdown viewer for Linux and Windows.**

Not an editor — it opens a file, renders it well, and stays out of the way.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-informational)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)

**English** · [**Español**](#español)

</div>

---

Built with [Tauri](https://tauri.app), so it uses the OS's own web engine —
WebKitGTK on Linux, WebView2 (Edge) on Windows — instead of shipping its own
browser. The binary is a few megabytes rather than the ~150 MB an Electron
build would cost.

## Download

Grab the latest build from **[Releases](https://github.com/RavilesX/MDX/releases/latest)**:

| Platform | File |
| --- | --- |
| Windows | `MDX_x64-setup.exe` — installer, or run `.\scripts\install-windows.ps1` to build and install from source |
| Linux (Debian / Ubuntu / Mint) | `MDX_amd64.deb` |
| Linux (any distro) | `MDX_amd64.AppImage` — no install needed, just `chmod +x` and run |

No binaries for your platform yet, or want the latest from `main`? See
[Building](#building) below.

## Features

- **Wide Markdown dialect support** — CommonMark, GitHub-flavoured extensions,
  footnotes, math, diagrams, and more. See the full table below.
- **Fast by design** — one warm resident process, heavy libraries loaded on
  demand, progressive rendering. See [Why it feels fast](#why-it-feels-fast).
- **Export as standalone HTML** with all styling and rendered content inlined.
- **Export as PDF** via a system Chromium/Chrome in headless mode, with real
  clickable hyperlinks and local images embedded — the exported file stays
  correct even after being moved.
- **Print** through the native dialog.
- **Sanitised by default** — DOMPurify plus a strict webview CSP; remote
  images are opt-in.
- **File-watching auto-reload**, table of contents, find-in-document, four
  widths, five themes (auto, light, dark, sepia, high contrast), and
  adjustable text size.
- **`.deb` and AppImage** packages on Linux, an **NSIS installer** on Windows,
  plus a way to keep a warm instance from login on both.
- **About panel** with an on-demand update check against this repo's GitHub
  releases — nothing runs on its own, only when asked.

## What it renders

| Area | Supported |
| --- | --- |
| Core | CommonMark, GitHub-flavoured tables, strikethrough, autolinks, task lists |
| Structure | Footnotes, definition lists, abbreviations, front matter (YAML shown as a panel, TOML/JSON shown verbatim) |
| Inline | `==mark==`, `++ins++`, `~sub~`, `^sup^`, emoji shortcodes, typographic quotes and dashes |
| Callouts | GitHub `> [!NOTE]` alerts and `::: warning` containers (MkDocs / Docusaurus / VitePress spelling), collapsible variants |
| Tables | Multi-line cells, row and column spans, headerless tables |
| Code | Syntax highlighting with line numbers, line ranges (`{1,4-6}`), titles, copy button |
| Math | KaTeX — `$inline$`, `$$display$$`, `\(…\)`, `\[…\]` (a bare `$20` stays a price) |
| Diagrams | Mermaid — flowcharts, sequence, gantt, class, state, ER, and the rest |
| Links | Relative links between documents, `[[wiki links]]` and `![[embeds]]`, anchors, external links opened in the system browser |
| Attributes | `{.class #id}` on headings, paragraphs and images |

`samples/kitchen-sink.md` exercises all of it; the app also has it built in
under **⋮ → Feature showcase**.

## Why it feels fast

Four decisions carry most of the weight:

**One resident process.** A single-instance lock means the second
`mdx file.md` hands the path to the window that is already open. The webview
startup cost is paid once. `packaging/mdx.service` moves even that first cost
to login time by keeping a hidden instance running.

**Heavy libraries load on demand.** Mermaid is roughly 3 MB and KaTeX is not
much lighter. Neither is in the startup bundle. The renderer emits inert
placeholders carrying the diagram or TeX source, and only if a document
actually contains them does the library get fetched — Mermaid even splits per
diagram type, so a flowchart never downloads the Gantt renderer. Syntax
highlighting has two tiers: a small bundle covering the usual languages, and
the full one fetched only for something outside it.

**Progressive rendering.** Text and headings paint first. Diagrams, formulae
and highlighting are upgraded afterwards, nearest-to-viewport first, so a long
document is readable before it is finished.

**Sanitised HTML.** Markdown from elsewhere can carry `<script>` or
`<img onerror=…>`. Everything passes through DOMPurify before it reaches the
DOM, and the webview CSP blocks script execution as a second layer. A viewer
should never run code that arrives in a document. Remote images (badges, CDN
assets) load over https by default — a toggle in the menu turns that off to
stop a document from making third-party requests just by being opened.

## Exporting

| Format | How | Notes |
| --- | --- | --- |
| Standalone HTML | Menu → Export as HTML… (`Ctrl Shift E`) | Styling and rendered content (Mermaid SVG, KaTeX markup) inlined; local media embedded as `data:` URIs |
| PDF | Menu → Export as PDF… | Rendered by a system Chromium/Chrome in headless mode — links stay clickable and local images stay embedded, unlike printing through the native dialog |
| PDF (native) | Menu → Print… (`Ctrl P`) | Goes through the OS print dialog; pick "Print to file" / "Save as PDF". Simpler, but WebKitGTK's own print pipeline drops hyperlinks |

The headless-Chromium path needs Chromium, Google Chrome, Brave, or Edge —
on Linux, found on `PATH`; on Windows, found in its usual install location or
the registry (Edge ships with Windows, so this normally just works). Without
one, use Print… instead.

## Building

### Linux

```bash
./scripts/install-deps.sh   # WebKitGTK headers, build tools, Rust toolchain
npm install
npm run app:dev             # development, with hot reload
npm run app:build           # release binary + .deb + AppImage
```

Or build and install for the current user in one step:

```bash
./scripts/install-linux.sh
```

That puts `mdx` in `~/.local/bin`, registers the desktop entry and icon, and
makes MDX the default handler for `text/markdown`.

#### Keeping a warm instance

```bash
mkdir -p ~/.config/systemd/user
cp packaging/mdx.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mdx.service
```

`mdx --hidden` starts the process with no window. The first real `mdx file.md`
then draws into a window that already exists.

### Windows

Needs the MSVC Rust toolchain (not GNU — it cannot link against WebView2),
the Visual Studio Build Tools' C++ workload, Node, and the
[WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
(preinstalled on an updated Windows 10/11).

```powershell
.\scripts\install-deps.ps1   # Build Tools, Node, WebView2 runtime, Rust (via winget)
npm install
npm run app:dev              # development, with hot reload
npm run app:build            # release binary + NSIS installer
```

Or build and install for the current user in one step:

```powershell
.\scripts\install-windows.ps1
```

That puts `mdx.exe` in `%LOCALAPPDATA%\Programs\MDX`, adds it to your user
`PATH`, and makes MDX the default handler for `.md` and friends — all under
`HKEY_CURRENT_USER`, no admin needed. Running the NSIS installer built by
`app:build` instead does the same thing through a conventional installer/
uninstaller pair.

#### Keeping a warm instance

`install-windows.ps1` prints a ready-to-paste snippet that drops a shortcut
into the Startup folder with `mdx.exe --hidden` as its target — the same
warm-process trick the systemd service does on Linux.

### CI

[`.github/workflows/build.yml`](.github/workflows/build.yml) runs on every
push and PR: type-check, frontend tests, Rust tests and lints, then a full
`app:build` on both Linux and Windows, so a platform-specific regression
shows up there rather than after a release.

### Releasing

[`.github/workflows/release.yml`](.github/workflows/release.yml) builds both
platforms and publishes them as one **draft** GitHub Release — reviewed and
published by hand, nothing goes live on its own. To cut one:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json` — all three, the workflow checks they agree
   with the tag and fails otherwise.
2. Commit that on `main`.
3. Tag it and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow builds the `.deb`, the AppImage and the NSIS installer, runs the
same checks as CI first, and attaches everything to the draft release.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl` `O` | Open |
| `Ctrl` `R` / `F5` | Reload |
| `Ctrl` `F` | Find in document |
| `Ctrl` `\` | Toggle contents sidebar |
| `Ctrl` `K` | Filter the sidebar |
| `Alt` `←` / `→` | Back / forward |
| `Alt` `↑` / `↓` | Previous / next file in the folder |
| `Ctrl` `Shift` `T` | Cycle theme (auto, light, dark, sepia, high contrast) |
| `Ctrl` `+` / `-` / `0` | Text size |
| `Ctrl` `Shift` `E` | Export standalone HTML |
| `Ctrl` `P` | Print |
| `F11` | Fullscreen |
| `?` | Shortcut reference |

Export as PDF and the remote-images toggle live in the **⋮** menu only, with
no default binding.

Files reload automatically when they change on disk, so editing in another
window updates the view without touching MDX.

## Layout

```
src/
  markdown/      parser, plugins, sanitiser, lazy library loading
  app/           viewer, sidebar, find, menu, settings, IPC bridge, path helpers
  styles/        themes and rendered-document styling
src-tauri/
  src/           file reading, link resolution, filesystem watching, PDF export
  tauri.conf.json           shared config
  tauri.linux.conf.json     .deb / AppImage bundle targets
  tauri.windows.conf.json   NSIS bundle target, WebView2 install mode
scripts/         dependency and install helpers, .sh for Linux / .ps1 for Windows
packaging/       desktop entries (one for ~/.local, one .hbs template
                 the .deb bundler fills in) and the systemd user service
.github/workflows/  CI: tests and bundle builds on Linux and Windows
samples/         the feature showcase document
```

The Rust side stays deliberately small: read a file, resolve a link, watch for
changes, own the window, shell out to a headless browser for PDF export.
Everything about rendering lives in the web layer.

## Español

**Un visor de Markdown rápido para Linux y Windows.**

No es un editor — abre un archivo, lo renderiza bien, y no estorba. Construido
con [Tauri](https://tauri.app), así que usa el motor web propio del sistema
(WebKitGTK en Linux, WebView2/Edge en Windows) en vez de cargar un navegador
propio: el binario pesa unos pocos megabytes en lugar de los ~150 MB de una
app hecha con Electron.

### Características

- **Amplio soporte de Markdown** — CommonMark, extensiones estilo GitHub,
  notas al pie, matemáticas (KaTeX), diagramas (Mermaid), resaltado de
  sintaxis. Ver la [tabla completa](#what-it-renders) más arriba.
- **Rápido por diseño** — un único proceso residente, librerías pesadas
  cargadas bajo demanda, renderizado progresivo.
- **Exportar a HTML autónomo** con todo el estilo y contenido incrustado, o a
  **PDF** (con hipervínculos funcionales) vía un Chromium del sistema en modo
  headless, o **imprimir** con el diálogo nativo.
- **Saneado por defecto** — DOMPurify más una CSP estricta en el webview; las
  imágenes remotas son opt-in.
- **Recarga automática** al detectar cambios en disco, tabla de contenidos,
  buscar en el documento, cuatro anchos, cinco temas (automático, claro,
  oscuro, sepia, alto contraste).

### Descargar e instalar

La forma más simple: descarga el instalador desde
**[Releases](https://github.com/RavilesX/MDX/releases/latest)** — `.exe` para
Windows, `.deb` o `.AppImage` para Linux.

Para compilar e instalar desde el código fuente:

```bash
# Linux
./scripts/install-linux.sh
```

```powershell
# Windows (PowerShell)
.\scripts\install-windows.ps1
```

Ambos scripts instalan para el usuario actual (sin necesitar permisos de
administrador ni root), añaden `mdx` al `PATH`, y hacen de MDX el visor por
defecto para archivos `.md`. Detalles de dependencias, compilación paso a
paso, atajos de teclado y arquitectura interna están en el resto de este
README (en inglés) — el código y los comentarios también están en inglés,
pero el proyecto agradece reportes de errores o preguntas en español.

### Contacto

- **Autor**: Ricardo Avilés Sanders (RavilesX)
- **Correo**: ravilesx@gmail.com
- **GitHub**: [github.com/RavilesX](https://github.com/RavilesX)

Reporta errores o sugerencias en [Issues](https://github.com/RavilesX/MDX/issues)
— en español o en inglés, como prefieras.

## Contact

- **Author**: Ricardo Aviles Sanders (RavilesX)
- **Email**: ravilesx@gmail.com
- **GitHub**: [github.com/RavilesX](https://github.com/RavilesX)

Bug reports and suggestions: [Issues](https://github.com/RavilesX/MDX/issues).

## Licence

[MIT](LICENSE) © 2026 Ricardo Aviles Sanders
