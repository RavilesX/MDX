import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import container from "markdown-it-container";

/**
 * Admonition blocks in the `::: note Title` spelling used by MkDocs,
 * Docusaurus, VitePress and pandoc-style docs. GitHub's `> [!NOTE]` syntax is
 * handled separately by markdown-it-github-alerts; both end up with the same
 * `.admonition` markup so one stylesheet covers them.
 */

const KINDS: Record<string, { icon: string; label: string }> = {
  note: { icon: "note", label: "Note" },
  info: { icon: "note", label: "Info" },
  tip: { icon: "tip", label: "Tip" },
  hint: { icon: "tip", label: "Hint" },
  success: { icon: "tip", label: "Success" },
  important: { icon: "important", label: "Important" },
  warning: { icon: "warning", label: "Warning" },
  caution: { icon: "warning", label: "Caution" },
  danger: { icon: "danger", label: "Danger" },
  error: { icon: "danger", label: "Error" },
  bug: { icon: "danger", label: "Bug" },
  question: { icon: "question", label: "Question" },
  faq: { icon: "question", label: "FAQ" },
  quote: { icon: "quote", label: "Quote" },
  example: { icon: "example", label: "Example" },
  abstract: { icon: "example", label: "Abstract" },
  summary: { icon: "example", label: "Summary" },
};

export function containersPlugin(md: MarkdownIt): void {
  for (const [name, meta] of Object.entries(KINDS)) {
    md.use(container, name, {
      render(tokens: Token[], idx: number) {
        const token = tokens[idx];
        if (token.nesting !== 1) return "</div></details>\n";
        // `::: warning Custom title` — everything after the keyword is a title.
        const rest = token.info.trim().slice(name.length).trim();
        const collapsible = rest.startsWith("-") || rest.startsWith("+");
        const title = md.utils.escapeHtml((collapsible ? rest.slice(1).trim() : rest) || meta.label);
        const open = !collapsible || rest.startsWith("+") ? " open" : "";
        return (
          `<details class="admonition admonition-${meta.icon}"${open}${collapsible ? "" : ' data-static="true"'}>` +
          `<summary class="admonition-title">${title}</summary>` +
          `<div class="admonition-body">`
        );
      },
    });
  }

  // `::: details Summary` — a plain collapsible section.
  md.use(container, "details", {
    render(tokens: Token[], idx: number) {
      const token = tokens[idx];
      if (token.nesting !== 1) return "</div></details>\n";
      const title = md.utils.escapeHtml(token.info.trim().slice("details".length).trim() || "Details");
      return `<details class="collapse"><summary>${title}</summary><div class="collapse-body">`;
    },
  });
}
