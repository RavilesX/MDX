import "./styles/base.css";
import "./styles/themes.css";
import "./styles/chrome.css";

import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { confirmAction, showError } from "./app/bridge.js";
import { SourceEditor } from "./app/editor.js";
import { receiveText, requestSave } from "./app/editor-window.js";
import { loadSettings } from "./app/settings.js";
import { applyTheme } from "./app/theme.js";

/** Entry point of editor.html, the Ctrl+E editor window. */

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

applyTheme(loadSettings());
const win = getCurrentWebviewWindow();

const editor = new SourceEditor(
  {
    textarea: need<HTMLTextAreaElement>("editor-text"),
    cancel: need<HTMLButtonElement>("editor-cancel"),
    save: need<HTMLButtonElement>("editor-save"),
    done: need<HTMLButtonElement>("editor-done"),
  },
  await receiveText(),
  {
    persist: requestSave,
    confirmDiscard: () => confirmAction("Discard your unsaved changes?", "Discard"),
    report: (message) => void showError(message),
    close: () => void win.destroy(),
  },
);

// The title-bar close button asks first too, when there is something to lose.
void win.onCloseRequested((event) => {
  event.preventDefault();
  void editor.cancel();
});
