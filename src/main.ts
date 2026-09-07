import showcase from "../samples/kitchen-sink.md?raw";

import "./styles/base.css";
import "./styles/themes.css";
import "./styles/chrome.css";
import "./styles/markdown.css";

import {
  baseName,
  exportPdfFile,
  IN_TAURI,
  listSiblings,
  onDocumentEvent,
  onFilesDropped,
  openExternal,
  pickFile,
  revealInFileManager,
  saveTextFile,
  signalReady,
  startupDocument,
  toggleFullscreen,
} from "./app/bridge.js";
import { AboutPanel } from "./app/about.js";
import { exportStandaloneHtml } from "./app/export.js";
import { FindBar } from "./app/find.js";
import { HELP_DOCUMENT } from "./app/help.js";
import { Menu, type MenuItem } from "./app/menu.js";
import {
  DEFAULT_SETTINGS,
  forgetRecent,
  loadOpenTabs,
  loadRecents,
  loadSettings,
  saveOpenTabs,
  saveSettings,
  THEMES,
  WIDTHS,
  type Settings,
  type Theme,
  type Width,
} from "./app/settings.js";
import { TabBar, type Tab } from "./app/tabs.js";
import { applyTheme, watchSystemTheme } from "./app/theme.js";
import { TableOfContents } from "./app/toc.js";
import { Viewer } from "./app/viewer.js";

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const el = {
  root: need("app"),
  content: need("content"),
  welcome: need("welcome"),
  title: need("doc-title"),
  stats: need("doc-stats"),
  progress: need("progress"),
  lightbox: need("lightbox"),
  lightboxImg: need<HTMLImageElement>("lightbox-img"),
  sidebar: need("sidebar"),
  toc: need<HTMLOListElement>("toc"),
  tocFilter: need<HTMLInputElement>("toc-filter"),
  recents: need<HTMLUListElement>("recents"),
  toast: need("toast"),
  menu: need("menu"),
  tabs: need("tabs"),
};

let settings: Settings = loadSettings();
applyTheme(settings);
el.root.dataset.sidebar = settings.sidebarOpen ? "open" : "closed";

const viewer = new Viewer(
  {
    root: el.root,
    content: el.content,
    welcome: el.welcome,
    title: el.title,
    stats: el.stats,
    progress: el.progress,
    lightbox: el.lightbox,
    lightboxImg: el.lightboxImg,
  },
  settings,
);

const toc = new TableOfContents(el.toc, el.tocFilter);
const find = new FindBar(
  need("find-bar"),
  need<HTMLInputElement>("find-input"),
  need("find-count"),
  el.content,
  { next: need("find-next"), prev: need("find-prev"), close: need("find-close") },
);
const about = new AboutPanel(
  need("about"),
  need("about-version"),
  need<HTMLButtonElement>("about-check"),
  need("about-status"),
  need("about-close"),
  { repo: need("about-repo"), issues: need("about-issues"), license: need("about-license") },
);

/* ------------------------------------------------------------------ toast */

let toastTimer: number | null = null;
function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), 3200);
}
window.addEventListener("mdx:toast", (event) => toast(String((event as CustomEvent).detail)));

/* ------------------------------------------------------------------- tabs */

const tabs = new TabBar(el.tabs);

/** True while a back/forward step is in flight, so it is not itself recorded. */
let navigating = false;

tabs.onActivate = (tab) => void loadTab(tab);
tabs.onChange = () => saveOpenTabs(tabs.toStored());
tabs.onEmpty = () => viewer.clear();

/** Points the viewer at a tab. A file that will not open takes its tab with it. */
async function loadTab(tab: Tab): Promise<void> {
  find.reset();
  if (tab.kind === "inline") {
    viewer.showInline(tab.source ?? "", tab.name);
    return;
  }
  try {
    await viewer.open(tab.path);
    renderRecents();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    tabs.close(tab.id);
  }
}

/**
 * Opens `path`, by default in a tab of its own. Following a link inside a
 * document passes `newTab: false` so the reader stays where they are; either
 * way a file that is already open is brought forward rather than duplicated.
 */
async function openPath(path: string, options: { newTab?: boolean } = {}): Promise<void> {
  const existing = tabs.findByPath(path);
  if (existing) {
    if (tabs.active?.id === existing.id) return;
    tabs.setActive(existing.id);
    await loadTab(existing);
    return;
  }

  const active = tabs.active;
  if (options.newTab === false && active?.kind === "file") {
    tabs.navigated(active, path, baseName(path));
    await loadTab(active);
    return;
  }

  await loadTab(tabs.add({ kind: "file", path, name: baseName(path) }));
}

/** A multi-file drop: every file gets a tab, only the first one is rendered. */
async function openPaths(paths: string[]): Promise<void> {
  let first: Tab | null = null;
  for (const path of paths) {
    const tab =
      tabs.findByPath(path) ?? tabs.add({ kind: "file", path, name: baseName(path) }, false);
    first ??= tab;
  }
  if (!first) return;
  tabs.setActive(first.id);
  await loadTab(first);
}

/** The built-in pages (help, showcase) get a tab too, backed by memory. */
function openInline(source: string, name: string): void {
  const existing = tabs.all.find((tab) => tab.kind === "inline" && tab.name === name);
  const tab = existing ?? tabs.add({ kind: "inline", path: "", name, source });
  if (existing) tabs.setActive(existing.id);
  void loadTab(tab);
}

/* --------------------------------------------------------------- history */

/** Back and forward are per tab, like the documents themselves. */
async function goHistory(direction: number): Promise<void> {
  const tab = tabs.active;
  if (!tab || tab.kind !== "file") return;
  const next = tab.historyIndex + direction;
  if (next < 0 || next >= tab.history.length) return;

  navigating = true;
  try {
    find.reset();
    await viewer.open(tab.history[next]);
    tab.historyIndex = next;
    renderRecents();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    navigating = false;
  }
}

async function goSibling(direction: number): Promise<void> {
  const current = viewer.document?.payload.path;
  if (!current) return;
  const siblings = await listSiblings(current);
  const index = siblings.indexOf(current);
  if (index < 0) return;
  const target = siblings[index + direction];
  if (!target) {
    toast(direction > 0 ? "Last file in this folder" : "First file in this folder");
    return;
  }
  await openPath(target, { newTab: false });
}

/* ------------------------------------------------------------- settings UI */

function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  applyTheme(settings);
  viewer.updateSettings(settings);
  el.root.dataset.sidebar = settings.sidebarOpen ? "open" : "closed";
  if ("theme" in patch) void viewer.onThemeChanged();
}

watchSystemTheme(() => {
  if (settings.theme === "auto") {
    applyTheme(settings);
    void viewer.onThemeChanged();
  }
});

function cycleTheme(): void {
  const next = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
  updateSettings({ theme: next });
  toast(`Theme: ${next}`);
}

function scaleFont(delta: number): void {
  const next = Math.min(2.2, Math.max(0.7, Number((settings.fontScale + delta).toFixed(2))));
  updateSettings({ fontScale: next });
  toast(`Text size ${Math.round(next * 100)}%`);
}

/* ------------------------------------------------------------------ export */

async function exportHtml(): Promise<void> {
  const doc = viewer.document;
  const name = doc?.payload.name.replace(/\.[^.]+$/, "") ?? "document";
  try {
    const html = await exportStandaloneHtml(el.content, name);
    const saved = await saveTextFile(`${name}.html`, html, "html");
    if (saved) toast(`Exported to ${saved}`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function exportPdf(): Promise<void> {
  const doc = viewer.document;
  const name = doc?.payload.name.replace(/\.[^.]+$/, "") ?? "document";
  try {
    const html = await exportStandaloneHtml(el.content, name);
    const saved = await exportPdfFile(`${name}.pdf`, html);
    if (saved) toast(`Exported to ${saved}`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

/* -------------------------------------------------------------------- menu */

const menu = new Menu(el.menu, need("btn-menu"), (): MenuItem[] => {
  const doc = viewer.document;
  return [
    { kind: "separator", label: "Document" },
    { kind: "action", label: "Open in a new tab…", hint: "Ctrl T", run: () => void chooseFile() },
    { kind: "action", label: "Reload", hint: "Ctrl R", disabled: !doc, run: () => void viewer.reload() },
    {
      kind: "action",
      label: "Show in file manager",
      disabled: !doc,
      run: () => void revealInFileManager(doc!.payload.dir),
    },
    { kind: "action", label: "Export as HTML…", hint: "Ctrl ⇧ E", run: () => void exportHtml() },
    {
      kind: "action",
      label: "Export as PDF…",
      run: () => void exportPdf(),
    },
    { kind: "action", label: "Print…", hint: "Ctrl P", run: () => window.print() },

    { kind: "separator", label: "Tabs" },
    {
      kind: "action",
      label: "Close tab",
      hint: "Ctrl W",
      disabled: !tabs.count,
      run: () => tabs.closeActive(),
    },
    {
      kind: "action",
      label: "Close other tabs",
      disabled: tabs.count < 2,
      run: () => {
        const active = tabs.active;
        if (active) tabs.closeOthers(active.id);
      },
    },

    { kind: "separator", label: "Appearance" },
    {
      kind: "choice",
      label: "Theme",
      value: settings.theme,
      options: THEMES.map((t) => ({ value: t, label: t.replace("-", " ") })),
      run: (value) => updateSettings({ theme: value as Theme }),
    },
    {
      kind: "choice",
      label: "Width",
      value: settings.width,
      options: WIDTHS.map((w) => ({ value: w, label: w })),
      run: (value) => updateSettings({ width: value as Width }),
    },
    {
      kind: "choice",
      label: "Typeface",
      value: settings.typeface,
      options: [
        { value: "sans", label: "Sans" },
        { value: "serif", label: "Serif" },
        { value: "mono", label: "Mono" },
      ],
      run: (value) => updateSettings({ typeface: value as Settings["typeface"] }),
    },
    {
      kind: "toggle",
      label: "Justify text",
      checked: settings.justify,
      run: () => updateSettings({ justify: !settings.justify }),
    },
    {
      kind: "toggle",
      label: "Show front matter",
      checked: settings.showFrontMatter,
      run: () => updateSettings({ showFrontMatter: !settings.showFrontMatter }),
    },
    {
      kind: "toggle",
      label: "Load remote images",
      checked: settings.allowRemoteImages,
      run: () => updateSettings({ allowRemoteImages: !settings.allowRemoteImages }),
    },
    {
      kind: "action",
      label: "Reset appearance",
      run: () =>
        updateSettings({
          theme: DEFAULT_SETTINGS.theme,
          width: DEFAULT_SETTINGS.width,
          typeface: DEFAULT_SETTINGS.typeface,
          fontScale: DEFAULT_SETTINGS.fontScale,
          justify: DEFAULT_SETTINGS.justify,
        }),
    },

    { kind: "separator", label: "Help" },
    { kind: "action", label: "Feature showcase", run: () => openInline(showcase, "Feature showcase") },
    { kind: "action", label: "Keyboard shortcuts", hint: "?", run: () => openInline(HELP_DOCUMENT, "Keyboard shortcuts") },
    {
      kind: "action",
      label: "Project page",
      run: () => void openExternal("https://github.com/Ravilesx/MDX"),
    },
    { kind: "action", label: "About MDX…", run: () => about.open() },
  ];
});

/* ------------------------------------------------------------------ recents */

function renderRecents(): void {
  const recents = loadRecents();
  el.recents.replaceChildren();
  if (!recents.length) return;

  const heading = document.createElement("li");
  heading.className = "recents-head";
  heading.textContent = "Recent";
  el.recents.appendChild(heading);

  for (const recent of recents) {
    const item = document.createElement("li");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "recent";
    open.title = recent.path;
    open.addEventListener("click", () => void openPath(recent.path));

    const name = document.createElement("span");
    name.className = "recent-name";
    name.textContent = recent.name;
    const dir = document.createElement("span");
    dir.className = "recent-dir";
    dir.textContent = recent.path.replace(/\/[^/]+$/, "");
    open.append(name, dir);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "recent-forget";
    remove.title = "Remove from list";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      forgetRecent(recent.path);
      renderRecents();
    });

    item.append(open, remove);
    el.recents.appendChild(item);
  }
}

/* ---------------------------------------------------------------- shortcuts */

document.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  const typing =
    event.target instanceof HTMLElement &&
    (event.target.tagName === "INPUT" || event.target.tagName === "SELECT");

  if (mod && (event.key.toLowerCase() === "o" || event.key.toLowerCase() === "t")) {
    event.preventDefault();
    void chooseFile();
  } else if (mod && event.key.toLowerCase() === "w") {
    event.preventDefault();
    tabs.closeActive();
  } else if (mod && event.key === "Tab") {
    event.preventDefault();
    tabs.cycle(event.shiftKey ? -1 : 1);
  } else if (mod && (event.key === "PageDown" || event.key === "PageUp")) {
    event.preventDefault();
    tabs.cycle(event.key === "PageDown" ? 1 : -1);
  } else if (mod && event.key >= "1" && event.key <= "9") {
    event.preventDefault();
    // Ctrl+9 is the last tab, whichever number that is — as in a browser.
    tabs.selectIndex(event.key === "9" ? tabs.count - 1 : Number(event.key) - 1);
  } else if (mod && event.key.toLowerCase() === "r") {
    event.preventDefault();
    void viewer.reload();
  } else if (event.key === "F5") {
    event.preventDefault();
    void viewer.reload();
  } else if (mod && event.key.toLowerCase() === "f") {
    event.preventDefault();
    find.open(window.getSelection()?.toString().trim() || undefined);
  } else if (mod && event.shiftKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    void exportHtml();
  } else if (mod && event.shiftKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    cycleTheme();
  } else if (mod && event.key === "\\") {
    event.preventDefault();
    updateSettings({ sidebarOpen: !settings.sidebarOpen });
  } else if (mod && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!settings.sidebarOpen) updateSettings({ sidebarOpen: true });
    toc.focusFilter();
  } else if (mod && (event.key === "=" || event.key === "+")) {
    event.preventDefault();
    scaleFont(0.1);
  } else if (mod && event.key === "-") {
    event.preventDefault();
    scaleFont(-0.1);
  } else if (mod && event.key === "0") {
    event.preventDefault();
    updateSettings({ fontScale: 1 });
  } else if (event.altKey && event.key === "ArrowLeft") {
    event.preventDefault();
    void goHistory(-1);
  } else if (event.altKey && event.key === "ArrowRight") {
    event.preventDefault();
    void goHistory(1);
  } else if (event.altKey && event.key === "ArrowDown") {
    event.preventDefault();
    void goSibling(1);
  } else if (event.altKey && event.key === "ArrowUp") {
    event.preventDefault();
    void goSibling(-1);
  } else if (event.key === "F11") {
    event.preventDefault();
    void toggleFullscreen();
  } else if (event.key === "Escape") {
    if (!el.lightbox.hidden) {
      el.lightbox.hidden = true;
    } else if (find.isOpen) {
      find.close();
    }
  } else if (event.key === "?" && !typing) {
    event.preventDefault();
    openInline(HELP_DOCUMENT, "Keyboard shortcuts");
  }
});

/* --------------------------------------------------------------- toolbar */

async function chooseFile(): Promise<void> {
  const picked = await pickFile();
  if (picked) await openPath(picked);
  else if (!IN_TAURI) toast("Opening files needs the desktop app");
}

need("btn-open").addEventListener("click", () => void chooseFile());
need("btn-find").addEventListener("click", () => find.open());
need("btn-theme").addEventListener("click", cycleTheme);
need("btn-print").addEventListener("click", () => window.print());
need("btn-sidebar").addEventListener("click", () =>
  updateSettings({ sidebarOpen: !settings.sidebarOpen }),
);

toc.onSelect = (slug) => viewer.scrollToSlug(slug);
viewer.onActiveHeading = (slug) => toc.setActive(slug);
viewer.onCleared = () => toc.set([]);

// Links followed inside a document are opened by the viewer itself, so the
// active tab learns where it ended up from here rather than from openPath.
viewer.onDocument = (doc) => {
  toc.set(doc.render.headings);
  const tab = tabs.active;
  if (!tab || tab.kind !== "file" || !doc.payload.path) return;
  if (tab.path === doc.payload.path) return;
  tabs.navigated(tab, doc.payload.path, doc.payload.name, !navigating);
};

/* ------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  renderRecents();
  menu.hide();

  await Promise.all([
    onDocumentEvent("document:open", (path) => void openPath(path)),
    onDocumentEvent("document:changed", () => {
      void viewer.reload();
      toast("Reloaded — file changed on disk");
    }),
    onDocumentEvent("document:removed", () => toast("The file was deleted or moved")),
    onFilesDropped((paths) => {
      document.body.classList.remove("dragging");
      if (paths.length) void openPaths(paths);
    }),
  ]);

  tabs.restore(loadOpenTabs());

  // The window is still hidden at this point, so `signalReady` has to run
  // whatever the documents do — a file that has gone missing since the last
  // session must not leave the app with no window at all.
  try {
    const initial = await startupDocument();
    if (initial) await openPath(initial);
    else if (tabs.active) await loadTab(tabs.active);
  } finally {
    await signalReady();
  }
}

void boot();
