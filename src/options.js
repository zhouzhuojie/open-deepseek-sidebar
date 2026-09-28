const COMMAND_LABELS = {
  "open-deepseek-side-panel": "Toggle side panel (with page URL)",
  "toggle-side-panel-without-context": "Toggle side panel (no page context)",
  "open-deepseek-window": "Open DeepSeek in a window",
  "open-deepseek-tab": "Open DeepSeek in a tab"
};

document.getElementById("toggleSidePanel").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TOGGLE_SIDE_PANEL", withContext: true });
});

document.getElementById("openWindow").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DEEPSEEK_WINDOW", withContext: true });
});

document.getElementById("openTab").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DEEPSEEK_TAB", withContext: true });
});

document.getElementById("openShortcuts").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_SHORTCUTS_PAGE" });
});

loadShortcuts();

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const list = document.getElementById("shortcuts");
  list.replaceChildren();

  for (const command of commands) {
    if (!COMMAND_LABELS[command.name]) continue;
    const row = document.createElement("div");
    row.className = "shortcut-row";

    const label = document.createElement("span");
    label.textContent = COMMAND_LABELS[command.name];

    const shortcut = document.createElement("kbd");
    shortcut.textContent = normalizeShortcut(command.shortcut || "Not set");

    row.append(label, shortcut);
    list.append(row);
  }
}

function normalizeShortcut(shortcut) {
  return shortcut
    .replaceAll("Command", "\u2318")
    .replaceAll("Ctrl", "\u2303")
    .replaceAll("Alt", "\u2325")
    .replaceAll("Shift", "\u21e7")
    .replaceAll("+", "");
}
