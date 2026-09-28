importScripts("protocol.js", "context.js");

const { MESSAGES, COMMANDS, CONTEXT_MENUS } = globalThis.DeepSeekProtocol;
const {
  captureActiveTabContext,
  buildPrompt,
  buildDeepSeekUrl,
  storeSidePanelContext
} = globalThis.DeepSeekContext;

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(() => {
  // Migration: earlier versions registered a popup, which would swallow the
  // toolbar click. Clearing it here (rather than on every service worker
  // wake) keeps the click flowing to `action.onClicked`.
  chrome.action.setPopup({ popup: "" });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  createActionContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createActionContextMenu();
});

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

// Toolbar left click always toggles the side panel (with page context).
chrome.action.onClicked.addListener((tab) => {
  toggleSidePanel(tab, true);
});

const COMMAND_HANDLERS = {
  [COMMANDS.TOGGLE_WITH_CONTEXT]: (tab) => toggleSidePanel(tab, true),
  [COMMANDS.TOGGLE_WITHOUT_CONTEXT]: (tab) => toggleSidePanel(tab, false),
  [COMMANDS.OPEN_WINDOW]: (tab) => runCommand(() => openDeepSeekWindow(tab, true)),
  [COMMANDS.OPEN_TAB]: (tab) => runCommand(() => openDeepSeekTab(tab, true))
};

chrome.commands.onCommand.addListener((command, tab) => {
  COMMAND_HANDLERS[command]?.(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENUS.TOGGLE_SIDE_PANEL) {
    toggleSidePanel(tab, true);
  }

  if (info.menuItemId === CONTEXT_MENUS.OPEN_SHORTCUTS_PAGE) {
    runCommand(openShortcutsPage);
  }

  if (info.menuItemId === CONTEXT_MENUS.OPEN_OPTIONS_PAGE) {
    chrome.runtime.openOptionsPage(() => void chrome.runtime.lastError);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case MESSAGES.TOGGLE_SIDE_PANEL:
      toggleSidePanel(sender.tab, message.withContext !== false);
      sendResponse({ ok: true });
      return false;

    case MESSAGES.OPEN_DEEPSEEK_WINDOW:
      respond(sendResponse, openDeepSeekWindow(sender.tab, message.withContext !== false));
      return true;

    case MESSAGES.OPEN_DEEPSEEK_TAB:
      respond(sendResponse, openDeepSeekTab(sender.tab, message.withContext !== false));
      return true;

    case MESSAGES.OPEN_SHORTCUTS_PAGE:
      respond(sendResponse, openShortcutsPage());
      return true;

    case MESSAGES.OPEN_OPTIONS_PAGE:
      chrome.runtime.openOptionsPage(() => {
        sendResponse(
          chrome.runtime.lastError
            ? { ok: false, error: chrome.runtime.lastError.message }
            : { ok: true }
        );
      });
      return true;

    default:
      return false;
  }
});

function respond(sendResponse, promise) {
  promise.then(
    (value) => sendResponse({ ok: true, value }),
    (error) => sendResponse({ ok: false, error: error?.message || String(error) })
  );
}

function createActionContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENUS.TOGGLE_SIDE_PANEL,
      title: "Toggle DeepSeek Side Panel",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: CONTEXT_MENUS.OPEN_SHORTCUTS_PAGE,
      title: "Configure Shortcuts",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: CONTEXT_MENUS.OPEN_OPTIONS_PAGE,
      title: "Extension Options",
      contexts: ["action"]
    });
  });
}

/* ------------------------------------------------------------------ *
 * Side panel toggling
 * ------------------------------------------------------------------ */

/**
 * Toggle the side panel for the tab's window. `withContext` controls whether
 * the current page's URL is prefilled into DeepSeek when opening it.
 *
 * Open state comes from `chrome.runtime.getContexts` (Chrome 116+) instead of
 * hand-tracked state, so it stays correct across service worker restarts.
 */
async function toggleSidePanel(tab, withContext) {
  if (typeof chrome.sidePanel?.open !== "function") return;

  const windowId = tab?.windowId ?? (await resolveSidePanelWindowId());
  if (!windowId) return;

  if (await isSidePanelOpen(windowId)) {
    await closeSidePanel(windowId);
    return;
  }

  // Open before doing any further async work so the user gesture is intact,
  // then hand the panel its context.
  const opening = chrome.sidePanel.open({ windowId });
  attachSidePanelContext(windowId, withContext);
  await opening.catch(() => {});
}

async function isSidePanelOpen(windowId) {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["SIDE_PANEL"],
      windowIds: [windowId]
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function closeSidePanel(windowId) {
  if (typeof chrome.sidePanel?.close === "function") {
    try {
      await chrome.sidePanel.close({ windowId });
      return;
    } catch {
      // Chrome 116-140 have no close(); fall through to the panel page.
    }
  }

  chrome.runtime
    .sendMessage({ type: MESSAGES.CLOSE_SIDE_PANEL, windowId })
    .catch(() => {});
}

async function resolveSidePanelWindowId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) return tab.windowId;

    const focusedWindow = await chrome.windows.getLastFocused({
      windowTypes: ["normal"]
    });
    return focusedWindow?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Capture the origin tab's URL and hand it to the side panel. Best effort: the
 * panel still opens when capture fails or when context is disabled.
 */
async function attachSidePanelContext(windowId, withContext) {
  try {
    const { context, prompt } = await getContextPrompt(windowId, withContext);
    await storeSidePanelContext(windowId, context, prompt);
    chrome.runtime
      .sendMessage({
        type: MESSAGES.SIDE_PANEL_CONTEXT,
        windowId,
        prompt,
        context
      })
      .catch(() => {});
  } catch {
    // Never block opening the panel because of context capture.
  }
}

/* ------------------------------------------------------------------ *
 * Window / tab targets
 * ------------------------------------------------------------------ */

async function getContextPrompt(windowId, withContext) {
  if (!withContext) return { prompt: "", context: null };
  const context = await captureActiveTabContext(windowId);
  return { prompt: buildPrompt(context), context };
}

async function openDeepSeekWindow(tab, withContext) {
  const { prompt } = await getContextPrompt(tab?.windowId, withContext);
  const viewport = await getViewportSize();
  const width = Math.min(980, Math.max(720, Math.round(viewport.width * 0.42)));
  const height = Math.min(960, Math.max(700, Math.round(viewport.height * 0.86)));

  return chrome.windows.create({
    url: buildDeepSeekUrl(prompt),
    type: "popup",
    left: Math.max(0, viewport.width - width - 48),
    top: 48,
    width,
    height,
    focused: true
  });
}

async function openDeepSeekTab(tab, withContext) {
  const { prompt } = await getContextPrompt(tab?.windowId, withContext);
  return chrome.tabs.create({ url: buildDeepSeekUrl(prompt), active: true });
}

async function openShortcutsPage() {
  return chrome.tabs.create({ url: "chrome://extensions/shortcuts", active: true });
}

/**
 * Best-effort size of the area a popup should fit in. Uses the active tab's
 * viewport as a proxy, falling back to a conservative 1440x900.
 */
async function getViewportSize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.width && tab?.height) {
      return { width: tab.width, height: tab.height };
    }
  } catch {
    // Use the default size below.
  }

  return { width: 1440, height: 900 };
}

/** Run a fire-and-forget command, falling back to opening a tab. */
function runCommand(action) {
  action().catch(() => openDeepSeekTab(undefined, true).catch(() => {}));
}
