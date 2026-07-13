/**
 * Parent entry: the composed gate → setup flow that is the sole route into a
 * child session (FR-1, FR-1b). Nothing else in the app may start a session.
 *
 * The gate (FR-29) must pass before the setup step is shown. A cancelled or
 * failed gate resolves as a plain cancel, leaving the current state untouched.
 * From setup the parent can also change their PIN (D-13), which re-opens the
 * gate in its set-a-PIN flow and then returns to setup.
 */

import { openParentGate } from "./parent-gate.js";
import { openSessionSetup, type SetupResult } from "./session-setup.js";
import type { MenuMode, SetupState } from "./setup-config.js";
import type { PinPort } from "./parent-pin.js";

export type { SetupResult } from "./session-setup.js";
export { DEFAULT_SETUP } from "./setup-config.js";
export type { SetupState } from "./setup-config.js";
export type { PinPort } from "./parent-pin.js";

export interface ParentEntryOptions {
  /** Pre-filled setup form, built from saved parent defaults (FR-1a). */
  readonly initialSetup: SetupState;
  /** Whether a session is currently active (enables the "End" action). */
  readonly sessionActive: boolean;
  /** The parent PIN store; drives first-run set, entry, and change-PIN (D-13). */
  readonly pin: PinPort;
  /** Injectable randomness for the keypad shuffle (tests); defaults to Math.random. */
  readonly rng?: () => number;
  /**
   * Force the app to the latest deployed build now (parent-gated, NFR-7). When
   * provided, setup shows a "Check for updates" control; omitted in tests.
   */
  readonly onCheckForUpdates?: (() => void) | undefined;
  /**
   * Which tile this entry configures (D-14), passed through to setup to decide
   * the single top-level control. Omitted for the parent-corner settings entry.
   */
  readonly focus?: MenuMode | undefined;
}

/**
 * Open the parent gate, and on success the setup step. Resolves with the
 * parent's choice, or a cancel if the gate is dismissed. Choosing "change PIN"
 * from setup re-runs the gate's set flow and then reopens setup.
 */
export async function openParentEntry(
  host: HTMLElement,
  options: ParentEntryOptions,
): Promise<SetupResult> {
  const gate = openParentGate(host, { pin: options.pin, rng: options.rng });
  if (!(await gate.passed)) return { action: "cancel" };

  for (;;) {
    const result = await openSessionSetup(host, options.initialSetup, {
      sessionActive: options.sessionActive,
      onCheckForUpdates: options.onCheckForUpdates,
      focus: options.focus,
    });
    if (result.action !== "changePin") return result;
    // Re-verify by setting a new PIN, then return to setup either way.
    const setGate = openParentGate(host, { pin: options.pin, rng: options.rng, mode: "set" });
    await setGate.passed;
  }
}
