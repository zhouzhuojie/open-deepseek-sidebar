const { DEEPSEEK_URL, buildDeepSeekUrl, consumeSidePanelContext } =
  globalThis.DeepSeekContext;

const frame = document.getElementById("deepseekFrame");

let currentWindowId = null;
let lastPrompt = "";
let sidePanelPort = null;

init();

async function init() {
  let stored = null;
  try {
    const currentWindow = await chrome.windows.getCurrent();
    currentWindowId = currentWindow?.id ?? null;
    // The background stores the origin tab's context right before/after the
    // panel opens. This covers the message arriving before the panel loaded.
    stored = await consumeSidePanelContext(currentWindowId);
  } catch {
    currentWindowId = null;
  }

  connectSidePanelPort();

  applyPrompt(stored?.prompt || "");
}

// Keeps the background's open/closed state accurate so the toolbar button and
// the keyboard shortcuts can toggle the panel. The port disconnects when the
// panel closes (or when the service worker is recycled).
function connectSidePanelPort() {
  if (currentWindowId == null) return;
  try {
    sidePanelPort = chrome.runtime.connect({ name: "sidepanel" });
    sidePanelPort.postMessage({
      type: "SIDE_PANEL_HELLO",
      windowId: currentWindowId
    });
  } catch {
    // Ignore; toggling then relies on the optimistic open/close state.
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CLOSE_SIDE_PANEL") {
    if (currentWindowId == null || message.windowId === currentWindowId) {
      window.close();
    }
    return false;
  }

  if (message?.type !== "SIDE_PANEL_CONTEXT") return false;

  if (
    currentWindowId != null &&
    message.windowId != null &&
    message.windowId !== currentWindowId
  ) {
    return false;
  }

  // Drop the stored copy so a later reload does not reapply stale context.
  consumeSidePanelContext(currentWindowId);
  applyPrompt(message.prompt || "");
  return false;
});

document.getElementById("reload").addEventListener("click", () => {
  frame.src = lastPrompt ? buildDeepSeekUrl(lastPrompt) : DEEPSEEK_URL;
});

document.getElementById("openWindow").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DEEPSEEK_WINDOW", withContext: true });
});

document.getElementById("openTab").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DEEPSEEK_TAB", withContext: true });
});

function applyPrompt(prompt) {
  // Do not trim: the prompt intentionally ends with a space.
  if (prompt && prompt.trim()) {
    lastPrompt = prompt;
    frame.src = buildDeepSeekUrl(prompt);
  } else {
    lastPrompt = "";
    frame.src = DEEPSEEK_URL;
  }
}
