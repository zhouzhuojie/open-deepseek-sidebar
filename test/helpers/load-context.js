"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = path.join(__dirname, "..", "..", "src");
const PROTOCOL_PATH = path.join(SRC, "protocol.js");
const CONTEXT_PATH = path.join(SRC, "context.js");

/**
 * Minimal `chrome` mock covering what src/context.js uses.
 */
function createChromeMock({ tabs = [], storage = {} } = {}) {
  return {
    tabs: {
      query: async () => tabs
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
}

/**
 * Load src/protocol.js then src/context.js (both IIFEs that assign to
 * `globalThis`) in an isolated VM context so each test starts clean.
 */
function loadContext({ chrome } = {}) {
  const sandbox = {
    chrome: chrome || createChromeMock(),
    URL,
    URLSearchParams,
    Date,
    Math,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const file of [PROTOCOL_PATH, CONTEXT_PATH]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, {
      filename: path.basename(file)
    });
  }

  return {
    api: sandbox.DeepSeekContext,
    protocol: sandbox.DeepSeekProtocol,
    sandbox
  };
}

module.exports = { loadContext, createChromeMock, CONTEXT_PATH, PROTOCOL_PATH };
