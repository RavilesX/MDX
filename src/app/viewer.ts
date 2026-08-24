import { renderMarkdown, type Heading, type RenderResult } from "../markdown/renderer.js";
import { sanitizeHtml } from "../markdown/sanitize.js";
import {
  currentGeneration,
  highlightCode,
  newGeneration,
  refreshDiagramTheme,
  renderDiagrams,
  renderMath,
  resetLazyWork,
} from "../markdown/lazy.js";
import {
  assetUrl,
  dirName,
  joinPath,
  openExternal,
  readDocument,
  resolveLink,
  setWindowTitle,
  watchDocument,
  type DocumentPayload,
} from "./bridge.js";
import { loadScroll, pushRecent, saveScroll, type Settings } from "./settings.js";

export interface OpenDocument {
  payload: DocumentPayload;
  render: RenderResult;
}

interface ViewerElements {
  root: HTMLElement;
  content: HTMLElement;
  welcome: HTMLElement;
  title: HTMLElement;
  stats: HTMLElement;
  progress: HTMLElement;
  lightbox: HTMLElement;
  lightboxImg: HTMLImageElement;
}

const EXTERNAL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

export class Viewer {
  private current: OpenDocument | null = null;
  private token = 0;
  private headingObserver: IntersectionObserver | null = null;
  private scrollTimer: number | null = null;

  /** Fired after a document renders, so the TOC and window chrome can update. */
  onDocument: ((doc: OpenDocument) => void) | null = null;
  onActiveHeading: ((slug: string) => void) | null = null;

  constructor(
    private readonly el: ViewerElements,
    private settings: Settings,
  ) {
    this.bindEvents();
  }

  get document(): OpenDocument | null {
    return this.current;
  }

  updateSettings(settings: Settings): void {
    const remoteImagesChanged = settings.allowRemoteImages !== this.settings.allowRemoteImages;
    this.settings = settings;
    if (this.current) this.applyFrontMatterVisibility();
    if (this.current && remoteImagesChanged) void this.reload();
  }

  async open(path: string, options: { keepScroll?: boolean } = {}): Promise<void> {
    const previousRatio = options.keepScroll ? this.scrollRatio() : null;
    const payload = await readDocument(path);
    const render = renderMarkdown(payload.content);

    this.token = newGeneration();
    resetLazyWork();
    this.headingObserver?.disconnect();

    this.current = { payload, render };
    this.el.content.innerHTML = sanitizeHtml(render.html);
    this.el.welcome.hidden = true;
    this.el.content.hidden = false;
    this.el.root.dataset.hasDocument = "true";

    this.insertFrontMatter(render);
    this.el.title.textContent = payload.name;
    this.el.title.title = payload.path;
    void setWindowTitle(`${payload.name} — MDX`);
    this.renderStats(render, payload);
    this.onDocument?.(this.current);

    // Paint first; everything below runs against a document already on screen.
    requestAnimationFrame(() => {
      if (this.token !== currentGeneration()) return;
      void this.postProcess(payload);
      highlightCode(this.el.content, this.token);
      renderDiagrams(this.el.content, this.token);
      void renderMath(this.el.content, this.token);
      this.observeHeadings(render.headings);

      const ratio = previousRatio ?? loadScroll(payload.path);
      if (ratio > 0) this.scrollToRatio(ratio);
      else this.el.content.parentElement?.scrollTo({ top: 0 });
    });

    pushRecent({ path: payload.path, name: payload.name });
    void watchDocument(payload.path);

    if (payload.lossy) {
      this.warn("File is not valid UTF-8; some characters were replaced.");
    }
  }

  /**
   * Render Markdown that has no file behind it (the built-in help and
   * showcase pages). Nothing is watched, recorded as recent, or scroll-saved.
   */
  showInline(source: string, title: string): void {
    const render = renderMarkdown(source);
    this.token = newGeneration();
    resetLazyWork();
    this.headingObserver?.disconnect();
    this.current = null;

    this.el.content.innerHTML = sanitizeHtml(render.html);
    this.el.welcome.hidden = true;
    this.el.content.hidden = false;
    this.el.root.dataset.hasDocument = "true";
    this.el.title.textContent = title;
    this.el.title.title = title;
    void setWindowTitle(`${title} — MDX`);
    this.renderStats(render, {
      path: "",
      name: title,
      dir: "",
      content: source,
      size: new Blob([source]).size,
      modified: null,
      lossy: false,
    });

    requestAnimationFrame(() => {
      if (this.token !== currentGeneration()) return;
      highlightCode(this.el.content, this.token);
      renderDiagrams(this.el.content, this.token);
      void renderMath(this.el.content, this.token);
      this.observeHeadings(render.headings);
      this.el.content.parentElement?.scrollTo({ top: 0 });
    });

    this.onDocument?.({
      payload: { path: "", name: title, dir: "", content: source, size: 0, modified: null, lossy: false },
      render,
    });
  }

  async reload(): Promise<void> {
    if (!this.current) return;
    await this.open(this.current.payload.path, { keepScroll: true });
  }

  /** Mermaid bakes colours into its SVG, so a theme change means a redraw. */
  async onThemeChanged(): Promise<void> {
    if (!this.current) return;
    await refreshDiagramTheme(this.el.content, this.token);
  }

  scrollToSlug(slug: string): void {
    const target = this.el.content.querySelector<HTMLElement>(`#${cssEscape(slug)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("heading-flash");
    window.setTimeout(() => target.classList.remove("heading-flash"), 900);
  }

  private scroller(): HTMLElement {
    return this.el.content.parentElement as HTMLElement;
  }

  private scrollRatio(): number {
    const el = this.scroller();
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? el.scrollTop / max : 0;
  }

  private scrollToRatio(ratio: number): void {
    const el = this.scroller();
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTo({ top: max * ratio });
  }

  private renderStats(render: RenderResult, payload: DocumentPayload): void {
    const { words, readingMinutes, lines } = render.stats;
    const kb = payload.size / 1024;
    this.el.stats.textContent =
      `${words.toLocaleString()} words · ${readingMinutes} min read · ` +
      `${lines.toLocaleString()} lines · ${kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`}`;
  }

  private insertFrontMatter(render: RenderResult): void {
    if (!render.frontMatterRaw) return;

    const details = document.createElement("details");
    details.className = "front-matter";
    details.hidden = !this.settings.showFrontMatter;

    const summary = document.createElement("summary");
    const entries = render.frontMatter ? Object.entries(render.frontMatter) : [];
    const title = render.frontMatter?.title;
    summary.textContent = typeof title === "string" && title ? title : "Front matter";
    details.appendChild(summary);

    if (entries.length) {
      const list = document.createElement("dl");
      for (const [key, value] of entries) {
        const dt = document.createElement("dt");
        dt.textContent = key;
        const dd = document.createElement("dd");
        dd.textContent = Array.isArray(value)
          ? value.map(String).join(", ")
          : typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value);
        list.append(dt, dd);
      }
      details.appendChild(list);
    } else {
      // Non-YAML front matter (TOML, JSON) is shown verbatim rather than dropped.
      const pre = document.createElement("pre");
      pre.className = "front-matter-raw";
      pre.textContent = render.frontMatterRaw.trim();
      details.appendChild(pre);
    }

    this.el.content.prepend(details);
  }

  private applyFrontMatterVisibility(): void {
    const panel = this.el.content.querySelector<HTMLElement>(".front-matter");
    if (panel) panel.hidden = !this.settings.showFrontMatter;
  }

  /**
   * Rewrite everything that points at the filesystem. Markdown authors write
   * paths relative to their file; the webview needs `asset:` URLs, and links
   * to other documents must be intercepted rather than navigated to.
   */
  private async postProcess(payload: DocumentPayload): Promise<void> {
    const dir = payload.dir || dirName(payload.path);
    const root = this.el.content;

    for (const media of root.querySelectorAll<HTMLElement>("img[src], video[src], audio[src], source[src]")) {
      const src = media.getAttribute("src");
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
      if (EXTERNAL_SCHEME.test(src) && !src.startsWith("file:")) {
        // Remote images leak a request to a third party from a local
        // document, so this is opt-in; the CSP only allows https: through.
        if (this.settings.allowRemoteImages && src.startsWith("https:")) continue;
        media.setAttribute("data-blocked", "remote");
        media.removeAttribute("src");
        continue;
      }
      const absolute = src.startsWith("file://") ? src.slice(7) : joinPath(dir, src);
      media.setAttribute("src", assetUrl(absolute));
      media.setAttribute("data-source-path", absolute);
    }

    for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        anchor.dataset.linkType = "anchor";
      } else if (EXTERNAL_SCHEME.test(href) && !href.startsWith("file:")) {
        anchor.dataset.linkType = "external";
        anchor.title = href;
      } else {
        anchor.dataset.linkType = "local";
        anchor.dataset.basedir = dir;
      }
    }

    // Wiki-link embeds need a round trip to find the real file.
    const embeds = [...root.querySelectorAll<HTMLImageElement>("img[data-wikilink]")];
    await Promise.all(
      embeds.map(async (img) => {
        const target = img.dataset.wikilink ?? "";
        const resolved = await resolveLink(dir, target);
        if (resolved) {
          img.src = assetUrl(resolved);
          img.dataset.sourcePath = resolved;
        } else {
          img.replaceWith(missingEmbed(target));
        }
      }),
    );
  }

  private observeHeadings(headings: Heading[]): void {
    this.headingObserver?.disconnect();
    if (!headings.length || !this.onActiveHeading) return;

    const visible = new Set<string>();
    this.headingObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Report the topmost heading currently in view.
        const first = headings.find((h) => visible.has(h.slug));
        if (first) this.onActiveHeading?.(first.slug);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const heading of headings) {
      const el = this.el.content.querySelector(`#${cssEscape(heading.slug)}`);
      if (el) this.headingObserver.observe(el);
    }
  }

  private bindEvents(): void {
    const scroller = this.scroller();

    scroller.addEventListener(
      "scroll",
      () => {
        const ratio = this.scrollRatio();
        this.el.progress.style.transform = `scaleX(${ratio})`;
        if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
        this.scrollTimer = window.setTimeout(() => {
          if (this.current) saveScroll(this.current.payload.path, ratio);
        }, 400);
      },
      { passive: true },
    );

    this.el.content.addEventListener("click", (event) => {
      void this.handleClick(event);
    });

    this.el.lightbox.addEventListener("click", () => {
      this.el.lightbox.hidden = true;
      this.el.lightboxImg.removeAttribute("src");
    });
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;

    const copyButton = target.closest<HTMLButtonElement>('[data-action="copy-code"]');
    if (copyButton) {
      event.preventDefault();
      const code = copyButton.closest(".code-block")?.querySelector("code");
      if (code) {
        await navigator.clipboard.writeText(code.textContent ?? "");
        copyButton.textContent = "Copied";
        window.setTimeout(() => (copyButton.textContent = "Copy"), 1400);
      }
      return;
    }

    const wikilink = target.closest<HTMLAnchorElement>("a.wikilink");
    if (wikilink) {
      event.preventDefault();
      const dir = this.current?.payload.dir ?? "";
      const resolved = await resolveLink(dir, wikilink.dataset.wikilink ?? "");
      if (resolved) await this.open(resolved);
      else this.warn(`No file matches [[${wikilink.dataset.wikilink}]]`);
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (anchor) {
      const type = anchor.dataset.linkType;
      if (type === "external") {
        event.preventDefault();
        await openExternal(anchor.href || anchor.getAttribute("href") || "");
        return;
      }
      if (type === "anchor") {
        event.preventDefault();
        this.scrollToSlug(decodeURIComponent(anchor.getAttribute("href")!.slice(1)));
        return;
      }
      if (type === "local") {
        event.preventDefault();
        const raw = anchor.getAttribute("href") ?? "";
        const [file, fragment] = raw.split("#");
        const resolved = await resolveLink(anchor.dataset.basedir ?? "", file);
        if (!resolved) {
          this.warn(`Cannot find ${raw}`);
          return;
        }
        await this.open(resolved);
        if (fragment) window.setTimeout(() => this.scrollToSlug(fragment), 60);
        return;
      }
    }

    const image = target.closest<HTMLImageElement>(".markdown-body img");
    if (image?.src) {
      event.preventDefault();
      this.el.lightboxImg.src = image.src;
      this.el.lightboxImg.alt = image.alt;
      this.el.lightbox.hidden = false;
    }
  }

  private warn(message: string): void {
    window.dispatchEvent(new CustomEvent("mdx:toast", { detail: message }));
  }
}

function missingEmbed(target: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "missing-embed";
  span.textContent = `Missing embed: ${target}`;
  return span;
}

/** `CSS.escape` is not in every WebKit build this may run on. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
}
