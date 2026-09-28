"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);

test("manifest is MV3 and branded", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Open DeepSeek Sidebar");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("manifest uses only the minimal permissions", () => {
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["contextMenus", "declarativeNetRequest", "sidePanel", "storage", "tabs"].sort()
  );
});

test("manifest declares no default popup so left click can toggle", () => {
  assert.equal(manifest.action.default_popup, undefined);
});

test("manifest declares both sidebar toggle commands", () => {
  const commands = manifest.commands;
  assert.ok(commands["open-deepseek-side-panel"]);
  assert.ok(commands["toggle-side-panel-without-context"]);
});

test("manifest uses at most 4 suggested keys (Chrome limit)", () => {
  const withKeys = Object.values(manifest.commands).filter((c) => c.suggested_key);
  assert.ok(withKeys.length <= 4, `${withKeys.length} suggested keys`);
});

test("manifest uses Ctrl+Q / Ctrl+Shift+Q defaults for the toggles", () => {
  assert.equal(
    manifest.commands["open-deepseek-side-panel"].suggested_key.default,
    "Ctrl+Q"
  );
  assert.equal(
    manifest.commands["toggle-side-panel-without-context"].suggested_key.default,
    "Ctrl+Shift+Q"
  );
});

test("content scripts load protocol first, then consent and prefill", () => {
  const [script] = manifest.content_scripts;
  assert.deepEqual(script.matches, ["https://chat.deepseek.com/*"]);
  assert.equal(script.all_frames, true);
  assert.equal(script.run_at, "document_start");
  assert.deepEqual(script.js, [
    "src/protocol.js",
    "src/deepseek-consent.js",
    "src/deepseek-prefill.js"
  ]);
});

test("manifest declares the minimum Chrome version the APIs need", () => {
  assert.equal(manifest.minimum_chrome_version, "116");
});

test("host permissions stay scoped to deepseek.com", () => {
  assert.deepEqual(manifest.host_permissions, [
    "https://deepseek.com/*",
    "https://*.deepseek.com/*"
  ]);
});

test("the DNR rule only rewrites sub-frame headers", () => {
  const rules = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "rules", "deepseek-frame-headers.json"),
      "utf8"
    )
  );

  assert.deepEqual(rules[0].condition.resourceTypes, ["sub_frame"]);
  assert.deepEqual(
    rules[0].action.responseHeaders.map((header) => header.header).sort(),
    ["content-security-policy", "x-frame-options"]
  );
});

test("every file referenced by the manifest exists", () => {
  const refs = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((script) => script.js),
    ...manifest.declarative_net_request.rule_resources.map((rule) => rule.path)
  ];

  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(ROOT, ref)), `missing file: ${ref}`);
  }
});
