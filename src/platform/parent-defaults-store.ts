/**
 * Local persistence for parent defaults — the setup pre-fills (FR-1a).
 *
 * This is an impure edge, kept separate from the session record store so the
 * two never entangle: defaults are pre-fills only and must never behave like
 * live session state. Every read is sanitised, and every failure degrades
 * quietly to the safe baseline so storage problems can never reach the child
 * surface (NFR-11, I-5).
 */

import { DEFAULT_PARENT_DEFAULTS, sanitiseDefaults } from "../parent/parent-defaults.js";
import type { ParentDefaults } from "../parent/parent-defaults.js";

const KEY = "slowtide.parentDefaults";

export interface ParentDefaultsStore {
  /** Always returns valid defaults; the baseline if nothing is stored. */
  load(): ParentDefaults;
  save(defaults: ParentDefaults): void;
}

export function createParentDefaultsStore(): ParentDefaultsStore {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw === null) return DEFAULT_PARENT_DEFAULTS;
        return sanitiseDefaults(JSON.parse(raw));
      } catch {
        return DEFAULT_PARENT_DEFAULTS;
      }
    },
    save(defaults) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(sanitiseDefaults(defaults)));
      } catch (error) {
        console.warn("slowtide: could not persist parent defaults", error);
      }
    },
  };
}
