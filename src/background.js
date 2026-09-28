importScripts("context.js");

const {
  captureActiveTabContext,
  buildPrompt,
  buildDeepSeekUrl,
  storeSidePanelContext
} = globalThis.DeepSeekContext;

// Windows whose side panel is currently open, tracked via the panel's port.
const openSidePanelWindows = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") return;

  let connectedWindowId = null;

  port.onMessage.addListener((message) => {
    if (
      message?.type === "SIDE_PANEL_HELLO" &&
      typeof message.windowId === "number"
    ) {
      connectedWindowId = message.windowId;
      openSidePanelWindows.add(connectedWindowId);
    }
  });

  port.onDisconnect.addListener(() => {
    if (connectedWindowId != null) {
      openSidePanelWindows.delete(connectedWindowId);
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  createActionContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createActionContextMenu();
});

// Ensure a left click toggles the panel instead of opening a popup (the old
// versions registered one dynamically).
chrome.action.setPopup({ popup: "" });

// Toolbar left click always toggles the side panel (with page context).
chrome.action.onClicked.addListener((tab) => {
  toggleSidePanel(tab, true);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-deepseek-side-panel") {
    toggleSidePanel(tab, true);
  }

  if (command === "toggle-side-panel-without-context") {
    toggleSidePanel(tab, false);
  }

  if (command === "open-deepseek-window") {
    runCommand(() => openDeepSeekWindow(tab, true));
  }

  if (command === "open-deepseek-tab") {
    runCommand(() => openDeepSeekTab(tab, true));
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggle-side-panel") {
    toggleSidePanel(tab, true);
  }

  if (info.menuItemId === "open-shortcuts-page") {
    openShortcutsPage();
  }

  if (info.menuItemId === "open-options-page") {
    chrome.runtime.openOptionsPage();
  }
});

function createActionContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "toggle-side-panel",
      title: "Toggle DeepSeek Side Panel",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "open-shortcuts-page",
      title: "Configure Shortcuts",
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: "open-options-page",
      title: "Extension Options",
      contexts: ["action"]
    });
  });
}

/**
 * Toggle the side panel for the tab's window. `withContext` controls whether
 * the current page's URL is prefilled into DeepSeek when opening it.
 *
 * There is no "is open" API. The side panel page opens a port on load and the
 * port disconnects when the panel closes, so this set stays in sync while the
 * service worker is alive. It is also updated optimistically on open/close.
 */
function toggleSidePanel(tab, withContext) {
  if (typeof chrome.sidePanel?.open !== "function") return;

  const windowId = tab?.windowId;
  if (!windowId) {
    openSidePanel(undefined, withContext).catch(() => {});
    return;
  }

  if (openSidePanelWindows.has(windowId)) {
    closeSidePanel(windowId);
    return;
  }

  openSidePanelInWindow(windowId, withContext);
}

function openSidePanelInWindow(windowId, withContext) {
  openSidePanelWindows.add(windowId);
  // Open first so the user gesture is still active, then capture context.
  chrome.sidePanel.open({ windowId }).catch(() => {
    // Keep the optimistic state so the next toggle can close a panel that was
    // already open.
  });
  attachSidePanelContext(windowId, withContext);
}

async function closeSidePanel(windowId) {
  openSidePanelWindows.delete(windowId);

  if (typeof chrome.sidePanel?.close === "function") {
    try {
      await chrome.sidePanel.close({ windowId });
      return;
    } catch {
      // Fall through to asking the page to close itself.
    }
  }

  chrome.runtime
    .sendMessage({ type: "CLOSE_SIDE_PANEL", windowId })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TOGGLE_SIDE_PANEL") {
    toggleSidePanel(sender.tab, message.withContext !== false);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "OPEN_DEEPSEEK_WINDOW") {
    openDeepSeekWindow(sender.tab, message.withContext !== false)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "OPEN_DEEPSEEK_TAB") {
    openDeepSeekTab(sender.tab, message.withContext !== false)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "OPEN_SHORTCUTS_PAGE") {
    openShortcutsPage()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "OPEN_OPTIONS_PAGE") {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  return false;
});

async function openSidePanel(windowId, withContext) {
  if (typeof chrome.sidePanel?.open !== "function") {
    throw new Error("Side panel API is not available.");
  }

  const resolvedWindowId = await resolveSidePanelWindowId(windowId);
  if (!resolvedWindowId) {
    throw new Error("No focused browser window found.");
  }

  openSidePanelInWindow(resolvedWindowId, withContext);
  return { ok: true };
}

async function resolveSidePanelWindowId(windowId) {
  if (windowId) return windowId;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId) return tab.windowId;

  const focusedWindow = await chrome.windows.getLastFocused({
    windowTypes: ["normal"]
  });
  return focusedWindow?.id ?? null;
}

/**
 * Capture the origin tab's URL and hand it to the side panel. Best effort: the
 * panel still opens when capture fails or when context is disabled.
 */
async function attachSidePanelContext(windowId, withContext) {
  try {
    const context = withContext ? await captureActiveTabContext(windowId) : null;
    const prompt = withContext ? buildPrompt(context) : "";
    await storeSidePanelContext(windowId, context, prompt);
    chrome.runtime
      .sendMessage({ type: "SIDE_PANEL_CONTEXT", windowId, prompt, context })
      .catch(() => {});
  } catch {
    // Never block opening the panel because of context capture.
  }
}

async function getContextPrompt(windowId, withContext) {
  if (!withContext) return { prompt: "", context: null };
  const context = await captureActiveTabContext(windowId);
  return { prompt: buildPrompt(context), context };
}

async function openDeepSeekWindow(tab, withContext) {
  const { prompt } = await getContextPrompt(tab?.windowId, withContext);
  const display = await getDisplaySize();
  const width = Math.min(980, Math.max(720, Math.round(display.width * 0.42)));
  const height = Math.min(960, Math.max(700, Math.round(display.height * 0.86)));

  return chrome.windows.create({
    url: buildDeepSeekUrl(prompt),
    type: "popup",
    left: Math.max(0, display.width - width - 48),
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

async function getDisplaySize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.width && tab?.height) {
      return { width: tab.width, height: tab.height };
    }
  } catch {
    // Use conservative defaults below.
  }

  return { width: 1440, height: 900 };
}

function runCommand(action) {
  action().catch(() => {
    openDeepSeekTab(undefined, true);
  });
}
