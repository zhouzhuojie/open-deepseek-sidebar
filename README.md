# Open DeepSeek Sidebar

> Put DeepSeek one click away. A fast, privacy-friendly Chromium extension that opens the official DeepSeek chat in a native browser side panel — with the page you're reading automatically attached.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Chrome](https://img.shields.io/badge/Chrome-114%2B-4285F4)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

---

## Why Open DeepSeek Sidebar?

Chat assistants are most useful when they sit next to the page you're actually working on — not in another tab you have to hunt for. This extension docks the **real DeepSeek web app** in the browser side panel and feeds it the context you care about, so you can go from *"what am I looking at?"* to *"here's the answer"* without breaking focus.

- **No copy-paste.** The page URL is prefilled as `At this page: <page_url>, ` — cursor ready for your question.
- **No API keys. No accounts.** It loads the official site with your existing browser session.
- **No telemetry.** Nothing leaves your machine except the prompt you can see and edit.

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
| **Minimal permissions** | Only `sidePanel`, `tabs`, `storage`, `contextMenus`, and `declarativeNetRequest` for DeepSeek domains. |
| **Manifest V3** | Built on the current extension platform with a lightweight service worker. |

## Install

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
rules/                   declarativeNetRequest ruleset (DeepSeek-only header rewrite)
src/background.js        Service worker: toggling, commands, context, menus
src/context.js           Shared helpers: capture active tab URL, build prompt/URL
src/deepseek-content.js  Content script: composer prefill + cookie-banner dismissal
src/sidepanel.*          Side panel shell that hosts the DeepSeek iframe
src/options.*            Options / help page
```

## Privacy

No analytics, no tracking, no remote code, no data collection. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Fork

This project is a fork of [**whKoda/DeepSeekQuckOpen**](https://github.com/whKoda/DeepSeekQuckOpen). Credit and thanks to the original author for the initial extension.

This fork focuses on a cleaner, more opinionated experience: a true toggle, URL page context on open, a simplified single-purpose configuration, English-only UI, and refreshed branding.

The upstream project does not declare a license, so no license is asserted here for the combined work.

## Development

No build step. Edit the files and hit **Reload** in `chrome://extensions/`.
