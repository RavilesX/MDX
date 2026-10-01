/**
 * Ctrl+E: edit the raw Markdown behind whatever is selected on screen.
 *
 * The renderer stamps every top-level block with `data-source-lines`, so the
 * selection is widened to the whole blocks it touches and the matching lines
 * of the source are handed to a plain textarea. Saving splices them back.
 */

/** 0-based source lines, end exclusive — the same shape as markdown-it's `token.map`. */
export interface SourceSpan {
  start: number;
  end: number;
}

/** The source lines behind the top-level blocks `range` touches, or null if none are editable. */
export function spanForRange(content: HTMLElement, range: Range): SourceSpan | null {
  if (!content.contains(range.commonAncestorContainer)) return null;
  const blocks = Array.from(content.children).filter(
    (child) => child.hasAttribute("data-source-lines") && range.intersectsNode(child),
  );
  // A triple-click selection ends at offset 0 of the next block; that block
  // is not really selected.
  const last = blocks[blocks.length - 1];
  if (blocks.length > 1 && range.endOffset === 0 && last.contains(range.endContainer)) blocks.pop();
  if (!blocks.length) return null;

  const lines = (el: Element) => el.getAttribute("data-source-lines")!.split("-").map(Number);
  return { start: lines(blocks[0])[0], end: lines(blocks[blocks.length - 1])[1] };
}

export function sliceLines(source: string, span: SourceSpan): string {
  return source.split(/\r?\n/).slice(span.start, span.end).join("\n");
}

/** Replace the lines in `span`; an empty replacement deletes them. Keeps the file's line endings. */
export function spliceLines(source: string, span: SourceSpan, replacement: string): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  lines.splice(span.start, span.end - span.start, ...(replacement ? replacement.split(/\r?\n/) : []));
  return lines.join(eol);
}

export interface EditorElements {
  textarea: HTMLTextAreaElement;
  cancel: HTMLButtonElement;
  save: HTMLButtonElement;
  /** "Save & Close" while there are unsaved changes, "Close" otherwise. */
  done: HTMLButtonElement;
}

export interface EditorActions {
  /** Writes the text to disk; rejecting keeps the editor open, so nothing typed is lost. */
  persist: (text: string) => Promise<void>;
  confirmDiscard: () => Promise<boolean>;
  report: (message: string) => void;
  close: () => void;
}

/** The buttons and dirty tracking of the editor window (editor.html). */
export class SourceEditor {
  /** The text as last loaded or saved; anything else in the textarea is unsaved. */
  private saved: string;
  private saving = false;

  constructor(
    private readonly el: EditorElements,
    text: string,
    private readonly actions: EditorActions,
  ) {
    this.saved = text;
    el.textarea.value = text;
    el.textarea.addEventListener("input", () => this.refresh());
    el.cancel.addEventListener("click", () => void this.cancel());
    el.save.addEventListener("click", () => void this.save());
    el.done.addEventListener("click", () => void this.done());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void this.cancel();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.save();
      }
    });
    this.refresh();
    el.textarea.focus();
    el.textarea.setSelectionRange(0, 0);
  }

  private get dirty(): boolean {
    return this.el.textarea.value !== this.saved;
  }

  /** Cancel button, Esc and the window's own close button all land here. */
  async cancel(): Promise<void> {
    if (this.saving) return;
    if (!this.dirty || (await this.actions.confirmDiscard())) this.actions.close();
  }

  private refresh(): void {
    this.el.save.disabled = this.saving || !this.dirty;
    this.el.done.disabled = this.saving;
    this.el.done.textContent = this.dirty ? "Save & Close" : "Close";
  }

  private async done(): Promise<void> {
    if (!this.dirty || (await this.save())) this.actions.close();
  }

  /** True once the textarea's contents are on disk. */
  private async save(): Promise<boolean> {
    if (this.saving || !this.dirty) return !this.dirty;
    const text = this.el.textarea.value;
    this.saving = true;
    this.refresh();
    try {
      await this.actions.persist(text);
      this.saved = text;
      return true;
    } catch (error) {
      this.actions.report(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      this.saving = false;
      this.refresh();
      this.el.textarea.focus();
    }
  }
}
