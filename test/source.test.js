"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SOURCE_EXTENSIONS = new Set([".js", ".html", ".css", ".json", ".md"]);
const IGNORED_DIRS = new Set(["node_modules", "_metadata", "test"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("source files are present", () => {
  assert.ok(files.length > 0);
  assert.ok(files.some((file) => file.endsWith("manifest.json")));
  assert.ok(files.some((file) => file.endsWith("background.js")));
});

test("no CJK characters anywhere in the source", () => {
  const cjk = /[\u4e00-\u9fff]/;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!cjk.test(text), `CJK found in ${path.relative(ROOT, file)}`);
  }
});

test("the old project name is gone", () => {
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(
      !text.includes("DeepSeek Quick Open"),
      `stale name in ${path.relative(ROOT, file)}`
    );
  }
});

test("the removed popup stays removed", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "popup.html")));
  assert.ok(!fs.existsSync(path.join(ROOT, "src", "popup.js")));
});

test("the side panel no longer renders a context bar", () => {
  const html = read("src/sidepanel.html");
  assert.ok(!html.includes("contextBar"));
  assert.ok(!html.includes("context-bar"));
});

test("context building and prefill share the same prompt parameter", () => {
  const context = read("src/context.js");
  const content = read("src/deepseek-content.js");
  assert.ok(context.includes('PROMPT_PARAM = "q"'));
  assert.ok(content.includes('PROMPT_PARAM = "q"'));
});

test("the background exposes both sidebar toggle commands", () => {
  const background = read("src/background.js");
  assert.ok(background.includes('"open-deepseek-side-panel"'));
  assert.ok(background.includes('"toggle-side-panel-without-context"'));
});
