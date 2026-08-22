import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { renderMarkdown, slugify } from "../src/markdown/renderer.js";

const here = dirname(fileURLToPath(import.meta.url));
const showcase = readFileSync(join(here, "..", "samples", "kitchen-sink.md"), "utf8");

test("slugify produces GitHub-style anchors", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  Spaced   Out  "), "spaced-out");
  assert.equal(slugify("Código en Español"), "codigo-en-espanol");
  assert.equal(slugify("C++ & Rust"), "c-rust");
});

test("front matter is captured, not rendered", () => {
  const result = renderMarkdown("---\ntitle: Test\ntags: [a, b]\n---\n\n# Body\n");
  assert.equal(result.frontMatter?.title, "Test");
  assert.deepEqual(result.frontMatter?.tags, ["a", "b"]);
  assert.ok(!result.html.includes("title: Test"), "front matter leaked into the body");
  assert.ok(result.html.includes("Body"));
});

test("headings are collected in document order", () => {
  const result = renderMarkdown("# One\n\n## Two\n\n### Three\n\n## Two again\n");
  assert.deepEqual(
    result.headings.map((h) => [h.level, h.slug]),
    [
      [1, "one"],
      [2, "two"],
      [3, "three"],
      [2, "two-again"],
    ],
  );
});

test("inline math is recognised but currency is left alone", () => {
  const math = renderMarkdown("The identity $e^{i\\pi}+1=0$ holds.");
  assert.ok(math.html.includes('class="math math-inline"'));

  const price = renderMarkdown("It costs $5 to $10 depending on the day.");
  assert.ok(!price.html.includes("math-inline"), "a price range was parsed as math");
});

test("display math survives across multiple lines", () => {
  const result = renderMarkdown("$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n");
  assert.ok(result.html.includes('class="math math-display"'));
  assert.ok(result.html.includes("\\int_0^1"));
});

test("escaped dollars are not math", () => {
  const result = renderMarkdown("A literal \\$dollar\\$ sign.");
  assert.ok(!result.html.includes("math-inline"));
});

test("mermaid fences become placeholders carrying their source", () => {
  const result = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n");
  assert.ok(result.html.includes('class="mermaid-block"'));
  assert.ok(result.html.includes('data-state="pending"'));
  assert.ok(result.html.includes("flowchart LR"));
  assert.ok(!result.html.includes("<svg"), "a diagram was rendered at parse time");
});

test("diagram and math sources never travel in attributes", () => {
  // DOMPurify removes any attribute whose value contains `-->` or `]>`, so a
  // flowchart arrow or an indexed comparison would be silently erased if the
  // source were stored there. It has to be element text.
  const diagram = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n");
  assert.ok(diagram.html.includes('<pre class="mermaid-source">'));
  assert.ok(!/data-src=/.test(diagram.html), "diagram source is in an attribute");
  assert.ok(diagram.html.includes("A --&gt; B"));

  const math = renderMarkdown("Compare $x[i] > 0$ for all $i$.");
  assert.ok(!/data-tex=/.test(math.html), "TeX is in an attribute");
  assert.ok(math.html.includes('class="math-fallback"'));
});

test("code fences carry language, title and highlighted lines", () => {
  const result = renderMarkdown('```python title="fib.py" {2,4-5}\nx = 1\ny = 2\nz = 3\nw = 4\nv = 5\n```\n');
  assert.ok(result.html.includes('data-lang="python"'));
  assert.ok(result.html.includes("fib.py"));
  assert.ok(result.html.includes("has-gutter"));
  assert.ok(result.html.includes('data-highlight="pending"'));
  assert.equal((result.html.match(/<span class="hl">/g) ?? []).length, 3);
});

test("wiki links and embeds record their target", () => {
  const result = renderMarkdown("See [[Design Notes|the notes]] and ![[diagram.png]].");
  assert.ok(result.html.includes('data-wikilink="Design Notes"'));
  assert.ok(result.html.includes("the notes"));
  assert.ok(result.html.includes('class="wikilink-embed"'));
});

test("tables are wrapped so they scroll instead of the page", () => {
  const result = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n");
  assert.ok(result.html.includes('<div class="table-scroll"><table>'));
  assert.ok(/<\/table>\s*<\/div>/.test(result.html));
});

test("admonitions and GitHub alerts both render", () => {
  const container = renderMarkdown("::: warning Careful\nBody text.\n:::\n");
  assert.ok(container.html.includes("admonition-warning"));
  assert.ok(container.html.includes("Careful"));

  const alert = renderMarkdown("> [!NOTE]\n> Something worth knowing.\n");
  assert.ok(alert.html.includes("markdown-alert"));
});

test("dangerous HTML is preserved for the sanitiser, never executed at parse time", () => {
  const result = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n');
  // The parser passes raw HTML through by design; sanitize.ts is the gate.
  assert.ok(result.html.includes("<script>"), "html:true should let the sanitiser see it");
});

test("statistics reflect the source", () => {
  const result = renderMarkdown("one two three\n\nfour five\n");
  assert.equal(result.stats.words, 5);
  assert.equal(result.stats.readingMinutes, 1);
});

test("the showcase document renders every major feature", () => {
  const result = renderMarkdown(showcase);
  const expectations: Array<[string, string]> = [
    ["footnotes", "footnote-ref"],
    ["task lists", "task-list-item"],
    ["definition lists", "<dl>"],
    ["abbreviations", "<abbr"],
    ["marked text", "<mark>"],
    ["inserted text", "<ins>"],
    ["subscript", "<sub>"],
    ["superscript", "<sup"],
    ["emoji", "🚀"],
    ["alerts", "markdown-alert"],
    ["containers", "admonition"],
    ["math", "math-display"],
    ["diagrams", "mermaid-block"],
    ["code", "code-block"],
    ["tables", "table-scroll"],
    ["custom ids", 'id="custom-anchor"'],
  ];

  for (const [feature, needle] of expectations) {
    assert.ok(result.html.includes(needle), `${feature} missing from the showcase render`);
  }

  assert.ok(result.frontMatter?.title === "MDX feature showcase");
  assert.ok(result.headings.length > 8, "showcase should produce a full outline");
});
