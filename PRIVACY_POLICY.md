# Open DeepSeek Sidebar Privacy Policy

Last updated: September 28, 2026

Open DeepSeek Sidebar ("the extension") is a browser extension that opens the official DeepSeek chat website (`chat.deepseek.com`) in the browser's side panel.

This policy explains exactly what the extension does and does not do with your data.

## Summary

- The extension has **no backend**. There is no developer-operated server, and the extension makes no network requests of its own.
- The extension does **not collect or store** your data, and sends **nothing** to the developer.
- The only thing that ever leaves your browser is the page URL you choose to attach as context, and it goes only to the **DeepSeek page you opened**, exactly as if you had pasted the link yourself.
- All of the code is open source and auditable: https://github.com/zhouzhuojie/open-deepseek-sidebar

## What the extension reads

### Page context (optional)

When you open DeepSeek **with page context** (for example with `Ctrl+Q` or a toolbar click), the extension reads the URL of the active tab at that moment and builds this prompt:

```
At this page: <page_url>, 
```

The prompt is placed into the DeepSeek composer of the page that was just opened, where you can edit or delete it before sending. That is the only use of the URL.

This is the only browsing-related data the extension touches. It is not stored persistently: it passes briefly through `chrome.storage.session` (in-memory storage that is cleared when the browser closes) or through the page URL, and is removed as soon as the prompt is applied.

If you want no page context at all, use the context-free shortcut (`Ctrl+Shift+Q`), which opens DeepSeek with an empty composer.

### What the extension does not read

The extension does not read, collect, or store:

- Page content or page text
- Form fields, keystrokes, or passwords
- Cookies
- Your browsing history beyond the single active tab URL described above
- DeepSeek account information, conversations, or API keys

## Where your data goes

The extension itself sends nothing to the developer and has no server.

When you use the optional page context, the URL you are on is submitted to DeepSeek as part of the chat prompt, because it is typed into the DeepSeek page you opened. That request goes to `chat.deepseek.com` and is governed by DeepSeek's own privacy policy. If you would rather not send it, use the context-free shortcut.

## DeepSeek website access

The extension loads the official DeepSeek website (`https://chat.deepseek.com/`) in the side panel. Login state, conversations, and cookies are managed by DeepSeek and your browser. The extension does not access or store them.

## Permissions

The extension uses the following browser permissions:

- `sidePanel`: to display the official DeepSeek website in the browser side panel.
- `activeTab`: to read the URL of the active tab, and only at the moment you invoke the extension (toolbar click, keyboard shortcut, or context menu). It grants no access to any other tab and no persistent access to any site.
- `storage`: to pass the page URL to the side panel using in-memory session storage only.
- `contextMenus`: to add entries to the extension's own toolbar-icon right-click menu.
- `declarativeNetRequestWithHostAccess`: to modify response headers for DeepSeek sub-frames only, so the official DeepSeek website can be displayed inside the side panel iframe. Top-level navigations to DeepSeek are left untouched.
- Host permission for DeepSeek domains (`https://*.deepseek.com/*`): to allow the side panel iframe to load the official DeepSeek website. No other websites are accessed.

None of these permissions produce an install-time warning message.

## Remote code

The extension does not execute remotely hosted extension code. All JavaScript, CSS, and HTML is included in the extension package. The official DeepSeek website is loaded as ordinary web content in an iframe, not as extension code.

## Data retention

The extension retains no user data. The page-context value lives only in memory for a few seconds while the side panel loads, and is then removed.

## Data sharing

The extension does not sell, rent, or share your data with the developer or with any third party. The only data transfer is the page URL you choose to attach, sent to the DeepSeek website you opened.

## Changes to this policy

If this policy changes, the updated version will be published at this URL with a new "Last updated" date.

## Contact

Questions or concerns: open an issue at https://github.com/zhouzhuojie/open-deepseek-sidebar/issues or use the developer contact address shown on the Chrome Web Store listing.
