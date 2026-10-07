import assert from "node:assert/strict";
import test from "node:test";

import { pickPinned } from "../src/app/table-fit.js";

test("pickPinned pins the short columns beside a long-text one", () => {
  // #, TC, AC, Severity, Report, Outcome
  assert.deepEqual([...pickPinned([1, 3, 2.5, 4.5, 7.6, 60])].sort(), [0, 1, 2, 3, 4]);
});

test("pickPinned leaves a table too wide for the page alone", () => {
  assert.equal(pickPinned([...Array(14).fill(17), 6.5]).size, 0);
});

test("pickPinned skips tables that are not laid out and spanned headers", () => {
  assert.equal(pickPinned([0, 0, 0]).size, 0);
  assert.deepEqual([...pickPinned([Infinity, 3])], [1]);
});
