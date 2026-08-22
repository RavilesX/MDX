/**
 * Find-in-document.
 *
 * Matches are wrapped in `<mark>` elements which are unwrapped again on close,
 * leaving the rendered DOM exactly as it was. Text nodes are matched
 * individually — a phrase split across inline markup will not match, which is
 * the same trade-off browsers' own find made for years and keeps the DOM
 * surgery local and reversible.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "SVG", "MARK"]);
const MAX_HITS = 2000;

export class FindBar {
  private hits: HTMLElement[] = [];
  private index = -1;
  private debounce: number | null = null;

  constructor(
    private readonly bar: HTMLElement,
    private readonly input: HTMLInputElement,
    private readonly counter: HTMLElement,
    private readonly content: HTMLElement,
    buttons: { next: HTMLElement; prev: HTMLElement; close: HTMLElement },
  ) {
    this.input.addEventListener("input", () => {
      if (this.debounce) window.clearTimeout(this.debounce);
      this.debounce = window.setTimeout(() => this.search(this.input.value), 120);
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.step(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    buttons.next.addEventListener("click", () => this.step(1));
    buttons.prev.addEventListener("click", () => this.step(-1));
    buttons.close.addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.bar.hidden;
  }

  open(seed?: string): void {
    this.bar.hidden = false;
    if (seed) this.input.value = seed;
    this.input.focus();
    this.input.select();
    if (this.input.value) this.search(this.input.value);
  }

  close(): void {
    this.bar.hidden = true;
    this.clear();
  }

  /** Called before the document is replaced, so no stale marks survive. */
  reset(): void {
    this.clear();
    if (this.isOpen && this.input.value) this.search(this.input.value);
  }

  private clear(): void {
    for (const hit of this.hits) {
      const parent = hit.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(hit.textContent ?? ""), hit);
      parent.normalize();
    }
    this.hits = [];
    this.index = -1;
    this.counter.textContent = "0/0";
  }

  private search(query: string): void {
    this.clear();
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return;

    const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[hidden]")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    // Collect first: wrapping matches mutates the tree the walker is reading.
    const targets: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      targets.push(node as Text);
      node = walker.nextNode();
    }

    for (const text of targets) {
      if (this.hits.length >= MAX_HITS) break;
      this.markMatches(text, needle);
    }

    this.counter.textContent = `${this.hits.length ? 1 : 0}/${this.hits.length}`;
    if (this.hits.length) {
      this.index = 0;
      this.focusHit();
    }
  }

  private markMatches(text: Text, needle: string): void {
    const value = text.nodeValue ?? "";
    const haystack = value.toLowerCase();
    let from = haystack.indexOf(needle);
    if (from < 0) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    while (from >= 0 && this.hits.length < MAX_HITS) {
      if (from > cursor) fragment.appendChild(document.createTextNode(value.slice(cursor, from)));
      const mark = document.createElement("mark");
      mark.className = "find-hit";
      mark.textContent = value.slice(from, from + needle.length);
      fragment.appendChild(mark);
      this.hits.push(mark);
      cursor = from + needle.length;
      from = haystack.indexOf(needle, cursor);
    }

    if (cursor < value.length) fragment.appendChild(document.createTextNode(value.slice(cursor)));
    text.parentNode?.replaceChild(fragment, text);
  }

  private step(direction: number): void {
    if (!this.hits.length) return;
    this.hits[this.index]?.classList.remove("current");
    this.index = (this.index + direction + this.hits.length) % this.hits.length;
    this.focusHit();
  }

  private focusHit(): void {
    const hit = this.hits[this.index];
    if (!hit) return;
    hit.classList.add("current");
    hit.scrollIntoView({ block: "center", behavior: "smooth" });
    this.counter.textContent = `${this.index + 1}/${this.hits.length}`;
  }
}
