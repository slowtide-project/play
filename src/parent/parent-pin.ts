/**
 * Pure logic for the parent gate (FR-29, D-13).
 *
 * The gate must resist a persistent, observant child. Two mechanisms combine:
 * the gate is reached only by a hidden press-and-hold (handled in the app
 * composition root, FR-29a); and once revealed, the parent enters a PIN they
 * set themselves on a keypad whose digit positions reshuffle on every
 * presentation (FR-29b). A fixed tap pattern is therefore never repeatable, so
 * a watching child cannot learn the entry by motor memory.
 *
 * This module holds the PIN rules and the keypad shuffle only. It has no DOM
 * and no I/O; the random source is injected so the shuffle is deterministic
 * under test. Persistence lives behind {@link PinPort} in the platform layer.
 *
 * Threat model: the adversary is a child with physical access, not a remote or
 * technical attacker. The PIN is a soft barrier, stored locally on the device
 * (NFR-10); it is not a security credential and is not treated as one.
 */

/** Number of digits in a parent PIN. Four keeps a random tap a 1-in-10000 guess. */
export const PIN_LENGTH = 4;

/** The ten keypad digits, in canonical order before shuffling. */
const DIGITS: readonly string[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A local store for the parent PIN. `read` returns the saved PIN, or null if
 * none has been set yet (first run). `write` persists a new PIN. Both degrade
 * quietly on storage failure (NFR-11).
 */
export interface PinPort {
  read(): string | null;
  write(pin: string): void;
}

/** True only for a well-formed PIN: exactly {@link PIN_LENGTH} digits. */
export function isValidPin(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^[0-9]+$/.test(pin);
}

/** True when `entered` matches a valid `stored` PIN exactly. */
export function verifyPin(stored: string, entered: string): boolean {
  return isValidPin(stored) && entered === stored;
}

/**
 * Return the digits 0–9 in a freshly shuffled order (Fisher–Yates using the
 * injected `rng`, default `Math.random`). Called on every gate presentation and
 * after every wrong attempt, so no repeatable tap pattern exists (FR-29b).
 */
export function shuffledKeypad(rng: () => number = Math.random): readonly string[] {
  const digits = [...DIGITS];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(clamp01(rng()) * (i + 1));
    const di = digits[i];
    const dj = digits[j];
    if (di === undefined || dj === undefined) continue;
    digits[i] = dj;
    digits[j] = di;
  }
  return digits;
}

/** Clamp a possibly-misbehaving rng output into [0, 1). */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}
