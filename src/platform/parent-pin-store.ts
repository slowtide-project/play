/**
 * Local persistence for the parent PIN (the impure edge, D-13, FR-29b).
 *
 * The PIN is a device-local soft barrier against a child, not a security
 * credential (NFR-10), so it is stored as-is. Every read is validated, and every
 * failure degrades quietly: a missing or corrupt value reads as "no PIN set",
 * which sends the gate into its set-a-PIN flow rather than breaking (NFR-11).
 */

import { isValidPin, type PinPort } from "../parent/parent-pin.js";

const KEY = "slowtide.parentPin";

export function createParentPinStore(): PinPort {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw !== null && isValidPin(raw) ? raw : null;
      } catch {
        return null;
      }
    },
    write(pin) {
      if (!isValidPin(pin)) return;
      try {
        window.localStorage.setItem(KEY, pin);
      } catch (error) {
        console.warn("slowtide: could not persist parent PIN", error);
      }
    },
  };
}
