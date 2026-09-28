/**
 * Single source of truth for the values that cross extension contexts.
 *
 * Loaded before every other extension module:
 *  - the service worker (importScripts)
 *  - the side panel and options pages (<script>)
 *  - the content scripts (manifest `js` array, isolated world)
 *
 * Exposes `globalThis.DeepSeekProtocol`.
 */
(function (global) {
  "use strict";

  // Query parameter that carries the prefilled prompt to DeepSeek.
  const PROMPT_PARAM = "q";

  const MESSAGES = Object.freeze({
    TOGGLE_SIDE_PANEL: "TOGGLE_SIDE_PANEL",
    SIDE_PANEL_CONTEXT: "SIDE_PANEL_CONTEXT",
    CLOSE_SIDE_PANEL: "CLOSE_SIDE_PANEL",
    OPEN_SHORTCUTS_PAGE: "OPEN_SHORTCUTS_PAGE",
    OPEN_OPTIONS_PAGE: "OPEN_OPTIONS_PAGE"
  });

  // Must stay in sync with the `commands` block in manifest.json.
  const COMMANDS = Object.freeze({
    TOGGLE_WITH_CONTEXT: "open-deepseek-side-panel",
    TOGGLE_WITHOUT_CONTEXT: "toggle-side-panel-without-context"
  });

  const CONTEXT_MENUS = Object.freeze({
    TOGGLE_SIDE_PANEL: "toggle-side-panel",
    OPEN_SHORTCUTS_PAGE: "open-shortcuts-page",
    OPEN_OPTIONS_PAGE: "open-options-page"
  });

  global.DeepSeekProtocol = {
    PROMPT_PARAM,
    MESSAGES,
    COMMANDS,
    CONTEXT_MENUS
  };
})(globalThis);
