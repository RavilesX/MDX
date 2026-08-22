import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

/**
 * Obsidian / Zettlr style wiki links.
 *
 *   [[Note]]            → link to Note.md next to the current file
 *   [[Note|label]]      → same, custom label
 *   [[Note#Heading]]    → link into a heading
 *   ![[image.png]]      → embed
 *
 * Resolution against the real filesystem happens in the viewer (it needs the
 * open document's directory), so the rule only records the target.
 */

const OPEN = "[[";
const CLOSE = "]]";

function wikilink(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  let pos = state.pos;
  const embed = src.charCodeAt(pos) === 0x21; /* ! */
  if (embed) pos++;

  if (src.slice(pos, pos + 2) !== OPEN) return false;

  const end = src.indexOf(CLOSE, pos + 2);
  if (end < 0 || end > state.posMax) return false;

  const body = src.slice(pos + 2, end);
  if (!body.trim() || body.includes("[[")) return false;

  if (!silent) {
    const pipe = body.indexOf("|");
    const target = (pipe < 0 ? body : body.slice(0, pipe)).trim();
    const label = (pipe < 0 ? body : body.slice(pipe + 1)).trim() || target;

    const token = state.push("wikilink", "", 0);
    token.content = label;
    token.meta = { target, embed };
  }

  state.pos = end + 2;
  return true;
}

export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", wikilink);

  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, embed } = tokens[idx].meta as { target: string; embed: boolean };
    const esc = md.utils.escapeHtml;
    if (embed) {
      return `<img class="wikilink-embed" data-wikilink="${esc(target)}" alt="${esc(tokens[idx].content)}" />`;
    }
    return `<a class="wikilink" data-wikilink="${esc(target)}" href="#">${esc(tokens[idx].content)}</a>`;
  };
}
