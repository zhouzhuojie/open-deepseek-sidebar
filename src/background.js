importScripts("protocol.js", "context.js");

const { MESSAGES, COMMANDS, CONTEXT_MENUS } = globalThis.DeepSeekProtocol;
const { captureActiveTabContext, buildPrompt, storeSidePanelContext } =
  globalThis.DeepSeekContext;

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
  [COMMANDS.TOGGLE_WITHOUT_CONTEXT]: (tab) => toggleSidePanel(tab, false)
};

chrome.commands.onCommand.addListener((command, tab) => {
  COMMAND_HANDLERS[command]?.(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENUS.TOGGLE_SIDE_PANEL) {
    toggleSidePanel(tab, true);
  }

  if (info.menuItemId === CONTEXT_MENUS.OPEN_SHORTCUTS_PAGE) {
    openShortcutsPage().catch(() => {});
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

// `onInstalled` and `onStartup` can both fire during the same service worker
// lifetime, and each used to run its own removeAll -> create sequence. The two
// removeAll calls are queued before either create runs, so the second create
// trips "Cannot create item with duplicate id ...". Serialize registration
// behind a single in-flight promise so only one sequence runs at a time.
let actionContextMenuRegistration = null;

const ACTION_CONTEXT_MENUS = [
  { id: CONTEXT_MENUS.TOGGLE_SIDE_PANEL, title: "Toggle DeepSeek Side Panel" },
  { id: CONTEXT_MENUS.OPEN_SHORTCUTS_PAGE, title: "Configure Shortcuts" },
  { id: CONTEXT_MENUS.OPEN_OPTIONS_PAGE, title: "Extension Options" }
];

function createActionContextMenu() {
  if (actionContextMenuRegistration) return actionContextMenuRegistration;

  actionContextMenuRegistration = new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      // Read lastError so a failed removeAll never surfaces unchecked.
      void chrome.runtime.lastError;
      for (const { id, title } of ACTION_CONTEXT_MENUS) {
        chrome.contextMenus.create({ id, title, contexts: ["action"] }, () => {
          // A create can still fail (e.g. a concurrent registration); read
          // lastError so Chrome does not report it as an unchecked error.
          void chrome.runtime.lastError;
        });
      }
      resolve();
    });
  });

  return actionContextMenuRegistration;
}

/* ------------------------------------------------------------------ *
 * Side panel toggling
 * ------------------------------------------------------------------ */

// Cache of windows whose side panel is open.
//
// `sidePanel.open()` must be called synchronously inside the user gesture, and
// the gesture is lost across an `await`. The only "is it open" API
// (`runtime.getContexts`) is asynchronous, so the toggle decision reads this
// cache synchronously. The cache is not hand-maintained truth: it is hydrated
// from `getContexts` and, where available, kept fresh by the
// `onOpened`/`onClosed` events.
const openPanelWindows = new Set();

// Bumped whenever openPanelWindows changes locally. A hydration that began
// before the change is discarded, so a slow getContexts cannot clobber a
// toggle that raced it.
let openStateVersion = 0;

hydrateOpenState();

chrome.sidePanel.onOpened?.addListener((info) => {
  if (info?.windowId == null) return;
  openStateVersion++;
  openPanelWindows.add(info.windowId);
});

chrome.sidePanel.onClosed?.addListener((info) => {
  if (info?.windowId == null) return;
  openStateVersion++;
  openPanelWindows.delete(info.windowId);
});

async function hydrateOpenState() {
  const version = openStateVersion;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["SIDE_PANEL"]
    });
    if (version !== openStateVersion) return;
    openPanelWindows.clear();
    for (const context of contexts) {
      if (context.windowId != null) openPanelWindows.add(context.windowId);
    }
  } catch {
    // No getContexts (or it failed): rely on the optimistic updates instead.
  }
}

/**
 * Toggle the side panel for the tab's window. `withContext` controls whether
 * the current page's URL is prefilled into DeepSeek when opening it.
 */
function toggleSidePanel(tab, withContext) {
  if (typeof chrome.sidePanel?.open !== "function") return;

  const windowId = tab?.windowId;
  if (windowId != null) {
    applyToggle(windowId, withContext);
    return;
  }

  // No window id on the event: resolve one first, then act.
  resolveSidePanelWindowId().then((resolved) => {
    if (resolved != null) applyToggle(resolved, withContext);
  });
}

function applyToggle(windowId, withContext) {
  if (openPanelWindows.has(windowId)) {
    openStateVersion++;
    openPanelWindows.delete(windowId);
    closeSidePanel(windowId);
    return;
  }

  // Must stay synchronous with the user gesture: do not `await` before this.
  openStateVersion++;
  openPanelWindows.add(windowId);
  chrome.sidePanel.open({ windowId }).catch(() => {
    // The open failed; drop the optimistic entry and re-read the real state.
    openStateVersion++;
    openPanelWindows.delete(windowId);
    hydrateOpenState();
  });

  attachSidePanelContext(windowId, withContext);
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
 * Context
 * ------------------------------------------------------------------ */

async function getContextPrompt(windowId, withContext) {
  if (!withContext) return { prompt: "", context: null };
  const context = await captureActiveTabContext(windowId);
  return { prompt: buildPrompt(context), context };
}

async function openShortcutsPage() {
  return chrome.tabs.create({ url: "chrome://extensions/shortcuts", active: true });
}
