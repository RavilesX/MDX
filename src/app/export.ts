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

export function exportStandaloneHtml(content: HTMLElement, title: string): string {
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
