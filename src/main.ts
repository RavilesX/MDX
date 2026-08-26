import showcase from "../samples/kitchen-sink.md?raw";

import "./styles/base.css";
import "./styles/themes.css";
import "./styles/chrome.css";
import "./styles/markdown.css";

import {
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
import { exportStandaloneHtml } from "./app/export.js";
import { FindBar } from "./app/find.js";
import { HELP_DOCUMENT } from "./app/help.js";
import { Menu, type MenuItem } from "./app/menu.js";
import {
  DEFAULT_SETTINGS,
  forgetRecent,
  loadRecents,
  loadSettings,
  saveSettings,
  THEMES,
  WIDTHS,
  type Settings,
  type Theme,
  type Width,
} from "./app/settings.js";
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

/* ------------------------------------------------------------------ toast */

let toastTimer: number | null = null;
function toast(message: string): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), 3200);
}
window.addEventListener("mdx:toast", (event) => toast(String((event as CustomEvent).detail)));

/* ---------------------------------------------------------------- history */

const history: string[] = [];
let historyIndex = -1;

async function openPath(path: string, options: { pushHistory?: boolean } = {}): Promise<void> {
  try {
    find.reset();
    await viewer.open(path);
    if (options.pushHistory !== false) {
      history.splice(historyIndex + 1);
      history.push(path);
      historyIndex = history.length - 1;
    }
    renderRecents();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function goHistory(direction: number): Promise<void> {
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  await openPath(history[next], { pushHistory: false });
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
  await openPath(target);
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
    { kind: "action", label: "Feature showcase", run: () => viewer.showInline(showcase, "Feature showcase") },
    { kind: "action", label: "Keyboard shortcuts", hint: "?", run: () => viewer.showInline(HELP_DOCUMENT, "Keyboard shortcuts") },
    {
      kind: "action",
      label: "Project page",
      run: () => void openExternal("https://github.com/Ravilesx/MDX"),
    },
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

  if (mod && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void chooseFile();
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
    viewer.showInline(HELP_DOCUMENT, "Keyboard shortcuts");
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
viewer.onDocument = (doc) => toc.set(doc.render.headings);
viewer.onActiveHeading = (slug) => toc.setActive(slug);

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
      if (paths.length) void openPath(paths[0]);
    }),
  ]);

  const initial = await startupDocument();
  if (initial) await openPath(initial);

  await signalReady();
}

void boot();
