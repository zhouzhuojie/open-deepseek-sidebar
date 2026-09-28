/**
 * Shared helpers for context aware opens and for handing context to the side
 * panel. Loaded by the background service worker (importScripts), the side
 * panel and the options page. Exposes `globalThis.DeepSeekContext`.
 *
 * Kept deliberately small: the only context used is the current page's URL.
 */
(function (global) {
  "use strict";

  const { PROMPT_PARAM } = global.DeepSeekProtocol;

  // Bare URL keeps the plain "just open DeepSeek" behaviour.
  const DEEPSEEK_URL = "https://chat.deepseek.com/";
  // New-chat route: DeepSeek keeps unknown query params here, which lets the
  // content script read the prefilled prompt back.
  const DEEPSEEK_CHAT_URL = "https://chat.deepseek.com/a/chat";
  const MAX_PROMPT_LENGTH = 6000;

  function isCapturableUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  /**
   * Context of the active tab in the given window (or the current window).
   * Never throws: returns null when the tab has no usable URL.
   *
   * The extension declares `activeTab`, not `tabs`, so `chrome.tabs.query`
   * only populates `tab.url` for a tab the user just invoked the extension on
   * (toolbar click, keyboard shortcut or context menu). When the grant is not
   * present this returns null and the panel simply opens without context.
   */
  async function captureActiveTabContext(windowId) {
    let tab;
    try {
      const query = windowId
        ? { active: true, windowId }
        : { active: true, currentWindow: true };
      [tab] = await chrome.tabs.query(query);
    } catch {
      return null;
    }

    if (!tab?.id || !isCapturableUrl(tab.url)) return null;

    return {
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || "",
      url: tab.url
    };
  }

  /**
   * The prompt prefilled into DeepSeek. The trailing space is intentional so
   * the user can keep typing right after the link.
   */
  function buildPrompt(context) {
    const url = (context?.url || "").trim();
    if (!url) return "";
    const prompt = `At this page: ${url}, `;
    if (prompt.length <= MAX_PROMPT_LENGTH) return prompt;
    return prompt.slice(0, MAX_PROMPT_LENGTH - 1) + "\u2026";
  }

  function buildDeepSeekUrl(prompt) {
    // Do not trim: the prompt intentionally ends with a space.
    const text = prompt || "";
    if (!text.trim()) return DEEPSEEK_URL;

    const url = new URL(DEEPSEEK_CHAT_URL);
    url.searchParams.set(PROMPT_PARAM, text);
    return url.toString();
  }

  function sessionArea() {
    return chrome.storage.session;
  }

  function sidePanelContextKey(windowId) {
    return `sidePanelContext:${windowId ?? "default"}`;
  }

  async function storeSidePanelContext(windowId, context, prompt) {
    try {
      await sessionArea().set({
        [sidePanelContextKey(windowId)]: {
          context: context || null,
          prompt: prompt || "",
          updatedAt: Date.now()
        }
      });
    } catch {
      // Storage is best effort.
    }
  }

  async function consumeSidePanelContext(windowId) {
    const key = sidePanelContextKey(windowId);
    try {
      const result = await sessionArea().get(key);
      const value = result?.[key];
      if (!value) return null;
      await sessionArea().remove(key);

      // Ignore stale entries left behind when a panel failed to open.
      const maxAgeMs = 60 * 1000;
      if (value.updatedAt && Date.now() - value.updatedAt > maxAgeMs) {
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  global.DeepSeekContext = {
    DEEPSEEK_URL,
    DEEPSEEK_CHAT_URL,
    PROMPT_PARAM,
    captureActiveTabContext,
    buildPrompt,
    buildDeepSeekUrl,
    storeSidePanelContext,
    consumeSidePanelContext
  };
})(globalThis);
