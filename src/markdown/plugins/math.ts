import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

/**
 * Math support without pulling KaTeX into the parse step.
 *
 * The rules below only *find* math and emit a placeholder carrying the raw
 * TeX in a data attribute. `renderMath()` in ../lazy.ts walks those
 * placeholders after the document is already on screen and swaps in the
 * typeset output, so a document with no math never loads KaTeX at all.
 *
 * Recognised delimiters:
 *   inline   $x$        \(x\)
 *   display  $$x$$      \[x\]      (also inline-position $$x$$)
 */

const DOLLAR = 0x24; // $
const BACKSLASH = 0x5c; // \
const PAREN_OPEN = 0x28; // (
const BRACKET_OPEN = 0x5b; // [

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a;
}

/** `$` may be escaped as `\$`; count preceding backslashes to know. */
function isEscaped(src: string, pos: number): boolean {
  let backslashes = 0;
  while (pos - backslashes - 1 >= 0 && src.charCodeAt(pos - backslashes - 1) === BACKSLASH) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/** Find the closing run of `$` of exactly `len`, skipping escaped ones. */
function findCloser(src: string, start: number, max: number, len: number): number {
  let pos = start;
  while (pos < max) {
    const code = src.charCodeAt(pos);
    if (code === BACKSLASH) {
      pos += 2;
      continue;
    }
    if (code !== DOLLAR) {
      pos++;
      continue;
    }
    let run = 0;
    while (pos + run < max && src.charCodeAt(pos + run) === DOLLAR) run++;
    if (run === len) return pos;
    pos += run;
  }
  return -1;
}

function inlineMath(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  const max = state.posMax;
  const code = src.charCodeAt(start);

  // \( ... \)  and  \[ ... \]
  if (code === BACKSLASH) {
    const next = src.charCodeAt(start + 1);
    if (next !== PAREN_OPEN && next !== BRACKET_OPEN) return false;
    const display = next === BRACKET_OPEN;
    const closer = display ? "\\]" : "\\)";
    const end = src.indexOf(closer, start + 2);
    if (end < 0 || end >= max) return false;
    if (!silent) {
      const token = state.push(display ? "math_block" : "math_inline", "", 0);
      token.markup = display ? "\\[" : "\\(";
      token.content = src.slice(start + 2, end);
    }
    state.pos = end + 2;
    return true;
  }

  if (code !== DOLLAR) return false;
  if (isEscaped(src, start)) return false;

  let openLen = 0;
  while (start + openLen < max && src.charCodeAt(start + openLen) === DOLLAR) openLen++;
  if (openLen > 2) return false;

  // `$ x $` is prose about money, not math. Require a non-space after the
  // opening delimiter for the single-dollar form.
  if (openLen === 1) {
    const after = src.charCodeAt(start + 1);
    if (Number.isNaN(after) || isSpace(after)) return false;
  }

  const closeStart = findCloser(src, start + openLen, max, openLen);
  if (closeStart < 0) return false;

  const content = src.slice(start + openLen, closeStart);
  if (!content.trim()) return false;

  if (openLen === 1) {
    // Closing `$` must not follow whitespace, and must not be glued to a
    // digit — that pattern is a price range like `$5 to $10`.
    if (isSpace(src.charCodeAt(closeStart - 1))) return false;
    const after = src.charCodeAt(closeStart + 1);
    if (after >= 0x30 && after <= 0x39) return false;
  }

  if (!silent) {
    const token = state.push(openLen === 2 ? "math_block" : "math_inline", "", 0);
    token.markup = openLen === 2 ? "$$" : "$";
    token.content = content;
  }
  state.pos = closeStart + openLen;
  return true;
}

/** Multi-line `$$ … $$` fences, including the `\[ … \]` block spelling. */
function blockMath(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent > 3) return false;

  const firstLine = state.src.slice(start, max);
  let opener: string;
  let closer: string;
  if (firstLine.startsWith("$$")) {
    opener = "$$";
    closer = "$$";
  } else if (firstLine.startsWith("\\[")) {
    opener = "\\[";
    closer = "\\]";
  } else {
    return false;
  }

  let content = firstLine.slice(opener.length);
  let closed = content.trimEnd().endsWith(closer) && content.trim().length > closer.length;
  let lastLine = startLine;

  if (closed) {
    content = content.trimEnd().slice(0, -closer.length);
  } else {
    const parts: string[] = content ? [content] : [];
    let line = startLine;
    while (++line < endLine) {
      const lineStart = state.bMarks[line] + state.tShift[line];
      const lineEnd = state.eMarks[line];
      const text = state.src.slice(lineStart, lineEnd);
      if (text.trimEnd().endsWith(closer)) {
        parts.push(text.trimEnd().slice(0, -closer.length));
        closed = true;
        lastLine = line;
        break;
      }
      parts.push(text);
    }
    if (!closed) return false;
    content = parts.join("\n");
  }

  if (silent) return true;

  const token = state.push("math_block", "", 0);
  token.block = true;
  token.markup = opener;
  token.content = content.trim();
  token.map = [startLine, lastLine + 1];
  state.line = lastLine + 1;
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", inlineMath);
  md.block.ruler.before("fence", "math_block", blockMath, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  // The TeX is carried as the text of a `.math-fallback` child rather than in
  // a data attribute. DOMPurify strips attribute values containing sequences
  // like `-->` or `]>`, both of which occur in ordinary TeX, and the child
  // doubles as what the reader sees if KaTeX never loads.
  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math math-inline">` +
    `<code class="math-fallback">${md.utils.escapeHtml(tokens[idx].content)}</code></span>`;

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math-display">` +
    `<code class="math-fallback">${md.utils.escapeHtml(tokens[idx].content)}</code></div>\n`;
}
