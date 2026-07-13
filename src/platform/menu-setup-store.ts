/**
 * Local persistence for which opening-menu tiles have completed their first-run
 * setup (D-14). A tile's very first use routes the parent through the gate and
 * setup before the session starts; once that has happened for a given mode, later
 * taps of that tile start immediately from the saved defaults.
 *
 * This is a device-local convenience flag, not session state (D-6) and not a
 * security barrier (NFR-10). Every read is defensive: a missing or corrupt value
 * reads as "not yet configured", which simply means the parent is shown setup one
 * more time rather than anything breaking (NFR-11, I-5).
 */

import type { MenuMode } from "../parent/setup-config.js";

const KEY = "slowtide.menuConfigured";

export interface MenuSetupStore {
  /** True once this tile has been through its first-run setup. */
  isConfigured(mode: MenuMode): boolean;
  /** Record that this tile has completed its first-run setup. */
  markConfigured(mode: MenuMode): void;
}

function readSet(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function createMenuSetupStore(): MenuSetupStore {
  return {
    isConfigured(mode) {
      return readSet()[mode] === true;
    },
    markConfigured(mode) {
      try {
        const next = { ...readSet(), [mode]: true };
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch (error) {
        console.warn("slowtide: could not persist menu setup flag", error);
      }
    },
  };
}
