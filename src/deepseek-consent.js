/**
 * DeepSeek consent / cookie banner dismissal.
 *
 * Runs in every matching frame so it also works inside the side panel iframe,
 * where the consent cookie is a blocked third-party cookie and the banner
 * reappears on every open.
 *
 * DeepSeek's markup is not stable, so this deliberately uses a small,
 * documented spec (selectors + action text) plus a defensive fallback. When
 * nothing matches it does nothing; it never throws.
 */
(function (global) {
  "use strict";

  const LOADED_FLAG = "__deepSeekConsentLoaded";
  if (global[LOADED_FLAG]) return;
  global[LOADED_FLAG] = true;

  const SETTLE_MS = 20000;
  const THROTTLE_MS = 150;
  const POLL_MS = 500;

  const CONTAINER_SELECTOR = [
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

  // Hidden up front to avoid a flash; the accept button is still clickable.
  const HIDE_SELECTOR = [
    '[class*="cookie-consent" i]',
    '[class*="cookie-banner" i]',
    '[class*="cookie-notice" i]',
    '[id*="cookie-consent" i]',
    '[id*="cookie-banner" i]',
    '[id*="cookie-notice" i]',
    '[class*="consent-banner" i]',
    '[class*="gdpr-banner" i]'
  ];

  const ACCEPT_TEXT_RE =
    /(^|\b)(accept(\s+all)?(\s+cookies)?|allow(\s+all)?(\s+cookies)?|i agree|agree|got it|ok(ay)?)(\b|$)/i;
  const REJECT_TEXT_RE =
    /(^|\b)(reject(\s+all)?|decline|deny|refuse(\s+all)?|close|dismiss|only necessary|necessary only)(\b|$)/i;
  const SKIP_TEXT_RE =
    /(settings|preferences|manage|customize|learn more|more options)/i;

  setup();

  function setup() {
    installHidingStyle();

    const startedAt = Date.now();
    let scheduled = false;

    // Throttle: DeepSeek mutates the DOM constantly, so coalesce reactions.
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        dismissAll();
      }, THROTTLE_MS);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document, { childList: true, subtree: true });

    dismissAll();

    const poll = setInterval(() => {
      dismissAll();
      if (Date.now() - startedAt > SETTLE_MS) {
        observer.disconnect();
        clearInterval(poll);
      }
    }, POLL_MS);
  }

  function installHidingStyle() {
    if (document.getElementById("dq-consent-hide")) return;
    const style = document.createElement("style");
    style.id = "dq-consent-hide";
    style.textContent = HIDE_SELECTOR.join(",") + "{display:none !important;}";
    (document.head || document.documentElement || document).append(style);
  }

  function dismissAll() {
    let acted = false;
    const seen = new Set();

    for (const container of document.querySelectorAll(CONTAINER_SELECTOR)) {
      if (seen.has(container)) continue;
      seen.add(container);
      if (dismissContainer(container, false)) acted = true;
    }

    for (const dialog of document.querySelectorAll(
      '[role="dialog"], dialog, [aria-modal="true"]'
    )) {
      if (seen.has(dialog)) continue;
      if (!/cookie|consent|gdpr/i.test(dialog.textContent || "")) continue;
      seen.add(dialog);
      if (dismissContainer(dialog, true)) acted = true;
    }

    return acted;
  }

  function dismissContainer(container, requireVisible) {
    if (requireVisible && !isVisible(container)) return false;

    const action = findAction(container);
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

  function findAction(container) {
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
})(globalThis);
