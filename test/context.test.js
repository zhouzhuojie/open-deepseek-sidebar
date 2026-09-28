"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadContext, createChromeMock } = require("./helpers/load-context.js");

const TAB = {
  id: 1,
  windowId: 5,
  url: "https://example.com/page?x=1",
  title: "Example"
};

test("captureActiveTabContext returns the active tab URL", async () => {
  const { api } = loadContext({ chrome: createChromeMock({ tabs: [TAB] }) });
  const context = await api.captureActiveTabContext(5);

  assert.equal(context.url, TAB.url);
  assert.equal(context.title, TAB.title);
  assert.equal(context.tabId, TAB.id);
  assert.equal(context.windowId, TAB.windowId);
});

test("captureActiveTabContext ignores non-http tabs", async () => {
  const { api } = loadContext({
    chrome: createChromeMock({
      tabs: [{ id: 2, windowId: 5, url: "chrome://extensions", title: "" }]
    })
  });

  assert.equal(await api.captureActiveTabContext(5), null);
});

test("captureActiveTabContext returns null when there is no tab", async () => {
  const { api } = loadContext({ chrome: createChromeMock({ tabs: [] }) });
  assert.equal(await api.captureActiveTabContext(5), null);
});

test("captureActiveTabContext returns null when tabs.query throws", async () => {
  const chrome = createChromeMock();
  chrome.tabs.query = async () => {
    throw new Error("no access");
  };
  const { api } = loadContext({ chrome });
  assert.equal(await api.captureActiveTabContext(5), null);
});

test("buildPrompt produces 'At this page: <url>, ' with a trailing space", () => {
  const { api } = loadContext();
  const prompt = api.buildPrompt({ url: "https://example.com/a" });

  assert.equal(prompt, "At this page: https://example.com/a, ");
  assert.ok(prompt.endsWith(" "));
});

test("buildPrompt returns an empty string without a usable URL", () => {
  const { api } = loadContext();

  assert.equal(api.buildPrompt(null), "");
  assert.equal(api.buildPrompt({}), "");
  assert.equal(api.buildPrompt({ url: "   " }), "");
});

test("buildDeepSeekUrl returns the bare URL when there is no prompt", () => {
  const { api } = loadContext();

  assert.equal(api.buildDeepSeekUrl(""), "https://chat.deepseek.com/");
  assert.equal(api.buildDeepSeekUrl("   "), "https://chat.deepseek.com/");
  assert.equal(api.buildDeepSeekUrl(null), "https://chat.deepseek.com/");
});

test("buildDeepSeekUrl round-trips a prompt with a trailing space", () => {
  const { api } = loadContext();
  const prompt = "At this page: https://example.com/a, ";
  const parsed = new URL(api.buildDeepSeekUrl(prompt));

  assert.equal(parsed.pathname, "/a/chat");
  assert.equal(parsed.searchParams.get("q"), prompt);
  assert.ok(api.buildDeepSeekUrl(prompt).endsWith("+"));
});

test("side panel context is stored and consumed exactly once", async () => {
  const { api } = loadContext();
  const context = { url: "https://example.com/a" };
  const prompt = api.buildPrompt(context);

  await api.storeSidePanelContext(5, context, prompt);

  const first = await api.consumeSidePanelContext(5);
  assert.equal(first.prompt, prompt);
  assert.equal(first.context.url, context.url);

  assert.equal(await api.consumeSidePanelContext(5), null);
});

test("side panel context is keyed per window", async () => {
  const { api } = loadContext();

  await api.storeSidePanelContext(1, null, "window one");
  await api.storeSidePanelContext(2, null, "window two");

  assert.equal((await api.consumeSidePanelContext(1)).prompt, "window one");
  assert.equal((await api.consumeSidePanelContext(2)).prompt, "window two");
});

test("stale side panel context is dropped", async () => {
  const storage = {};
  const { api } = loadContext({ chrome: createChromeMock({ storage }) });

  const key = "sidePanelContext:7";
  storage[key] = { prompt: "old", context: null, updatedAt: Date.now() - 10 * 60 * 1000 };

  assert.equal(await api.consumeSidePanelContext(7), null);
});
