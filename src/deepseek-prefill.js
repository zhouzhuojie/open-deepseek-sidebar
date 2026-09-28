/**
 * DeepSeek composer prefill.
 *
 * When the page is opened with `?q=<prompt>`, wait for the composer to exist
 * and inject the prompt. The prompt is stashed in sessionStorage so it survives
 * a login redirect, and the `q` parameter is stripped from the URL afterwards.
 *
 * Runs in every matching frame so it also works inside the side panel iframe.
 */
(function (global) {
  "use strict";

  const LOADED_FLAG = "__deepSeekPrefillLoaded";
  if (global[LOADED_FLAG]) return;
  global[LOADED_FLAG] = true;

  const { PROMPT_PARAM } = global.DeepSeekProtocol;
  const PENDING_KEY = "deepseekQuickOpenPendingPrompt";
  const MAX_WAIT_MS = 20000;

  const INPUT_SELECTORS = [
    'textarea[name="search"]',
    "textarea#chat-input",
    'textarea[data-testid="chat-input"]',
    'textarea[data-testid="chat_input"]',
    'textarea[placeholder*="Message DeepSeek" i]',
    'textarea[placeholder*="DeepSeek" i]',
    'div[contenteditable="true"][role="textbox"]',
    "textarea"
  ];

  const pending = readPendingPrompt();
  if (pending) injectWhenReady(pending);

  function readPendingPrompt() {
    try {
      const params = new URLSearchParams(location.search);
      // Do not trim: the prompt intentionally ends with a space.
      const urlPrompt = params.get(PROMPT_PARAM) || "";
      if (urlPrompt.trim()) {
        // Keep the prompt around in case DeepSeek reloads/redirects (e.g.
        // sign-in flow) before the composer exists.
        sessionStorage.setItem(PENDING_KEY, urlPrompt);
        stripPromptParam();
        return urlPrompt;
      }
    } catch {
      // Fall through to sessionStorage.
    }

    try {
      const stored = sessionStorage.getItem(PENDING_KEY);
      if (!stored || !stored.trim()) return null;
      return stored;
    } catch {
      return null;
    }
  }

  function stripPromptParam() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has(PROMPT_PARAM)) return;
      url.searchParams.delete(PROMPT_PARAM);
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch {
      // Ignore; worst case DeepSeek sees an extra query param.
    }
  }

  function findComposer() {
    for (const selector of INPUT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function injectWhenReady(prompt) {
    let done = false;
    const startedAt = Date.now();

    const tryInject = () => {
      if (done) return true;
      const composer = findComposer();
      if (!composer) return false;
      done = true;
      cleanup();
      injectPrompt(composer, prompt);
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // Ignore.
      }
      return true;
    };

    const observer = new MutationObserver(() => {
      if (tryInject()) cleanup();
    });

    const poll = setInterval(() => {
      if (tryInject() || Date.now() - startedAt > MAX_WAIT_MS) cleanup();
    }, 400);

    function cleanup() {
      observer.disconnect();
      clearInterval(poll);
    }

    if (tryInject()) return;

    // `document` always exists, even at document_start.
    observer.observe(document, { childList: true, subtree: true });
  }

  function injectPrompt(element, text) {
    try {
      element.focus();
    } catch {
      // Ignore.
    }

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      setNativeValue(element, text);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      setCaretToEnd(element);
    } else if (element.isContentEditable) {
      element.textContent = "";
      try {
        document.execCommand("insertText", false, text);
      } catch {
        element.textContent = text;
      }
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        })
      );
    }
  }

  function setNativeValue(element, value) {
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function setCaretToEnd(element) {
    try {
      const end = element.value.length;
      element.setSelectionRange(end, end);
    } catch {
      // Ignore.
    }
  }
})(globalThis);
