const { MESSAGES, COMMANDS } = globalThis.DeepSeekProtocol;

// Order the rows are rendered in; labels come from the manifest via
// chrome.commands.getAll() so there is only one source of truth.
const COMMAND_ORDER = [
  COMMANDS.TOGGLE_WITH_CONTEXT,
  COMMANDS.TOGGLE_WITHOUT_CONTEXT,
  COMMANDS.OPEN_WINDOW,
  COMMANDS.OPEN_TAB
];

document.getElementById("toggleSidePanel").addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: MESSAGES.TOGGLE_SIDE_PANEL,
    withContext: true
  });
});

document.getElementById("openWindow").addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: MESSAGES.OPEN_DEEPSEEK_WINDOW,
    withContext: true
  });
});

document.getElementById("openTab").addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: MESSAGES.OPEN_DEEPSEEK_TAB,
    withContext: true
  });
});

document.getElementById("openShortcuts").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: MESSAGES.OPEN_SHORTCUTS_PAGE });
});

loadShortcuts().catch(() => {});

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const byName = new Map(commands.map((command) => [command.name, command]));

  const list = document.getElementById("shortcuts");
  list.replaceChildren();

  for (const name of COMMAND_ORDER) {
    const command = byName.get(name);
    if (!command) continue;

    const row = document.createElement("div");
    row.className = "shortcut-row";

    const label = document.createElement("span");
    label.textContent = command.description || name;

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
