/**
 * Print layout for tables.
 *
 * A table cannot scroll on paper, so its cells may break anywhere (see the
 * print rules in markdown.css). The browser then shares the page out in
 * proportion to each column's content, and one long-text column squeezes the
 * five-digit id next to it down to two characters a line. A column with an
 * explicit width is served first, at that width, so pinning the short columns
 * to their natural size leaves only the text columns to absorb the squeeze.
 */

/** Widest content, in em, a column may have and still be pinned (~15 characters). */
const PIN_MAX_EM = 8;
// ponytail: assumes a page ~45em wide (A4/Letter at the default font scale).
// A larger scale fits fewer em; the browser then shrinks the pinned columns
// too instead of cutting anything off. Measure the page if that ever matters.
const PAGE_EM = 45;
/** Room every column too wide to pin must keep, padding included. */
const TEXT_COLUMN_EM = 6;
/** Horizontal padding and border of one cell. */
const CELL_CHROME_EM = 1.5;
/** Covers rounding and the font metrics of whichever browser prints. */
const SLACK_EM = 0.2;

/**
 * Picks the columns to pin from their natural content widths in em: narrowest
 * first, for as long as the text columns keep a readable share of the page.
 */
export function pickPinned(widths: number[]): Set<number> {
  const pinned = new Set<number>();
  const order = widths.map((_, i) => i).sort((a, b) => widths[a]! - widths[b]!);
  let room = PAGE_EM - widths.filter((width) => !(width <= PIN_MAX_EM)).length * TEXT_COLUMN_EM;
  for (const i of order) {
    const width = widths[i]!;
    room -= width + CELL_CHROME_EM;
    // A table that is not laid out (inside a closed <details>) measures as 0.
    if (!(width > 0) || width > PIN_MAX_EM || room < 0) break;
    pinned.add(i);
  }
  return pinned;
}

/**
 * Measures every table under `root` and records the columns to pin as `--pin`
 * on its first-row cells, which only the print stylesheet reads.
 */
export function pinShortColumns(root: HTMLElement): void {
  for (const table of root.querySelectorAll("table")) {
    const cells = Array.from(table.rows[0]?.cells ?? []);
    // Unwrapped, each column is exactly as wide as its widest cell.
    table.style.whiteSpace = "nowrap";
    const widths = cells.map((cell) => {
      if (cell.colSpan > 1) return Infinity;
      const style = getComputedStyle(cell);
      const content = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return content / parseFloat(style.fontSize);
    });
    table.style.whiteSpace = "";

    const pinned = pickPinned(widths);
    cells.forEach((cell, i) => {
      if (pinned.has(i)) cell.style.setProperty("--pin", `${(widths[i]! + SLACK_EM).toFixed(2)}em`);
      else cell.style.removeProperty("--pin");
    });
  }
}
