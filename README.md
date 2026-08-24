# MDX

A fast Markdown **viewer** for Linux. Not an editor — it opens a file, renders
it well, and stays out of the way.

Built with [Tauri](https://tauri.app), so it uses the WebKitGTK already
installed on the system instead of shipping its own browser. The binary is a
few megabytes rather than the ~150 MB an Electron build would cost.

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

Files reload automatically when they change on disk, so editing in another
window updates the view without touching MDX.

## Layout

```
src/
  markdown/      parser, plugins, sanitiser, lazy library loading
  app/           viewer, sidebar, find, menu, settings, IPC bridge
  styles/        themes and rendered-document styling
src-tauri/
  src/           file reading, link resolution, filesystem watching
scripts/         dependency and install helpers
packaging/       desktop entries (one for ~/.local, one .hbs template
                 the .deb bundler fills in) and the systemd user service
samples/         the feature showcase document
```

The Rust side stays deliberately small: read a file, resolve a link, watch for
changes, own the window. Everything about rendering lives in the web layer.

## Licence

MIT
