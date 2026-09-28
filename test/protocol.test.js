"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadContext } = require("./helpers/load-context.js");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);

test("protocol exposes the shared prompt parameter", () => {
  const { protocol } = loadContext();
  assert.equal(protocol.PROMPT_PARAM, "q");
});

test("context reuses the protocol prompt parameter", () => {
  const { api, protocol } = loadContext();
  assert.equal(api.PROMPT_PARAM, protocol.PROMPT_PARAM);
});

test("message types are frozen, unique, non-empty strings", () => {
  const { protocol } = loadContext();
  const values = Object.values(protocol.MESSAGES);

  assert.ok(Object.isFrozen(protocol.MESSAGES));
  assert.ok(values.length > 0);
  for (const value of values) {
    assert.equal(typeof value, "string");
    assert.ok(value.length > 0);
  }
  assert.equal(new Set(values).size, values.length, "duplicate message type");
});

test("command ids match the manifest commands exactly", () => {
  const { protocol } = loadContext();
  assert.deepEqual(
    Object.values(protocol.COMMANDS).sort(),
    Object.keys(manifest.commands).sort()
  );
});

test("context menu ids are defined and unique", () => {
  const { protocol } = loadContext();
  const values = Object.values(protocol.CONTEXT_MENUS);
  assert.equal(new Set(values).size, values.length);
});
