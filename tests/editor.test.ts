import assert from "node:assert/strict";
import test from "node:test";

import { sliceLines, spliceLines } from "../src/app/editor.js";

test("sliceLines and spliceLines round-trip a span", () => {
  const src = "a\n\nb\nc\n\nd\n";
  const span = { start: 2, end: 4 };
  assert.equal(sliceLines(src, span), "b\nc");
  assert.equal(spliceLines(src, span, "B"), "a\n\nB\n\nd\n");
  assert.equal(spliceLines(src, span, ""), "a\n\n\nd\n");
});

test("spliceLines keeps CRLF line endings", () => {
  assert.equal(spliceLines("a\r\nb\r\nc", { start: 1, end: 2 }, "x\ny"), "a\r\nx\r\ny\r\nc");
});
