<div align="center">

<img src="assets/logo.png" width="120" alt="MDX logo" />

# MDX

**A fast Markdown viewer for Linux.**

Not an editor — it opens a file, renders it well, and stays out of the way.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Linux-informational)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)

</div>

---

Built with [Tauri](https://tauri.app), so it uses the WebKitGTK already
installed on the system instead of shipping its own browser. The binary is a
few megabytes rather than the ~150 MB an Electron build would cost.

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
- **`.deb` and AppImage** packages, plus a systemd user service to keep a
  warm instance from login.

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

The headless-Chromium path needs Chromium, Google Chrome, Brave, or Edge on
`PATH`. Without one, use Print… instead.

## Building

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

### Keeping a warm instance

```bash
mkdir -p ~/.config/systemd/user
cp packaging/mdx.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mdx.service
```

`mdx --hidden` starts the process with no window. The first real `mdx file.md`
then draws into a window that already exists.

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
  app/           viewer, sidebar, find, menu, settings, IPC bridge
  styles/        themes and rendered-document styling
src-tauri/
  src/           file reading, link resolution, filesystem watching, PDF export
scripts/         dependency and install helpers
packaging/       desktop entries (one for ~/.local, one .hbs template
                 the .deb bundler fills in) and the systemd user service
samples/         the feature showcase document
```

The Rust side stays deliberately small: read a file, resolve a link, watch for
changes, own the window, shell out to a headless browser for PDF export.
Everything about rendering lives in the web layer.

## Contact

- **Author**: Ricardo Aviles Sanders (RavilesX)
- **Email**: ravilesx@gmail.com
- **GitHub**: [github.com/RavilesX](https://github.com/RavilesX)

Bug reports and suggestions: [Issues](https://github.com/RavilesX/MDX/issues).

## Licence

[MIT](LICENSE) © 2026 Ricardo Aviles Sanders
