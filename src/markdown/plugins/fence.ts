import type MarkdownIt from "markdown-it";
import type { StateCore, Token } from "markdown-it";

/**
 * Fence rendering. Like the math plugin, nothing heavy runs here: fences are
 * emitted as inert markup carrying their source, and ../lazy.ts upgrades them
 * (Mermaid diagram, highlighted code) once the document is painted.
 */

const MERMAID_LANGS = new Set(["mermaid", "mmd"]);
const MATH_LANGS = new Set(["math", "katex", "latex", "tex"]);

interface FenceInfo {
  lang: string;
  title: string | null;
  highlights: Set<number>;
  showLineNumbers: boolean;
}

const RANGE_PATTERN = /\{([\d,\s-]+)\}/;

/** Parse ```` ```ts title="server.ts" {1,4-6} numbered ```` */
function parseInfo(raw: string): FenceInfo {
  const info: FenceInfo = { lang: "", title: null, highlights: new Set(), showLineNumbers: false };
  const trimmed = raw.trim();
  if (!trimmed) return info;

  const langMatch = /^[^\s{]+/.exec(trimmed);
  if (langMatch) info.lang = langMatch[0].toLowerCase().replace(/^\./, "");

  const titleMatch = /(?:title|caption)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(trimmed);
  if (titleMatch) info.title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3];

  if (/\b(numbered|linenums|line-numbers)\b/i.test(trimmed)) info.showLineNumbers = true;

  const rangeMatch = RANGE_PATTERN.exec(trimmed);
  if (rangeMatch) {
    for (const part of rangeMatch[1].split(",")) {
      const range = part.trim();
      if (!range) continue;
      const [from, to] = range.split("-").map((n) => Number.parseInt(n, 10));
      if (Number.isNaN(from)) continue;
      // A bare `{2}` leaves `to` undefined, which is not NaN — check for a
      // usable number rather than for NaN.
      const end = Number.isFinite(to) ? to : from;
      for (let line = from; line <= end && line - from < 500; line++) info.highlights.add(line);
    }
    if (info.highlights.size) info.showLineNumbers = true;
  }
  return info;
}

function renderCode(md: MarkdownIt, source: string, info: FenceInfo): string {
  const esc = md.utils.escapeHtml;
  const label = info.lang || "text";
  const head =
    `<div class="code-head">` +
    `<span class="code-lang">${esc(info.title ?? label)}</span>` +
    `<button class="code-copy" type="button" data-action="copy-code" title="Copy code" aria-label="Copy code">Copy</button>` +
    `</div>`;

  const lines = source.replace(/\n$/, "").split("\n");
  const gutter = info.showLineNumbers
    ? `<span class="code-gutter" aria-hidden="true">${lines.map((_, i) => `<span${info.highlights.has(i + 1) ? ' class="hl"' : ""}>${i + 1}</span>`).join("")}</span>`
    : "";

  const classes = ["code-block"];
  if (info.showLineNumbers) classes.push("has-gutter");

  return (
    `<figure class="${classes.join(" ")}" data-lang="${esc(info.lang)}">` +
    head +
    `<div class="code-scroll">${gutter}` +
    `<pre><code class="language-${esc(info.lang || "plaintext")}" data-highlight="pending">${esc(source)}</code></pre>` +
    `</div></figure>\n`
  );
}

export function fencePlugin(md: MarkdownIt): void {
  // markdown-it-attrs claims every `{…}` it finds in a fence info string and
  // strips it before rendering. Line ranges look exactly like that, so they
  // are lifted out of the info string first — while it is still intact — and
  // parked on the token. Anything else in braces is left for attrs.
  const liftFenceRanges = (state: StateCore): void => {
    for (const token of state.tokens) {
      if (token.type !== "fence" || !token.info) continue;
      const match = RANGE_PATTERN.exec(token.info);
      if (!match) continue;
      token.meta = { ...(token.meta ?? {}), fenceRange: match[0] };
      token.info = token.info.replace(RANGE_PATTERN, "").replace(/\s{2,}/g, " ").trim();
    }
  };

  try {
    md.core.ruler.before("curly_attributes", "fence_options", liftFenceRanges);
  } catch {
    // markdown-it-attrs is not registered, so nothing will eat the braces and
    // running at the end of the core chain is equally correct.
    md.core.ruler.push("fence_options", liftFenceRanges);
  }

  const renderFence = (tokens: Token[], idx: number): string => {
    const token = tokens[idx];
    const range = (token.meta as { fenceRange?: string } | null)?.fenceRange ?? "";
    const info = parseInfo(`${token.info || ""} ${range}`.trim());
    const source = token.content;
    const esc = md.utils.escapeHtml;

    if (MERMAID_LANGS.has(info.lang)) {
      // The source lives in a child element rather than a data attribute:
      // DOMPurify drops any attribute value containing `-->`, and that is the
      // arrow in every Mermaid flowchart.
      return (
        `<figure class="mermaid-block" data-state="pending">` +
        `<pre class="mermaid-source">${esc(source)}</pre>` +
        `<div class="mermaid-target"><div class="lazy-placeholder">Rendering diagram…</div></div>` +
        (info.title ? `<figcaption>${esc(info.title)}</figcaption>` : "") +
        `</figure>\n`
      );
    }

    if (MATH_LANGS.has(info.lang)) {
      return `<div class="math math-display"><code class="math-fallback">${esc(source)}</code></div>\n`;
    }

    return renderCode(md, source, info);
  };

  md.renderer.rules.fence = renderFence;
  // Indented code blocks get the same chrome so the page looks uniform.
  md.renderer.rules.code_block = (tokens, idx) =>
    renderCode(md, tokens[idx].content, { lang: "", title: null, highlights: new Set(), showLineNumbers: false });
}
