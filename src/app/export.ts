import { IN_TAURI, readFileAsDataUrl } from "./bridge.js";

/**
 * Standalone HTML export.
 *
 * The document on screen is already fully rendered — KaTeX markup and Mermaid
 * SVG are inline in the DOM — so exporting is mostly a matter of cloning it
 * and carrying the stylesheets along.
 */

function collectStyles(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) chunks.push(rule.cssText);
    } catch {
      // A stylesheet from another origin cannot be read. Bundled CSS is
      // same-origin, so in practice this only skips injected extras.
    }
  }
  return chunks.join("\n");
}

/**
 * The viewer points local media at `asset:` URLs so the webview can load
 * them; that scheme only resolves inside the webview itself. An export has
 * to stand on its own — opened later, on another machine, or fed to a
 * headless browser for PDF rendering — so local media is re-read from the
 * path the viewer stashed in `data-source-path` and inlined as `data:`.
 */
async function inlineLocalMedia(root: HTMLElement): Promise<void> {
  if (!IN_TAURI) return;
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-source-path]"));
  await Promise.all(
    elements.map(async (el) => {
      const path = el.getAttribute("data-source-path");
      if (!path) return;
      try {
        el.setAttribute("src", await readFileAsDataUrl(path));
      } catch {
        // Leave the broken asset: src in place; better than losing the element.
      }
      el.removeAttribute("data-source-path");
    }),
  );
}

export async function exportStandaloneHtml(content: HTMLElement, title: string): Promise<string> {
  const clone = content.cloneNode(true) as HTMLElement;

  // Viewer-only affordances have no meaning in a static file.
  for (const el of clone.querySelectorAll(
    ".code-copy, .heading-anchor, .lazy-placeholder, .mermaid-source",
  )) {
    el.remove();
  }
  for (const details of clone.querySelectorAll("details")) {
    details.setAttribute("open", "");
  }
  // Any code block still awaiting highlight exports as plain text, which is
  // correct rather than half-styled.
  for (const code of clone.querySelectorAll("code[data-highlight]")) {
    code.removeAttribute("data-highlight");
  }
  await inlineLocalMedia(clone);

  const escapedTitle = title.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MDX">
<title>${escapedTitle}</title>
<style>
${collectStyles()}
body { margin: 0; padding: 2.5rem 1.25rem; background: var(--bg, #fff); }
.markdown-body { margin: 0 auto; max-width: 46rem; }
</style>
</head>
<body class="${document.documentElement.className}">
${clone.outerHTML}
</body>
</html>
`;
}

/** Markdown source with front matter intact — useful for "save a copy". */
export function exportMarkdown(source: string): string {
  return source;
}
