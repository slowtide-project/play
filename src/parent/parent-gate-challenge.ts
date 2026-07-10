/**
 * Pure logic for the parent gate challenge (FR-29).
 *
 * The gate must resist a child's accidental or trial-and-error entry. The
 * chosen mechanism is a freshly-generated multi-digit code that the parent must
 * read and re-enter: a new code every time defeats memorised sequences, and
 * requiring the digits to be read defeats random tapping (a four-digit code is
 * a 1-in-10000 guess). This module only generates and checks codes; revealing
 * the keypad behind a deliberate press-and-hold is handled in the DOM layer.
 *
 * No DOM, no I/O — a random source is injected so the logic is deterministic
 * under test.
 */

/** The minimum code length that keeps a random tap improbable. */
export const MIN_CODE_LENGTH = 4;

export interface GateChallenge {
  /** The digit string the parent must reproduce, e.g. "4729". */
  readonly code: string;
}

/**
 * Generate a fresh challenge. `rng` returns a float in [0, 1) (defaults to
 * `Math.random`); `length` is clamped to at least {@link MIN_CODE_LENGTH}.
 */
export function makeGateChallenge(
  rng: () => number = Math.random,
  length: number = MIN_CODE_LENGTH,
): GateChallenge {
  const safeLength = Math.max(MIN_CODE_LENGTH, Math.floor(length));
  let code = "";
  for (let i = 0; i < safeLength; i++) {
    const digit = Math.floor(clamp01(rng()) * 10) % 10;
    code += String(digit);
  }
  return { code };
}

/** True only when the entered string exactly matches the challenge code. */
export function isGateAnswerCorrect(challenge: GateChallenge, entered: string): boolean {
  return entered === challenge.code;
}

/** Clamp a possibly-misbehaving rng output into [0, 1). */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}
