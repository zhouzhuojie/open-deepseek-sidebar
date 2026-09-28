"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = path.join(__dirname, "..", "..", "src");
const MODULES = ["protocol.js", "context.js", "background.js"];

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) {
      listeners.push(fn);
    },
    removeListener(fn) {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    hasListener(fn) {
      return listeners.includes(fn);
    },
    emit(...args) {
      return listeners.map((fn) => fn(...args));
    }
  };
}

/**
 * Chrome mock covering every API src/background.js touches. Records calls so
 * tests can assert the toggle decision.
 */
function createChromeMock({
  contexts = [],
  tabs = [],
  storage = {},
  withSidePanelClose = true
} = {}) {
  const calls = {
    sidePanelOpen: [],
    sidePanelClose: [],
    windowsCreate: [],
    tabsCreate: [],
    sendMessage: [],
    setPopup: [],
    setPanelBehavior: [],
    contextMenusCreate: []
  };

  const events = {
    installed: createEvent(),
    startup: createEvent(),
    message: createEvent(),
    actionClicked: createEvent(),
    command: createEvent(),
    contextMenuClicked: createEvent()
  };

  const chrome = {
    runtime: {
      onInstalled: events.installed,
      onStartup: events.startup,
      onMessage: events.message,
      lastError: undefined,
      getContexts: async () => contexts,
      sendMessage: async (message) => {
        calls.sendMessage.push(message);
      },
      openOptionsPage: (callback) => {
        if (callback) callback();
      }
    },
    action: {
      setPopup(options) {
        calls.setPopup.push(options);
      },
      onClicked: events.actionClicked
    },
    commands: {
      onCommand: events.command,
      getAll: async () => []
    },
    contextMenus: {
      onClicked: events.contextMenuClicked,
      removeAll: (callback) => {
        if (callback) callback();
      },
      create(options) {
        calls.contextMenusCreate.push(options);
      }
    },
    sidePanel: {
      setPanelBehavior: async (options) => {
        calls.setPanelBehavior.push(options);
      },
      open: async (options) => {
        calls.sidePanelOpen.push(options);
      },
      ...(withSidePanelClose
        ? {
            close: async (options) => {
              calls.sidePanelClose.push(options);
            }
          }
        : {})
    },
    tabs: {
      query: async () => tabs,
      create: async (options) => {
        calls.tabsCreate.push(options);
        return options;
      }
    },
    windows: {
      create: async (options) => {
        calls.windowsCreate.push(options);
        return options;
      },
      getLastFocused: async () => ({ id: 5 })
    },
    storage: {
      session: {
        async set(items) {
          Object.assign(storage, items);
        },
        async get(key) {
          const out = {};
          if (Object.prototype.hasOwnProperty.call(storage, key)) {
            out[key] = storage[key];
          }
          return out;
        },
        async remove(key) {
          delete storage[key];
        }
      }
    }
  };

  return { chrome, calls, events, storage };
}

/**
 * Load protocol.js + context.js + background.js in a VM context. `importScripts`
 * is a no-op because the modules are executed explicitly.
 */
function loadBackground(options = {}) {
  const { chrome, calls, events, storage } = createChromeMock(options);

  const sandbox = {
    chrome,
    URL,
    URLSearchParams,
    Date,
    Math,
    console,
    setTimeout,
    clearTimeout,
    importScripts() {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const name of MODULES) {
    vm.runInContext(fs.readFileSync(path.join(SRC, name), "utf8"), sandbox, {
      filename: name
    });
  }

  return { chrome, calls, events, storage, sandbox, protocol: sandbox.DeepSeekProtocol };
}

/** Let queued microtasks and timers settle. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

module.exports = { loadBackground, createChromeMock, createEvent, settle };
