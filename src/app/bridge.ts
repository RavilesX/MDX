import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

/**
 * Every call into the Rust side goes through here.
 *
 * The module also works when the page is served by plain `vite dev` with no
 * Tauri process behind it — the file operations become no-ops so the UI can
 * still be worked on in a normal browser.
 */

export interface DocumentPayload {
  path: string;
  name: string;
  dir: string;
  content: string;
  size: number;
  modified: number | null;
  lossy: boolean;
}

export const IN_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MARKDOWN_FILTER = {
  name: "Markdown",
  extensions: ["md", "markdown", "mdown", "mkd", "mkdn", "mdx", "qmd", "rmd", "txt", "text"],
};

export async function readDocument(path: string): Promise<DocumentPayload> {
  if (!IN_TAURI) throw new Error("File access needs the desktop app");
  return invoke<DocumentPayload>("read_document", { path });
}

export async function resolveLink(baseDir: string, target: string): Promise<string | null> {
  if (!IN_TAURI) return null;
  try {
    return await invoke<string | null>("resolve_link", { baseDir, target });
  } catch {
    return null;
  }
}

export async function listSiblings(path: string): Promise<string[]> {
  if (!IN_TAURI) return [];
  try {
    return await invoke<string[]>("list_siblings", { path });
  } catch {
    return [];
  }
}

export async function watchDocument(path: string): Promise<void> {
  if (!IN_TAURI) return;
  try {
    await invoke("watch_document", { path });
  } catch {
    // A file on a filesystem without inotify support simply will not
    // auto-reload; that is not worth interrupting the reader for.
  }
}

export async function startupDocument(): Promise<string | null> {
  if (!IN_TAURI) return null;
  try {
    return await invoke<string | null>("startup_document");
  } catch {
    return null;
  }
}

/** Tell Rust the first paint is done so the window can be shown. */
export async function signalReady(): Promise<void> {
  if (!IN_TAURI) return;
  try {
    await invoke("ready");
  } catch {
    /* window is already visible */
  }
}

export async function pickFile(): Promise<string | null> {
  if (!IN_TAURI) return null;
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [MARKDOWN_FILTER, { name: "All files", extensions: ["*"] }],
  });
  return typeof picked === "string" ? picked : null;
}

/** Local file → its bytes as a `data:` URI, for exports that must not depend on a path on disk. */
export async function readFileAsDataUrl(path: string): Promise<string> {
  if (!IN_TAURI) throw new Error("File access needs the desktop app");
  return invoke<string>("read_file_as_data_url", { path });
}

/**
 * Renders `html` to a PDF via a system Chromium/Chrome in headless mode and
 * writes it to a user-chosen path. Unlike `window.print()`, which goes
 * through WebKitGTK's own print pipeline, this keeps `<a href>` targets as
 * clickable link annotations in the output.
 */
export async function exportPdfFile(defaultName: string, html: string): Promise<string | null> {
  if (!IN_TAURI) return null;
  const target = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!target) return null;
  await invoke("export_pdf", { html, outPath: target });
  return target;
}

export async function saveTextFile(
  defaultName: string,
  contents: string,
  extension: string,
): Promise<string | null> {
  if (!IN_TAURI) return null;
  const target = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!target) return null;
  await writeTextFile(target, contents);
  return target;
}

/** Local file → a URL the webview is allowed to load. */
export function assetUrl(path: string): string {
  return IN_TAURI ? convertFileSrc(path) : path;
}

export async function openExternal(url: string): Promise<void> {
  if (!IN_TAURI) {
    window.open(url, "_blank", "noopener");
    return;
  }
  await openUrl(url);
}

export async function revealInFileManager(path: string): Promise<void> {
  if (!IN_TAURI) return;
  await openPath(path);
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!IN_TAURI) {
    document.title = title;
    return;
  }
  await getCurrentWindow().setTitle(title);
}

export async function toggleFullscreen(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const win = getCurrentWindow();
  const next = !(await win.isFullscreen());
  await win.setFullscreen(next);
  return next;
}

export async function onDocumentEvent(
  event: "document:open" | "document:changed" | "document:removed",
  handler: (path: string) => void,
): Promise<UnlistenFn> {
  if (!IN_TAURI) return () => {};
  return listen<{ path: string }>(event, ({ payload }) => handler(payload.path));
}

/** Files dropped onto the window; the webview reports OS paths, not File objects. */
export async function onFilesDropped(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  if (!IN_TAURI) return () => {};
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") handler(event.payload.paths);
    document.body.classList.toggle("dragging", event.payload.type === "over");
  });
}

const REPO = "RavilesX/MDX";

/** The running app's own version, e.g. `"1.0.0"`. `"0.0.0"` outside Tauri. */
export async function getAppVersion(): Promise<string> {
  if (!IN_TAURI) return "0.0.0";
  return getVersion();
}

export interface UpdateCheck {
  current: string;
  latest: string;
  /** True when `latest` is a newer version than `current`. */
  hasUpdate: boolean;
  /** The GitHub release page to send the reader to. */
  url: string;
}

/** `MAJOR.MINOR.PATCH` comparison — good enough for this project's tags, no need for a semver dependency. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Compares the running version against the project's latest GitHub release.
 * Goes through `@tauri-apps/plugin-http` rather than the page's own `fetch`,
 * so it is governed by the plugin's own allow-list (see
 * `capabilities/default.json`) instead of needing the strict CSP relaxed —
 * that scope covers exactly this one endpoint, nothing else.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = await getAppVersion();
  if (!IN_TAURI) throw new Error("Checking for updates needs the desktop app");

  const response = await tauriFetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404 ? "No release has been published yet" : `GitHub returned ${response.status}`,
    );
  }

  const data = (await response.json()) as { tag_name?: string; html_url?: string };
  const latest = (data.tag_name ?? "").replace(/^v/, "");
  if (!latest) throw new Error("Unexpected response from GitHub");

  return {
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
  };
}

export { isAbsolutePath, joinPath, dirName, stripFileScheme } from "./paths.js";
