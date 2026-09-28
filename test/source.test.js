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
const fileSet = new Set(
  files.map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("source files are present", () => {
  assert.ok(files.length > 0);
  for (const file of [
    "manifest.json",
    "src/protocol.js",
    "src/context.js",
    "src/background.js",
    "src/deepseek-consent.js",
    "src/deepseek-prefill.js"
  ]) {
    assert.ok(fileSet.has(file), `missing ${file}`);
  }
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

test("the removed popup and monolith content script stay removed", () => {
  for (const file of ["src/popup.html", "src/popup.js", "src/deepseek-content.js"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, file)), `${file} should be gone`);
  }
});

test("the side panel no longer renders a context bar", () => {
  const html = read("src/sidepanel.html");
  assert.ok(!html.includes("contextBar"));
  assert.ok(!html.includes("context-bar"));
});

test("the prefill script reuses the protocol prompt parameter", () => {
  const prefill = read("src/deepseek-prefill.js");
  assert.ok(prefill.includes("DeepSeekProtocol"));
  assert.ok(
    !prefill.includes('PROMPT_PARAM = "q"'),
    "prefill should not redeclare the prompt parameter"
  );
});

test("message types come from the protocol module, not raw literals", () => {
  for (const file of ["src/background.js", "src/sidepanel.js", "src/options.js"]) {
    const text = read(file);
    assert.ok(text.includes("MESSAGES"), `${file} should use MESSAGES`);
    assert.ok(
      !/"SIDE_PANEL_CONTEXT"|"CLOSE_SIDE_PANEL"|"TOGGLE_SIDE_PANEL"/.test(text),
      `${file} should not inline message type literals`
    );
  }
});

test("panel open state comes from getContexts, not a tracked port", () => {
  const background = read("src/background.js");
  assert.ok(background.includes("getContexts"));
  assert.ok(!background.includes("onConnect"));
  assert.ok(!background.includes("SIDE_PANEL_HELLO"));

  const sidepanel = read("src/sidepanel.js");
  assert.ok(!sidepanel.includes("runtime.connect"));
});
