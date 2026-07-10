/**
 * The runtime dev-mode unlock: a hidden, parent-only switch for the deployed
 * build. Off by default (so a normal launch stays child-safe, FR-1b), opened by
 * `?dev=on` and remembered, closed by `?dev=off`.
 */
import { describe, it, expect } from "vitest";
import { runtimeUnlock, DEV_STORAGE_KEY } from "./dev-mode.js";

/** A minimal in-memory Storage for the test. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("runtimeUnlock (deployed dev switch)", () => {
  it("is off by default with no query and nothing stored", () => {
    expect(runtimeUnlock("", fakeStorage())).toBe(false);
  });

  it("unlocks and remembers on ?dev=on", () => {
    const storage = fakeStorage();
    expect(runtimeUnlock("?dev=on", storage)).toBe(true);
    expect(storage.getItem(DEV_STORAGE_KEY)).toBe("1");
    // A later launch with no query still reads as unlocked.
    expect(runtimeUnlock("", storage)).toBe(true);
  });

  it("locks and forgets on ?dev=off", () => {
    const storage = fakeStorage({ [DEV_STORAGE_KEY]: "1" });
    expect(runtimeUnlock("?dev=off", storage)).toBe(false);
    expect(storage.getItem(DEV_STORAGE_KEY)).toBeNull();
    expect(runtimeUnlock("", storage)).toBe(false);
  });

  it("ignores unrelated queries and leaves the stored state intact", () => {
    expect(runtimeUnlock("?foo=bar", fakeStorage({ [DEV_STORAGE_KEY]: "1" }))).toBe(true);
    expect(runtimeUnlock("?foo=bar", fakeStorage())).toBe(false);
  });
});
