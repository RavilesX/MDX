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

export class SourceEditor {
  private onSave: ((text: string) => Promise<void>) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly textarea: HTMLTextAreaElement,
    private readonly saveButton: HTMLButtonElement,
    cancelButton: HTMLElement,
  ) {
    cancelButton.addEventListener("click", () => this.close());
    this.saveButton.addEventListener("click", () => void this.save());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.save();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** `onSave` rejecting keeps the dialog open, so the edit is never lost to a failed write. */
  open(text: string, onSave: (text: string) => Promise<void>): void {
    this.onSave = onSave;
    this.textarea.value = text;
    this.saveButton.disabled = false;
    this.root.hidden = false;
    this.textarea.focus();
    this.textarea.setSelectionRange(0, 0);
  }

  close(): void {
    this.root.hidden = true;
    this.onSave = null;
  }

  private async save(): Promise<void> {
    if (!this.onSave || this.saveButton.disabled) return;
    this.saveButton.disabled = true;
    try {
      await this.onSave(this.textarea.value);
      this.close();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("mdx:toast", { detail: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      this.saveButton.disabled = false;
    }
  }
}
