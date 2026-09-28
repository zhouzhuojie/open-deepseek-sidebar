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
    const keepChannelOpen = handler(message, sender, resolve);
    resolve.keepChannelOpen = keepChannelOpen;
  });
}

test("toolbar click opens the panel and publishes context when closed", async () => {
  const { events, calls, storage, protocol } = loadBackground({
    contexts: [],
    tabs: [TAB]
  });

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();
  await settle();

  assert.equal(calls.sidePanelOpen.length, 1);
  assert.equal(calls.sidePanelOpen[0].windowId, 5);
  assert.equal(calls.sidePanelClose.length, 0);

  const stored = storage["sidePanelContext:5"];
  assert.equal(stored.prompt, "At this page: https://example.com/article, ");
  assert.equal(stored.context.url, TAB.url);

  const published = calls.sendMessage.find(
    (message) => message.type === protocol.MESSAGES.SIDE_PANEL_CONTEXT
  );
  assert.equal(published.windowId, 5);
  assert.equal(published.prompt, stored.prompt);
});

test("toolbar click closes the panel when it is already open", async () => {
  const { events, calls } = loadBackground({ contexts: [{}], tabs: [TAB] });

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();
  await settle();

  assert.equal(calls.sidePanelClose.length, 1);
  assert.equal(calls.sidePanelClose[0].windowId, 5);
  assert.equal(calls.sidePanelOpen.length, 0);
});

test("closing falls back to a message when sidePanel.close is unavailable", async () => {
  const { events, calls, protocol } = loadBackground({
    contexts: [{}],
    tabs: [TAB],
    withSidePanelClose: false
  });

  events.actionClicked.emit({ id: TAB.id, windowId: TAB.windowId });
  await settle();
  await settle();

  assert.equal(calls.sidePanelClose.length, 0);
  assert.ok(
    calls.sendMessage.some(
      (message) =>
        message.type === protocol.MESSAGES.CLOSE_SIDE_PANEL && message.windowId === 5
    )
  );
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
  const { events, calls, protocol } = loadBackground({
    contexts: [],
    tabs: [{ ...TAB, width: 1200, height: 800 }]
  });

  assert.equal(events.command.listeners.length, 1);

  // Both toggle commands open the (closed) panel.
  for (const command of [
    protocol.COMMANDS.TOGGLE_WITH_CONTEXT,
    protocol.COMMANDS.TOGGLE_WITHOUT_CONTEXT
  ]) {
    events.command.emit(command, { windowId: 5 });
  }
  await settle();
  await settle();
  assert.equal(calls.sidePanelOpen.length, 2);

  events.command.emit(protocol.COMMANDS.OPEN_WINDOW, { windowId: 5 });
  await settle();
  await settle();
  assert.equal(calls.windowsCreate.length, 1);

  events.command.emit(protocol.COMMANDS.OPEN_TAB, { windowId: 5 });
  await settle();
  await settle();
  assert.equal(calls.tabsCreate.length, 1);
});

test("OPEN_DEEPSEEK_TAB prefills the active page URL", async () => {
  const { events, calls, protocol } = loadBackground({
    contexts: [],
    tabs: [TAB]
  });

  const response = await callMessageHandler(
    events,
    { type: protocol.MESSAGES.OPEN_DEEPSEEK_TAB, withContext: true },
    { tab: { windowId: 5 } }
  );
  await settle();

  assert.equal(calls.tabsCreate.length, 1);
  const [created] = calls.tabsCreate;
  assert.match(created.url, /^https:\/\/chat\.deepseek\.com\/a\/chat\?q=/);
  assert.equal(created.active, true);
  assert.equal(response.ok, true);
});

test("OPEN_DEEPSEEK_TAB without context opens the bare DeepSeek URL", async () => {
  const { events, calls, protocol } = loadBackground({
    contexts: [],
    tabs: [TAB]
  });

  await callMessageHandler(
    events,
    { type: protocol.MESSAGES.OPEN_DEEPSEEK_TAB, withContext: false },
    { tab: { windowId: 5 } }
  );
  await settle();

  assert.equal(calls.tabsCreate[0].url, "https://chat.deepseek.com/");
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
