/**
 * Parent entry: the composed gate → setup flow that is the sole route into a
 * child session (FR-1, FR-1b). Nothing else in the app may start a session.
 *
 * The gate (FR-29) must pass before the setup step is shown. A cancelled or
 * failed gate resolves as a plain cancel, leaving the current state untouched.
 */

import { openParentGate } from "./parent-gate.js";
import { openSessionSetup, type SetupResult } from "./session-setup.js";
import type { SetupState } from "./setup-config.js";

export type { SetupResult } from "./session-setup.js";
export { DEFAULT_SETUP } from "./setup-config.js";
export type { SetupState } from "./setup-config.js";

export interface ParentEntryOptions {
  /** Pre-filled setup form, built from saved parent defaults (FR-1a). */
  readonly initialSetup: SetupState;
  /** Whether a session is currently active (enables the "End" action). */
  readonly sessionActive: boolean;
  /** Injectable randomness for the gate code (tests); defaults to Math.random. */
  readonly rng?: () => number;
}

/**
 * Open the parent gate, and on success the setup step. Resolves with the
 * parent's choice, or a cancel if the gate is dismissed.
 */
export async function openParentEntry(
  host: HTMLElement,
  options: ParentEntryOptions,
): Promise<SetupResult> {
  const gate = openParentGate(host, options.rng);
  const passed = await gate.passed;
  if (!passed) return { action: "cancel" };
  return openSessionSetup(host, options.initialSetup, {
    sessionActive: options.sessionActive,
  });
}
