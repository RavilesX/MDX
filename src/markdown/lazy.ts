import { sanitizeSvg } from "./sanitize.js";

/**
 * Everything expensive lives behind a dynamic import here.
 *
 * Mermaid is ~3 MB and KaTeX is not far behind; most documents contain
 * neither. The document is painted first as plain text and headings, then the
 * functions below scan the DOM, and a library is fetched only if its markers
 * are actually present. Within a document, work is further deferred until a
 * block scrolls near the viewport.
 */

type MermaidApi = typeof import("mermaid")["default"];
type KatexApi = typeof import("katex")["default"];
type HljsApi = typeof import("highlight.js")["default"];

let mermaidPromise: Promise<MermaidApi> | null = null;
let katexPromise: Promise<KatexApi> | null = null;
let hljsCommonPromise: Promise<HljsApi> | null = null;
let hljsFullPromise: Promise<HljsApi> | null = null;

/** Bumped on every new document so stale async work can bail out. */
let generation = 0;
export function newGeneration(): number {
  return ++generation;
}

/** The generation currently being displayed, for stale-work checks. */
export function currentGeneration(): number {
  return generation;
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        // HTML labels would emit <foreignObject>, which the SVG sanitiser
        // drops. Pure-SVG labels survive sanitising intact.
        htmlLabels: false,
        flowchart: { htmlLabels: false, useMaxWidth: true },
        theme: isDark() ? "dark" : "default",
        fontFamily: "var(--font-sans)",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

async function loadKatex(): Promise<KatexApi> {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
      ([mod]) => mod.default,
    );
  }
  return katexPromise;
}

/**
 * Two tiers of highlight.js. The common bundle covers the ~40 languages that
 * account for almost every fenced block and is a fraction of the size; the
 * full build is fetched only when a document names something outside it.
 */
async function loadHljs(language: string): Promise<HljsApi> {
  if (!hljsCommonPromise) {
    hljsCommonPromise = import("highlight.js/lib/common").then(({ default: hljs }) => hljs);
  }
  const common = await hljsCommonPromise;
  if (!language || language === "plaintext" || common.getLanguage(language)) return common;

  if (!hljsFullPromise) {
    hljsFullPromise = import("highlight.js").then(({ default: hljs }) => hljs);
  }
  return hljsFullPromise;
}

/**
 * Run `task` for each element, nearest-to-viewport first. Elements far below
 * the fold wait until the user scrolls toward them.
 */
function whenVisible(elements: Iterable<Element>, task: (el: Element) => void): () => void {
  const pending = [...elements];
  if (!pending.length) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        task(entry.target);
      }
    },
    { rootMargin: "600px 0px" },
  );

  for (const el of pending) observer.observe(el);
  return () => observer.disconnect();
}

let disconnectors: Array<() => void> = [];

/** Drop observers left over from the previously displayed document. */
export function resetLazyWork(): void {
  for (const stop of disconnectors) stop();
  disconnectors = [];
}

export async function renderMath(root: ParentNode, token: number): Promise<void> {
  // A `.math` that has already been typeset no longer holds a fallback child,
  // which is what keeps a second pass from re-rendering it.
  const nodes = [...root.querySelectorAll<HTMLElement>(".math")].filter((node) =>
    node.querySelector(".math-fallback"),
  );
  if (!nodes.length) return;

  const katex = await loadKatex();
  if (token !== generation) return;

  for (const node of nodes) {
    const tex = node.querySelector(".math-fallback")?.textContent ?? "";
    const displayMode = node.classList.contains("math-display");
    try {
      node.innerHTML = katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        trust: false, // blocks \href and \includegraphics
        output: "htmlAndMathml",
        macros: { "\\RR": "\\mathbb{R}", "\\NN": "\\mathbb{N}", "\\ZZ": "\\mathbb{Z}" },
      });
      node.dataset.state = "done";
    } catch (error) {
      node.classList.add("math-error");
      node.title = error instanceof Error ? error.message : "Math error";
      node.dataset.state = "error";
    }
  }
}

export function renderDiagrams(root: ParentNode, token: number): void {
  const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block[data-state="pending"]');
  if (!blocks.length) return;

  let counter = 0;
  const draw = (element: Element): void => {
    const block = element as HTMLElement;
    if (block.dataset.state !== "pending") return;
    block.dataset.state = "rendering";

    void (async () => {
      const target = block.querySelector(".mermaid-target");
      const source = block.querySelector(".mermaid-source")?.textContent ?? "";
      try {
        const mermaid = await loadMermaid();
        if (token !== generation || !target) return;
        const id = `mermaid-${token}-${counter++}`;
        const { svg } = await mermaid.render(id, source);
        if (token !== generation) return;
        target.innerHTML = sanitizeSvg(svg);
        block.dataset.state = "done";
      } catch (error) {
        if (token !== generation || !target) return;
        const message = error instanceof Error ? error.message : String(error);
        target.innerHTML = "";
        const pre = document.createElement("pre");
        pre.className = "mermaid-error";
        pre.textContent = `Diagram error: ${message}\n\n${source}`;
        target.appendChild(pre);
        block.dataset.state = "error";
      }
    })();
  };

  disconnectors.push(whenVisible(blocks, draw));
}

export function highlightCode(root: ParentNode, token: number): void {
  const blocks = root.querySelectorAll<HTMLElement>('code[data-highlight="pending"]');
  if (!blocks.length) return;

  const run = (element: Element): void => {
    const code = element as HTMLElement;
    if (code.dataset.highlight !== "pending") return;
    code.dataset.highlight = "running";

    void (async () => {
      const lang = (code.className.match(/language-([\w+#-]+)/)?.[1] ?? "").toLowerCase();
      const hljs = await loadHljs(lang);
      if (token !== generation) return;
      const source = code.textContent ?? "";
      try {
        const result =
          lang && lang !== "plaintext" && hljs.getLanguage(lang)
            ? hljs.highlight(source, { language: lang, ignoreIllegals: true })
            : hljs.highlightAuto(source);
        code.innerHTML = result.value;
        code.dataset.highlight = "done";
        const figure = code.closest<HTMLElement>(".code-block");
        if (figure && !figure.dataset.lang) figure.dataset.lang = result.language ?? "";
      } catch {
        code.dataset.highlight = "skipped";
      }
    })();
  };

  disconnectors.push(whenVisible(blocks, run));
}

/** Redraw diagrams after a theme switch — Mermaid bakes colours into the SVG. */
export async function refreshDiagramTheme(root: ParentNode, token: number): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>(".mermaid-block");
  if (!blocks.length || !mermaidPromise) return;

  const mermaid = await mermaidPromise;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: true },
    theme: isDark() ? "dark" : "default",
    fontFamily: "var(--font-sans)",
  });

  for (const block of blocks) {
    block.dataset.state = "pending";
    const target = block.querySelector(".mermaid-target");
    if (target) target.innerHTML = '<div class="lazy-placeholder">Rendering diagram…</div>';
  }
  renderDiagrams(root, token);
}
