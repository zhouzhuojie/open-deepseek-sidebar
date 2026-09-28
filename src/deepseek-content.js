/**
 * DeepSeek content script.
 *
 * Two jobs:
 *  1. Dismiss DeepSeek's cookie/consent banner. Inside the side panel iframe
 *     the consent cookie is a blocked third-party cookie, so the banner comes
 *     back on every open.
 *  2. Prefill the composer when the page was opened with a `?q=` prompt.
 *
 * Runs in every matching frame so it also works inside the side panel iframe.
 * The prompt is stashed in sessionStorage so it survives a login redirect.
 */
(() => {
  "use strict";

  const PROMPT_PARAM = "q";
  const PENDING_KEY = "deepseekQuickOpenPendingPrompt";
  const INJECTED_FLAG = "__deepseekQuickOpenPrefilled";
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

  const CONSENT_CONTAINER_SELECTOR = [
    '[id*="cookie" i]',
    '[class*="cookie" i]',
    '[id*="consent" i]',
    '[class*="consent" i]',
    '[id*="gdpr" i]',
    '[class*="gdpr" i]',
    '[aria-label*="cookie" i]',
    '[aria-label*="consent" i]',
    '[data-testid*="cookie" i]',
    '[data-testid*="consent" i]'
  ].join(",");

  const ACCEPT_TEXT_RE =
    /(^|\b)(accept(\s+all)?(\s+cookies)?|allow(\s+all)?(\s+cookies)?|i agree|agree|got it|ok(ay)?)(\b|$)/i;
  const REJECT_TEXT_RE =
    /(^|\b)(reject(\s+all)?|decline|deny|refuse(\s+all)?|close|dismiss|only necessary|necessary only)(\b|$)/i;
  const SKIP_TEXT_RE =
    /(settings|preferences|manage|customize|learn more|more options)/i;

  if (globalThis[INJECTED_FLAG]) return;
  globalThis[INJECTED_FLAG] = true;

  setupConsentDismissal();

  const pending = readPendingPrompt();
  if (!pending) return;

  injectWhenReady(pending);

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
      history.replaceState(
        history.state,
        "",
        url.pathname + url.search + url.hash
      );
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

  /* ------------------------------------------------------------------ *
   * Cookie / consent banner dismissal
   * ------------------------------------------------------------------ */

  function setupConsentDismissal() {
    installConsentHidingStyle();

    const startedAt = Date.now();
    let scheduled = false;

    // Throttle: DeepSeek mutates the DOM constantly, so coalesce reactions.
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        dismissConsentBanners();
      }, 150);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document, { childList: true, subtree: true });

    dismissConsentBanners();

    const poll = setInterval(() => {
      dismissConsentBanners();
      if (Date.now() - startedAt > 20000) {
        observer.disconnect();
        clearInterval(poll);
      }
    }, 500);
  }

  // Instantly hide banner containers to avoid a flash, then click the accept
  // button below (programmatic clicks work on hidden elements).
  function installConsentHidingStyle() {
    if (document.getElementById("dq-consent-hide")) return;
    const style = document.createElement("style");
    style.id = "dq-consent-hide";
    style.textContent =
      [
        '[class*="cookie-consent" i]',
        '[class*="cookie-banner" i]',
        '[class*="cookie-notice" i]',
        '[id*="cookie-consent" i]',
        '[id*="cookie-banner" i]',
        '[id*="cookie-notice" i]',
        '[class*="consent-banner" i]',
        '[class*="gdpr-banner" i]'
      ].join(",") + "{display:none !important;}";
    (document.head || document.documentElement || document).append(style);
  }

  function dismissConsentBanners() {
    let acted = false;
    const seen = new Set();

    for (const container of document.querySelectorAll(CONSENT_CONTAINER_SELECTOR)) {
      if (seen.has(container)) continue;
      seen.add(container);
      if (dismissConsentContainer(container, false)) acted = true;
    }

    for (const dialog of document.querySelectorAll(
      '[role="dialog"], dialog, [aria-modal="true"]'
    )) {
      if (seen.has(dialog)) continue;
      if (!/cookie|consent|gdpr/i.test(dialog.textContent || "")) continue;
      seen.add(dialog);
      if (dismissConsentContainer(dialog, true)) acted = true;
    }

    return acted;
  }

  function dismissConsentContainer(container, requireVisible) {
    if (requireVisible && !isVisible(container)) return false;

    const action = findConsentAction(container);
    if (action) {
      try {
        action.click();
      } catch {
        return false;
      }
      return true;
    }

    // No button matched: only hide things that actually look like an overlay,
    // to avoid removing unrelated elements that merely contain "cookie".
    if (!isOverlayLike(container)) return false;
    container.style.setProperty("display", "none", "important");
    unlockPageScroll();
    return true;
  }

  function findConsentAction(container) {
    const nodes = container.querySelectorAll(
      'button, [role="button"], a[href="#"], input[type="button"], input[type="submit"]'
    );
    let reject = null;

    for (const node of nodes) {
      const text = (
        node.textContent ||
        node.getAttribute?.("aria-label") ||
        node.value ||
        ""
      ).trim();
      if (!text || SKIP_TEXT_RE.test(text)) continue;
      if (ACCEPT_TEXT_RE.test(text)) return node;
      if (!reject && REJECT_TEXT_RE.test(text)) reject = node;
    }

    return reject;
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isOverlayLike(element) {
    const style = getComputedStyle(element);
    if (style.position === "fixed" || style.position === "sticky") return true;
    const rect = element.getBoundingClientRect();
    const viewport = (window.innerWidth || 1) * (window.innerHeight || 1);
    return rect.width * rect.height > viewport * 0.1;
  }

  function unlockPageScroll() {
    for (const element of [document.documentElement, document.body]) {
      if (element && getComputedStyle(element).overflow === "hidden") {
        element.style.setProperty("overflow", "auto", "important");
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Composer prefill
   * ------------------------------------------------------------------ */

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
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
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
})();
