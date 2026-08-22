import type { Heading } from "../markdown/renderer.js";

/**
 * Sidebar outline. Headings are already collected during the render pass, so
 * building the tree costs nothing beyond creating the list items.
 */
export class TableOfContents {
  private headings: Heading[] = [];
  private items = new Map<string, HTMLLIElement>();
  private activeSlug: string | null = null;

  onSelect: ((slug: string) => void) | null = null;

  constructor(
    private readonly list: HTMLOListElement,
    private readonly filterInput: HTMLInputElement,
  ) {
    this.list.addEventListener("click", (event) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-slug]");
      if (!link) return;
      event.preventDefault();
      this.onSelect?.(link.dataset.slug!);
    });

    this.filterInput.addEventListener("input", () => this.applyFilter());
    this.filterInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = this.list.querySelector<HTMLAnchorElement>("li:not([hidden]) a[data-slug]");
      if (first) this.onSelect?.(first.dataset.slug!);
    });
  }

  set(headings: Heading[]): void {
    this.headings = headings;
    this.items.clear();
    this.list.replaceChildren();
    this.filterInput.value = "";
    this.activeSlug = null;

    if (!headings.length) {
      const empty = document.createElement("li");
      empty.className = "toc-empty";
      empty.textContent = "No headings";
      this.list.appendChild(empty);
      return;
    }

    // Normalise so a document that starts at h2 is not indented by a phantom level.
    const base = Math.min(...headings.map((h) => h.level));

    const fragment = document.createDocumentFragment();
    for (const heading of headings) {
      const item = document.createElement("li");
      item.className = `toc-item toc-level-${Math.min(5, heading.level - base + 1)}`;

      const link = document.createElement("a");
      link.href = `#${heading.slug}`;
      link.dataset.slug = heading.slug;
      link.textContent = heading.text;
      link.title = heading.text;

      item.appendChild(link);
      fragment.appendChild(item);
      this.items.set(heading.slug, item);
    }
    this.list.appendChild(fragment);
  }

  setActive(slug: string): void {
    if (slug === this.activeSlug) return;
    if (this.activeSlug) this.items.get(this.activeSlug)?.classList.remove("active");
    this.activeSlug = slug;

    const item = this.items.get(slug);
    if (!item) return;
    item.classList.add("active");
    // Keep the marker in view without yanking the whole page around.
    item.scrollIntoView({ block: "nearest" });
  }

  focusFilter(): void {
    this.filterInput.focus();
    this.filterInput.select();
  }

  private applyFilter(): void {
    const query = this.filterInput.value.trim().toLowerCase();
    if (!query) {
      for (const item of this.items.values()) item.hidden = false;
      return;
    }
    for (const heading of this.headings) {
      const item = this.items.get(heading.slug);
      if (item) item.hidden = !heading.text.toLowerCase().includes(query);
    }
  }
}
