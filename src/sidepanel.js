const { DEEPSEEK_URL, buildDeepSeekUrl, consumeSidePanelContext } =
  globalThis.DeepSeekContext;
const { MESSAGES } = globalThis.DeepSeekProtocol;

const frame = document.getElementById("deepseekFrame");

let currentWindowId = null;
let lastPrompt = "";

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

  applyPrompt(stored?.prompt || "");
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGES.CLOSE_SIDE_PANEL) {
    if (currentWindowId == null || message.windowId === currentWindowId) {
      window.close();
    }
    return false;
  }

  if (message?.type !== MESSAGES.SIDE_PANEL_CONTEXT) return false;

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
  // Force, even when the URL is unchanged.
  applyPrompt(lastPrompt, { force: true });
});

/**
 * Point the iframe at DeepSeek with the given prompt. Idempotent so that the
 * stored context and an in-flight SIDE_PANEL_CONTEXT message cannot trigger a
 * double navigation.
 */
function applyPrompt(prompt, { force = false } = {}) {
  // Do not trim the prompt itself: it intentionally ends with a space.
  const hasPrompt = Boolean(prompt && prompt.trim());
  lastPrompt = hasPrompt ? prompt : "";

  const next = hasPrompt ? buildDeepSeekUrl(prompt) : DEEPSEEK_URL;
  if (!force && frame.src === next) return;
  frame.src = next;
}
