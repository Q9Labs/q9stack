import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom ships no media-query engine, so components that read the system colour
 * scheme need one. Nothing in the suite depends on a query matching.
 */
window.matchMedia = (query: string): MediaQueryList => ({
  media: query,
  matches: false,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

/**
 * Node 24 exposes a `localStorage` global that throws unless the process was
 * started with `--localstorage-file`, and vitest's jsdom environment leaves it
 * undefined as a result. An in-memory Storage keeps persistence observable.
 */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage(),
});

afterEach(cleanup);
