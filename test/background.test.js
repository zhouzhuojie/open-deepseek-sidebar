"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground, settle } = require("./helpers/load-background.js");

const TAB = {
  id: 1,
  windowId: 5,
  url: "https://example.com/article",
  title: "Article"
};

function callMessageHandler(events, message, sender) {
  const handler = events.message.listeners[0];
  return new Promise((resolve) => {
    handler(message, sender, resolve);
  });
}

test("toolbar click opens the panel synchronously, then publishes context", async () => {
  const { events, calls, storage, protocol } = loadBackground({
    contexts: [],
    tabs: [TAB]
  });

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });

  // Regression guard: sidePanel.open() must be called *inside* the gesture.
  // If a future change awaits before opening, this assertion fails.
  assert.equal(calls.sidePanelOpen.length, 1);
  assert.equal(calls.sidePanelOpen[0].windowId, 5);

  await settle();
  await settle();

  const stored = storage["sidePanelContext:5"];
  assert.equal(stored.prompt, "At this page: https://example.com/article, ");
  assert.equal(stored.context.url, TAB.url);

  const published = calls.sendMessage.find(
    (message) => message.type === protocol.MESSAGES.SIDE_PANEL_CONTEXT
  );
  assert.equal(published.windowId, 5);
  assert.equal(published.prompt, stored.prompt);
});

test("toolbar click closes the panel when the cache says it is open", async () => {
  const { events, calls } = loadBackground({
    contexts: [{ windowId: 5 }],
    tabs: [TAB]
  });

  // Let the getContexts hydration finish.
  await settle();

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });

  assert.equal(calls.sidePanelClose.length, 1);
  assert.equal(calls.sidePanelClose[0].windowId, 5);
  assert.equal(calls.sidePanelOpen.length, 0);
});

test("closing falls back to a message when sidePanel.close is unavailable", async () => {
  const { events, calls, protocol } = loadBackground({
    contexts: [{ windowId: 5 }],
    tabs: [TAB],
    withSidePanelClose: false
  });

  await settle();
  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();

  assert.equal(calls.sidePanelClose.length, 0);
  assert.ok(
    calls.sendMessage.some(
      (message) =>
        message.type === protocol.MESSAGES.CLOSE_SIDE_PANEL && message.windowId === 5
    )
  );
});

test("the onClosed event evicts a window from the cache", async () => {
  const { events, calls } = loadBackground({
    contexts: [{ windowId: 5 }],
    tabs: [TAB]
  });

  await settle();
  events.sidePanelClosed.emit({ windowId: 5 });
  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });

  // Evicted, so the toggle opens again rather than closing.
  assert.equal(calls.sidePanelOpen.length, 1);
  assert.equal(calls.sidePanelClose.length, 0);
});

test("a slow hydration does not clobber a toggle that raced it", async () => {
  const { events, calls } = loadBackground({ contexts: [], tabs: [TAB] });

  // Click before the initial getContexts hydration has resolved.
  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  assert.equal(calls.sidePanelOpen.length, 1);

  // The stale hydration result lands here and must be ignored.
  await settle();

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  assert.equal(calls.sidePanelClose.length, 1);
});

test("a failed open rolls back the optimistic cache entry", async () => {  const { events, calls, chrome } = loadBackground({ contexts: [], tabs: [TAB] });
  chrome.sidePanel.open = async () => {
    throw new Error("no user gesture");
  };
  calls.sidePanelOpen.length = 0;

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();
  await settle();

  // Cache rolled back, so a second click tries to open again (not close).
  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();
  assert.equal(calls.sidePanelClose.length, 0);
});

test("the context-free command stores an empty prompt", async () => {
  const { events, storage, calls, protocol } = loadBackground({
    contexts: [],
    tabs: [TAB]
  });

  events.command.emit(protocol.COMMANDS.TOGGLE_WITHOUT_CONTEXT, {
    windowId: 5
  });
  await settle();
  await settle();

  assert.equal(storage["sidePanelContext:5"].prompt, "");
  const published = calls.sendMessage.find(
    (message) => message.type === protocol.MESSAGES.SIDE_PANEL_CONTEXT
  );
  assert.equal(published.prompt, "");
});

test("every declared command is routed to a handler", async () => {
  const { events, calls, protocol } = loadBackground({ contexts: [], tabs: [TAB] });

  assert.equal(events.command.listeners.length, 1);
  assert.deepEqual(Object.values(protocol.COMMANDS).sort(), [
    "open-deepseek-side-panel",
    "toggle-side-panel-without-context"
  ]);

  // Distinct windows so each toggle is treated as "closed -> open".
  events.command.emit(protocol.COMMANDS.TOGGLE_WITH_CONTEXT, { windowId: 5 });
  events.command.emit(protocol.COMMANDS.TOGGLE_WITHOUT_CONTEXT, { windowId: 6 });
  assert.equal(calls.sidePanelOpen.length, 2);

  await settle();
  await settle();
});

test("OPEN_SHORTCUTS_PAGE opens the browser shortcuts page", async () => {
  const { events, calls, protocol } = loadBackground({ contexts: [], tabs: [TAB] });

  const response = await callMessageHandler(
    events,
    { type: protocol.MESSAGES.OPEN_SHORTCUTS_PAGE },
    {}
  );
  await settle();

  assert.equal(calls.tabsCreate.length, 1);
  assert.equal(calls.tabsCreate[0].url, "chrome://extensions/shortcuts");
  assert.equal(response.ok, true);
});

test("install clears any legacy popup and registers the action menus", () => {
  const { events, calls, protocol } = loadBackground();

  events.installed.emit();

  assert.equal(calls.setPopup.length, 1);
  assert.equal(calls.setPopup[0].popup, "");
  assert.deepEqual(
    calls.contextMenusCreate.map((menu) => menu.id).sort(),
    Object.values(protocol.CONTEXT_MENUS).sort()
  );
});

test("install and startup never register duplicate context menu ids", () => {
  const { events, calls, protocol } = loadBackground();

  // Both lifecycle events can fire during the same service worker lifetime.
  // In Chrome the two removeAll/create sequences interleave and the second
  // create produces "Cannot create item with duplicate id ...". Registration
  // must be serialized so each id is created once.
  events.installed.emit();
  events.startup.emit();

  const ids = calls.contextMenusCreate.map((menu) => menu.id);
  assert.deepEqual(ids, Object.values(protocol.CONTEXT_MENUS));
  assert.equal(new Set(ids).size, ids.length, "menu ids must be unique");
});
