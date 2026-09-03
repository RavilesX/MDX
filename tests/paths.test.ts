import assert from "node:assert/strict";
import test from "node:test";

import { dirName, isAbsolutePath, joinPath, stripFileScheme } from "../src/app/paths.js";

test("joinPath resolves POSIX-relative links", () => {
  assert.equal(joinPath("/home/x/docs", "img/pic.png"), "/home/x/docs/img/pic.png");
  assert.equal(joinPath("/home/x/docs", "../assets/pic.png"), "/home/x/assets/pic.png");
  assert.equal(joinPath("/home/x/docs", "./pic.png"), "/home/x/docs/pic.png");
  assert.equal(joinPath("/home/x/docs", "/abs/pic.png"), "/abs/pic.png");
});

test("joinPath resolves Windows drive-relative links", () => {
  assert.equal(joinPath("C:\\Users\\x\\docs", "img/pic.png"), "C:\\Users\\x\\docs\\img\\pic.png");
  assert.equal(joinPath("C:\\Users\\x\\docs", "../assets/pic.png"), "C:\\Users\\x\\assets\\pic.png");
  assert.equal(joinPath("C:\\Users\\x\\docs", "C:\\abs\\pic.png"), "C:\\abs\\pic.png");
});

test("joinPath resolves UNC-relative links", () => {
  assert.equal(
    joinPath("\\\\srv\\share\\docs", "img/pic.png"),
    "\\\\srv\\share\\docs\\img\\pic.png",
  );
  assert.equal(joinPath("\\\\srv\\share\\docs", "../pic.png"), "\\\\srv\\share\\pic.png");
});

test("dirName matches the platform of the input", () => {
  assert.equal(dirName("/home/x/docs/a.md"), "/home/x/docs");
  assert.equal(dirName("/a.md"), "/");
  assert.equal(dirName("C:\\Users\\x\\docs\\a.md"), "C:\\Users\\x\\docs");
  assert.equal(dirName("C:\\a.md"), "C:\\");
  assert.equal(dirName("\\\\srv\\share\\docs\\a.md"), "\\\\srv\\share\\docs");
  // Node's own path.win32.dirname keeps the trailing separator when the
  // dirname is exactly the share root — mirrored here for consistency.
  assert.equal(dirName("\\\\srv\\share\\a.md"), "\\\\srv\\share\\");
});

test("isAbsolutePath recognises every root form", () => {
  assert.ok(isAbsolutePath("/home/x"));
  assert.ok(isAbsolutePath("C:\\Users\\x"));
  assert.ok(isAbsolutePath("C:/Users/x"));
  assert.ok(isAbsolutePath("\\\\srv\\share"));
  assert.ok(!isAbsolutePath("docs/a.md"));
  assert.ok(!isAbsolutePath("../a.md"));
});

test("stripFileScheme handles POSIX and Windows file URLs", () => {
  assert.equal(stripFileScheme("file:///home/x/a.md"), "/home/x/a.md");
  assert.equal(stripFileScheme("file:///C:/Users/x/a.md"), "C:/Users/x/a.md");
  assert.equal(stripFileScheme("file:///home/x/my%20notes.md"), "/home/x/my notes.md");
  assert.equal(stripFileScheme("/home/x/a.md"), "/home/x/a.md");
});
