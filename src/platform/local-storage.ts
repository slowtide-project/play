/**
 * Local persistence for the session record (the impure edge, FR-41).
 * All failures degrade quietly: a session still runs from the in-memory record
 * even if storage is unavailable (NFR-11).
 */

import type { SessionRecord, Storage } from "../engine/index.js";

const KEY = "slowtide.session";

export function createLocalStorage(): Storage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw === null) return null;
        return JSON.parse(raw) as SessionRecord;
      } catch {
        return null;
      }
    },
    save(record) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(record));
      } catch (error) {
        console.warn("slowtide: could not persist session", error);
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(KEY);
      } catch (error) {
        console.warn("slowtide: could not clear session", error);
      }
    },
  };
}
