import DOMPurify from "dompurify";

/**
 * MDX opens files it did not write, so every byte of rendered HTML goes
 * through here before it touches the DOM. `html: true` in markdown-it means a
 * document can carry `<script>` or `<img onerror=…>`; this is the gate that
 * drops them. The webview CSP is a second layer, not a substitute.
 */

/**
 * Note what is *not* here: the Mermaid and TeX sources. DOMPurify removes any
 * attribute whose value contains `-->` or `]>` as an mXSS guard, and both
 * appear in ordinary diagram and formula source, so those travel as element
 * text instead.
 */
const ALLOWED_DATA_ATTRS = [
  "data-lang",
  "data-highlight",
  "data-wikilink",
  "data-action",
  "data-state",
  "data-static",
  "data-line",
  "data-footnote-ref",
];

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;

    // Anything that would navigate the webview away is neutralised here; the
    // viewer intercepts clicks and routes them itself (external → browser,
    // local file → open in place, anchor → scroll).
    if (node.tagName === "A") {
      const href = node.getAttribute("href");
      if (href && /^\s*(javascript|data|vbscript):/i.test(href)) {
        node.removeAttribute("href");
      }
      node.removeAttribute("target");
      node.removeAttribute("ping");
    }

    // Task-list checkboxes are the only inputs a document may contain, and
    // they stay read-only: this is a viewer, not an editor.
    if (node.tagName === "INPUT") {
      if (node.getAttribute("type") !== "checkbox") {
        node.remove();
        return;
      }
      node.setAttribute("disabled", "");
    }

    if (node.tagName === "IMG" || node.tagName === "VIDEO" || node.tagName === "AUDIO") {
      node.setAttribute("loading", "lazy");
    }
  });
}

export function sanitizeHtml(dirty: string): string {
  configure();
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_TAGS: ["figure", "figcaption", "details", "summary", "kbd", "mark", "ins", "abbr", "video", "audio", "source", "track"],
    ADD_ATTR: [...ALLOWED_DATA_ATTRS, "controls", "loop", "muted", "playsinline", "poster", "colspan", "rowspan", "align", "start", "reversed", "open"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "base", "link", "meta", "noscript", "template"],
    FORBID_ATTR: ["srcset", "formaction", "xlink:href", "action"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
  });
}

/** Mermaid emits its own SVG; it is generated locally but still sanitised. */
export function sanitizeSvg(dirty: string): string {
  configure();
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
    ADD_ATTR: ["viewBox", "preserveAspectRatio", "xmlns"],
  });
}
