import { baseName } from "./paths.js";

/**
 * The open-document strip.
 *
 * A tab owns *where the reader is*, not what is rendered: the single `Viewer`
 * still renders one document at a time and is re-pointed when the active tab
 * changes. Keeping only the co-ordinates (path, per-tab history, name) here
 * means a tab costs nothing while it is in the background, and switching to
 * one always shows what is on disk now rather than a stale DOM snapshot.
 */

export type TabKind = "file" | "inline";

export interface Tab {
  id: string;
  kind: TabKind;
  /** Absolute path for a file tab; empty for a built-in page. */
  path: string;
  name: string;
  /** Markdown source for `kind: "inline"` (help, showcase). */
  source?: string;
  /** Documents visited in this tab, for Alt+←/→. */
  history: string[];
  historyIndex: number;
}

export interface StoredTab {
  path: string;
  name: string;
}

export class TabBar {
  private tabs: Tab[] = [];
  private activeId: string | null = null;
  private seq = 0;

  /** A tab was picked by the reader; the host is expected to load it. */
  onActivate: ((tab: Tab) => void) | null = null;
  /** Fired after any change that should be persisted. */
  onChange: (() => void) | null = null;
  /** The last tab was closed. */
  onEmpty: (() => void) | null = null;

  constructor(private readonly strip: HTMLElement) {
    this.strip.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const element = target.closest<HTMLElement>(".tab");
      if (!element) return;
      const id = element.dataset.id!;
      if (target.closest(".tab-close")) {
        event.preventDefault();
        this.close(id);
        return;
      }
      this.select(id);
    });

    // Middle click closes, the way it does in a browser.
    this.strip.addEventListener("auxclick", (event) => {
      if (event.button !== 1) return;
      const element = (event.target as HTMLElement).closest<HTMLElement>(".tab");
      if (!element) return;
      event.preventDefault();
      this.close(element.dataset.id!);
    });

    this.strip.addEventListener("keydown", (event) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>(".tab");
      if (!element) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.select(element.dataset.id!);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        this.close(element.dataset.id!);
      }
    });
  }

  get all(): readonly Tab[] {
    return this.tabs;
  }

  get count(): number {
    return this.tabs.length;
  }

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  find(id: string): Tab | null {
    return this.tabs.find((tab) => tab.id === id) ?? null;
  }

  findByPath(path: string): Tab | null {
    return this.tabs.find((tab) => tab.kind === "file" && tab.path === path) ?? null;
  }

  /** Adds a tab without loading it. Pass `activate` to make it current. */
  add(init: { kind: TabKind; path: string; name: string; source?: string }, activate = true): Tab {
    const tab: Tab = {
      id: `t${++this.seq}`,
      kind: init.kind,
      path: init.path,
      name: init.name,
      source: init.source,
      history: init.kind === "file" && init.path ? [init.path] : [],
      historyIndex: init.kind === "file" && init.path ? 0 : -1,
    };
    // A new tab lands next to the one it was opened from, not at the far end.
    // Tabs added in the background (a multi-file drop, a restored session)
    // keep the order they arrived in instead.
    const at = activate ? this.tabs.findIndex((t) => t.id === this.activeId) : -1;
    if (at >= 0) this.tabs.splice(at + 1, 0, tab);
    else this.tabs.push(tab);

    if (activate) this.activeId = tab.id;
    this.render();
    this.onChange?.();
    return tab;
  }

  /** Makes `id` current and renders; does not fire `onActivate`. */
  setActive(id: string): Tab | null {
    const tab = this.find(id);
    if (!tab) return null;
    this.activeId = tab.id;
    this.render();
    this.onChange?.();
    return tab;
  }

  /** Reader-driven activation: renders and asks the host to load the tab. */
  select(id: string): void {
    if (id === this.activeId) return;
    const tab = this.setActive(id);
    if (tab) this.onActivate?.(tab);
  }

  close(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const wasActive = this.tabs[index].id === this.activeId;
    this.tabs.splice(index, 1);

    if (!this.tabs.length) {
      this.activeId = null;
      this.render();
      this.onChange?.();
      this.onEmpty?.();
      return;
    }
    if (wasActive) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeId = next.id;
      this.render();
      this.onChange?.();
      this.onActivate?.(next);
      return;
    }
    this.render();
    this.onChange?.();
  }

  closeActive(): void {
    if (this.activeId) this.close(this.activeId);
  }

  closeOthers(id: string): void {
    const keep = this.find(id);
    if (!keep) return;
    this.tabs = [keep];
    const wasActive = this.activeId === keep.id;
    this.activeId = keep.id;
    this.render();
    this.onChange?.();
    if (!wasActive) this.onActivate?.(keep);
  }

  /** Cycles by `direction`, wrapping at both ends. */
  cycle(direction: number): void {
    if (this.tabs.length < 2) return;
    const at = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = (at + direction + this.tabs.length) % this.tabs.length;
    this.select(this.tabs[next].id);
  }

  /** 0-based; used by Ctrl+1…9. */
  selectIndex(index: number): void {
    const tab = this.tabs[index];
    if (tab) this.select(tab.id);
  }

  /**
   * Records that the active tab now shows `path` — a link followed inside the
   * document, which the viewer opens on its own. `pushHistory` is false when
   * the move *is* a history step, in which case the caller owns the index.
   */
  navigated(tab: Tab, path: string, name: string, pushHistory = true): void {
    if (tab.kind !== "file") return;
    const moved = tab.path !== path;
    tab.path = path;
    tab.name = name;
    if (moved && pushHistory) {
      tab.history.splice(tab.historyIndex + 1);
      tab.history.push(path);
      tab.historyIndex = tab.history.length - 1;
    }
    this.render();
    this.onChange?.();
  }

  /** Restores a previous session. Nothing is loaded; the host does that. */
  restore(stored: StoredTab[]): void {
    for (const item of stored) {
      if (!item?.path) continue;
      if (this.findByPath(item.path)) continue;
      this.add({ kind: "file", path: item.path, name: item.name || baseName(item.path) }, false);
    }
    this.activeId = this.tabs[0]?.id ?? null;
    this.render();
  }

  /** File tabs only — the built-in pages are not worth carrying across runs. */
  toStored(): StoredTab[] {
    return this.tabs
      .filter((tab) => tab.kind === "file" && tab.path)
      .map((tab) => ({ path: tab.path, name: tab.name }));
  }

  private render(): void {
    this.strip.replaceChildren();
    this.strip.hidden = this.tabs.length === 0;
    document.documentElement.dataset.tabs = this.tabs.length ? "on" : "off";
    if (!this.tabs.length) return;

    for (const tab of this.tabs) {
      const active = tab.id === this.activeId;

      const element = document.createElement("div");
      element.className = "tab";
      element.dataset.id = tab.id;
      element.role = "tab";
      element.tabIndex = active ? 0 : -1;
      element.setAttribute("aria-selected", String(active));
      element.title = tab.path || tab.name;

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tab.name;

      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.tabIndex = -1;
      close.title = "Close tab (Ctrl+W)";
      close.setAttribute("aria-label", `Close ${tab.name}`);
      close.textContent = "✕";

      element.append(name, close);
      this.strip.appendChild(element);

      if (active) requestAnimationFrame(() => element.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }
  }
}
