"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CONTEXT_PATH = path.join(__dirname, "..", "..", "src", "context.js");

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
 * Load src/context.js (an IIFE that assigns `globalThis.DeepSeekContext`) in
 * an isolated VM context so each test starts clean.
 */
function loadContext({ chrome } = {}) {
  const code = fs.readFileSync(CONTEXT_PATH, "utf8");
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
  vm.runInContext(code, sandbox);
  return { api: sandbox.DeepSeekContext, sandbox };
}

module.exports = { loadContext, createChromeMock, CONTEXT_PATH };
