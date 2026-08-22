import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
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

export function joinPath(dir: string, relative: string): string {
  if (relative.startsWith("/")) return relative;
  const parts = `${dir}/${relative}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return `/${stack.join("/")}`;
}

export function dirName(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}
