# Open DeepSeek Sidebar Privacy Policy

Last updated: July 2, 2026

Open DeepSeek Sidebar is a browser extension that helps users open the official DeepSeek website in a browser side panel, standalone window, or browser tab.

## Data Collection

Open DeepSeek Sidebar does not collect, store, sell, transmit, or share any personal data.

The extension does not collect:

- Personal information
- Chat content
- DeepSeek account information
- API keys
- Browsing history
- Authentication credentials

## Page Context (optional)

To prefill DeepSeek with context from the tab you opened it from, the extension reads the active tab's URL at the moment you trigger an open action. Only the URL is used to build the prompt `At this page: <page_url>, ` that is placed into the DeepSeek page you opened. It is kept in local extension storage (or in the page URL) just long enough to reach the DeepSeek input box and is not sent anywhere else. You can open DeepSeek without context using the dedicated shortcut.

## DeepSeek Website Access

The extension opens the official DeepSeek website at `https://chat.deepseek.com/`.

Login status, conversations, cookies, and account data are managed by DeepSeek and the browser. Open DeepSeek Sidebar does not access or store this information.

## Permissions

The extension uses the following browser permissions:

- `sidePanel`: to open and close DeepSeek in the browser side panel.
- `tabs`: to read the active tab's URL for context, to open DeepSeek in a browser tab, and to open the browser shortcut settings page.
- `declarativeNetRequest`: to modify response headers only for DeepSeek domains so the official DeepSeek website can be displayed inside the side panel iframe.
- `contextMenus`: to add entries to the toolbar icon's right-click menu.
- `storage`: to pass the page URL to the side panel.
- Host permissions for DeepSeek domains: to allow the side panel iframe to load the official DeepSeek website and to prefill the DeepSeek composer.

## Remote Code

Open DeepSeek Sidebar does not execute remotely hosted extension code. It only loads the official DeepSeek website as web content.

## Data Sharing

Open DeepSeek Sidebar does not share any user data with the developer or third parties.

## Contact

For privacy questions, contact the extension developer using the support email listed in the browser extension store.
