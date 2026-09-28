# Open DeepSeek Sidebar

> Put DeepSeek one click away. A fast, privacy-friendly Chromium extension that opens the official DeepSeek chat in a native browser side panel — with the page you're reading automatically attached.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Chrome](https://img.shields.io/badge/Chrome-116%2B-4285F4)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-lightgrey)](https://chromewebstore.google.com/detail/CHROME_WEB_STORE_ID)
[![Privacy: no tracking](https://img.shields.io/badge/privacy-no%20tracking%2C%20no%20backend-2ea44f)](PRIVACY_POLICY.md)

---

## Why Open DeepSeek Sidebar?

Chat assistants are most useful when they sit next to the page you're actually working on — not in another tab you have to hunt for. This extension docks the **real DeepSeek web app** in the browser side panel and feeds it the context you care about, so you can go from *"what am I looking at?"* to *"here's the answer"* without breaking focus.

- **No copy-paste.** The page URL is prefilled as `At this page: <page_url>, ` — cursor ready for your question.
- **No API keys. No accounts.** It loads the official site with your existing browser session.
- **Private and auditable by design.** No backend, no telemetry, no analytics, no remote code. The code that runs is the code in this repo — [verify it yourself](#verify-it-yourself).

## Features

| | |
| --- | --- |
| **Native side panel** | Uses `chrome.sidePanel` for a real, resizable, docked panel — not a popup that vanishes. |
| **One-key toggle** | `Ctrl+Q` opens *and* closes the panel. Toolbar left click does the same. |
| **Context-aware opens** | The current tab's URL is prefilled so you can ask about the page instantly. |
| **Context-free toggle** | `Ctrl+Shift+Q` toggles the panel with an empty composer when you just want to chat. |
| **Extra open targets** | Send DeepSeek to a focused standalone window (`Alt+Shift+D`) or a regular tab (`Alt+Shift+T`). |
| **Session preserved** | Login and chat history stay in the official DeepSeek session — the extension never touches them. |
| **Cookie-banner auto-dismiss** | DeepSeek's consent banner is clicked away and hidden automatically, even inside the side-panel iframe. |
| **Minimal permissions** | Only `sidePanel`, `tabs`, `storage`, `contextMenus`, and `declarativeNetRequest` for DeepSeek domains; the iframe header rewrite is scoped to sub-frames. |
| **Manifest V3** | Built on the current extension platform with a lightweight service worker. |

## Install

### From the Chrome Web Store

> **Coming soon.** The listing is not live yet — the placeholder link is
> `https://chromewebstore.google.com/detail/open-deepseek-sidebar/CHROME_WEB_STORE_ID`
> (replace `CHROME_WEB_STORE_ID` after publishing the store listing).

### From source (developer mode)

1. Open the extension management page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Left-click the **Open DeepSeek Sidebar** toolbar icon.

## Usage

| Action | Shortcut |
| --- | --- |
| Toggle side panel (with page URL) | `Ctrl+Q` |
| Toggle side panel (no page context) | `Ctrl+Shift+Q` |
| Open DeepSeek in a window | `Alt+Shift+D` |
| Open DeepSeek in a tab | `Alt+Shift+T` |

- On macOS the `Ctrl` modifier maps to `MacCtrl` to avoid clashing with the system quit shortcut.
- Chromium only lets an extension *declare* configurable commands; set the actual keys at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`).
- Left-click the toolbar icon to toggle. Chromium does not let extensions override the icon's own right-click menu, so this extension adds **Toggle DeepSeek Side Panel**, **Configure Shortcuts**, and **Extension Options** there instead.

## How context works

When opened with context, the extension builds this prompt and drops it into the DeepSeek composer:

```
At this page: https://example.com/article, 
```

The trailing space is intentional — start typing your question immediately. The URL is read locally from the `tabs` permission and travels only to the DeepSeek page you opened. Use `Ctrl+Shift+Q` for a clean composer.

## How it works

DeepSeek normally refuses to be framed. The extension ships a small `declarativeNetRequest` ruleset that strips the iframe-blocking response headers **only for DeepSeek domains**, then loads the official site inside `chrome.sidePanel`. A content script on `chat.deepseek.com` fills the composer and clears the consent banner once the app is ready.

```
manifest.json            MV3 manifest: permissions, commands, content script, DNR rules
rules/                   declarativeNetRequest ruleset (DeepSeek-only sub-frame header rewrite)
src/protocol.js          Shared constants: prompt param, message types, command ids
src/context.js           Shared helpers: capture active tab URL, build prompt/URL
src/background.js        Service worker: toggling, commands, context, menus
src/deepseek-consent.js  Content script: cookie/consent banner dismissal
src/deepseek-prefill.js  Content script: composer prefill
src/sidepanel.*          Side panel shell that hosts the DeepSeek iframe
src/options.*            Options / help page
```

## Privacy

**This extension is a thin wrapper around the official DeepSeek website. It has no backend, no analytics, and no code that talks to anyone but DeepSeek.**

### What it does not do

- No analytics, no telemetry, no tracking, no crash reporting, no ads, no affiliate links.
- No accounts, no sign-in, no remote config, no feature flags fetched from a server.
- **No outbound network calls of its own.** There is no `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` anywhere in the source — the extension never phones home.
- **No remote code.** Everything that runs ships in this repository and is loaded from the extension package.
- No `webRequest`, no `scripting`, no `activeTab`, no `cookies`, no `history`, no `downloads`, no `<all_urls>`.
- No persistent record of your browsing. The page URL lives only in `chrome.storage.session` — in-memory, cleared when the browser closes — and is discarded after about 60 seconds.

### What it does touch, and why

The entire permission surface:

| Permission | Why it is here |
| --- | --- |
| `sidePanel` | Dock DeepSeek in the native side panel. |
| `tabs` | Read the active tab's URL for page context, open DeepSeek in a tab, and open the browser's shortcuts page. |
| `storage` | Hand the page URL to the side panel. Uses `storage.session` only (never written to disk). |
| `contextMenus` | Add entries to the toolbar icon's right-click menu. |
| `declarativeNetRequest` | Remove the iframe-blocking response headers for DeepSeek **sub-frames only**. Top-level navigation to DeepSeek is untouched. |
| Host: `https://deepseek.com/*`, `https://*.deepseek.com/*` | Allow the panel iframe to load the official site and the content script to prefill the composer. |

`tabs` is a broad permission and we would rather not need it; it is required because the URL is read *after* the side panel opens, where the narrower `activeTab` grant is no longer available. The rationale is documented next to the code in `src/context.js`.

### Where your data goes

Nowhere except DeepSeek. When you open DeepSeek **with context**, the current tab's URL is placed into the DeepSeek composer as `At this page: <page_url>, ` and sent to **chat.deepseek.com** — the same request you would make by pasting the link yourself, governed by DeepSeek's own privacy policy.

The extension sends nothing to the developer or to any third party. Prefer no context at all? Use `Ctrl+Shift+Q` and the composer opens empty.

### Verify it yourself

There is no build step, no bundler, and no minification, so the code in this repository is the code that runs in your browser. Read it in this order:

1. **`manifest.json`** — the complete permission surface, nothing hidden.
2. **`src/background.js`** — the service worker. It calls `chrome.tabs.*`, `chrome.windows.*`, and `chrome.sidePanel.*`, and nothing else.
3. **`src/context.js`** — where the page URL is read and turned into the prompt.
4. **`rules/deepseek-frame-headers.json`** — the header rewrite, scoped to DeepSeek sub-frames.

Or audit it in one line:

```bash
# Expect no output: no network calls and no dynamic code evaluation.
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|eval\(|new Function" src/
```

Full details: [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Fork

This project is a fork of [**whKoda/DeepSeekQuckOpen**](https://github.com/whKoda/DeepSeekQuckOpen). Credit and thanks to the original author for the initial extension.

This fork focuses on a cleaner, more opinionated experience: a true toggle, URL page context on open, a simplified single-purpose configuration, English-only UI, and refreshed branding.

The upstream project does not declare a license, so no license is asserted here for the combined work.

## Development

No build step and no runtime dependencies. Edit the files and hit **Reload** in `chrome://extensions/`.

Run the test suite with Node's built-in test runner (Node 20+):

```bash
npm test
```

The tests cover the shared context/prompt helpers, the manifest contract, and source hygiene (no CJK, no stale branding, no removed popup).
