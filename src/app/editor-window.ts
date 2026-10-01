import { emit, listen, once } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * The Ctrl+E editor runs in its own OS window so it can be dragged anywhere,
 * past the edges of the viewer. The viewer keeps the file and the line span;
 * the editor window only holds the text and asks the viewer to save it.
 *
 *   editor → viewer  editor:ready         page loaded, send the text
 *   viewer → editor  editor:load          { text }
 *   editor → viewer  editor:save          text to write
 *   viewer → editor  editor:saved         { error } — null on success
 */

const LABEL = "editor";

interface LoadPayload {
  text: string;
}

interface SaveResult {
  error: string | null;
}

/**
 * Viewer side. Returns false, after focusing it, when an editor window is
 * already open — one edit at a time keeps the line span unambiguous.
 */
export async function openEditorWindow(
  text: string,
  title: string,
  onSave: (text: string) => Promise<void>,
): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) {
    await existing.setFocus();
    return false;
  }

  const unlisten = await Promise.all([
    listen("editor:ready", () => void emit("editor:load", { text } satisfies LoadPayload)),
    listen<string>("editor:save", async ({ payload }) => {
      let error: string | null = null;
      try {
        await onSave(payload);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await emit("editor:saved", { error } satisfies SaveResult);
    }),
  ]);
  const cleanup = () => unlisten.forEach((stop) => stop());

  const win = new WebviewWindow(LABEL, {
    url: "editor.html",
    title: `Edit — ${title}`,
    width: 760,
    height: 520,
    minWidth: 360,
    minHeight: 240,
    // Owned by the viewer: stays above it and goes away with it.
    parent: "main",
  });
  void win.once("tauri://destroyed", cleanup);
  void win.once("tauri://error", cleanup);
  return true;
}

/** Editor side: waits for the viewer to hand over the text. */
export async function receiveText(): Promise<string> {
  const text = new Promise<string>((resolve) => {
    void once<LoadPayload>("editor:load", ({ payload }) => resolve(payload.text)).then(() => emit("editor:ready"));
  });
  return text;
}

/** Editor side: asks the viewer to write `text`, rejecting with its error if that fails. */
export async function requestSave(text: string): Promise<void> {
  let settle: (result: SaveResult) => void = () => {};
  const reply = new Promise<SaveResult>((resolve) => (settle = resolve));
  await once<SaveResult>("editor:saved", ({ payload }) => settle(payload));
  await emit("editor:save", text);
  const { error } = await reply;
  if (error) throw new Error(error);
}
