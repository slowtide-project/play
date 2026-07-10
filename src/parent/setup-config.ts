/**
 * Pure translation of the parent setup form into a {@link SessionConfig}.
 *
 * This module holds no DOM and no I/O; it only sanitises and maps what the
 * parent chose at setup (FR-1) into the immutable config the engine runs. All
 * values are clamped to safe bounds so a malformed control can never hand the
 * engine an out-of-range setting (I-5).
 *
 * The load-bearing rule here is FR-46: a live session always decays and is
 * never frozen, regardless of any test toggles left set. Test mode is the only
 * place decay-off (FR-43) or a frozen level (FR-44) can take effect.
 */

import { clamp } from "../engine/index.js";
import type { SessionConfig, SessionMode } from "../engine/index.js";

/** A numeric range used both to build sliders and to clamp their output. */
export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** Preset session durations offered at setup, in minutes (FR-2). */
export const DURATION_PRESETS_MIN: readonly number[] = [60, 90];

/** Safe bounds for every parent-tunable value, in one place. */
export const SETUP_BOUNDS = {
  /** 1 min to 3 h covers both bedtime sessions and short daytime tests (FR-45). */
  durationMin: { min: 1, max: 180 },
  /** Never start from silence; a very low ceiling would defeat the point (FR-10). */
  startCeiling: { min: 0.2, max: 1 },
  /** Matches the engine's supported descent range (design 2.3, FR-11). */
  steepness: { min: 0.6, max: 1.6 },
  /** Parent ceilings clamp levers to 0..1 (FR-12). */
  ceiling: { min: 0, max: 1 },
  /** Frozen test level, 0..1 (FR-44). */
  frozenLevel: { min: 0, max: 1 },
} as const satisfies Record<string, Bounds>;

/**
 * The editable state of the setup form: exactly what the parent is choosing
 * before confirming. Test toggles are always present but only take effect when
 * {@link mode} is `test`.
 */
export interface SetupState {
  readonly mode: SessionMode;
  readonly durationMin: number;
  /** Starting arousal level / curve ceiling (FR-10). */
  readonly startCeiling: number;
  /** Curve descent shaping (FR-11). */
  readonly steepness: number;
  readonly volume: number;
  readonly brightness: number;
  readonly motion: number;
  /** Test mode: hold the budget high instead of decaying it (FR-43). */
  readonly decayOff: boolean;
  /** Test mode: freeze the budget at {@link freezeLevel} (FR-44). */
  readonly freezeOn: boolean;
  readonly freezeLevel: number;
}

/** A full-intensity 90-minute live session: the safe, unconfigured baseline. */
export const DEFAULT_SETUP: SetupState = {
  mode: "live",
  durationMin: 90,
  startCeiling: 1,
  steepness: 1,
  volume: 1,
  brightness: 1,
  motion: 1,
  decayOff: false,
  freezeOn: false,
  freezeLevel: 0.5,
};

/** Clamp a value into bounds, falling back to the low bound if non-finite (I-5). */
export function clampToBounds(value: number, bounds: Bounds): number {
  if (!Number.isFinite(value)) return bounds.min;
  return clamp(value, bounds.min, bounds.max);
}

/**
 * Map the sanitised setup form to the engine's {@link SessionConfig}.
 *
 * Live sessions always run with decay on and no frozen level (FR-46); the test
 * toggles are ignored unless the parent explicitly chose test mode. In test
 * mode a frozen level takes precedence over decay-off, matching the engine's
 * own resolution order so setup and engine never disagree.
 */
export function toSessionConfig(state: SetupState): SessionConfig {
  const durationMin = clampToBounds(state.durationMin, SETUP_BOUNDS.durationMin);
  const base = {
    durationMs: Math.round(durationMin * 60_000),
    startCeiling: clampToBounds(state.startCeiling, SETUP_BOUNDS.startCeiling),
    steepness: clampToBounds(state.steepness, SETUP_BOUNDS.steepness),
    ceilings: {
      volume: clampToBounds(state.volume, SETUP_BOUNDS.ceiling),
      brightness: clampToBounds(state.brightness, SETUP_BOUNDS.ceiling),
      motion: clampToBounds(state.motion, SETUP_BOUNDS.ceiling),
    },
  };

  if (state.mode === "live") {
    return { ...base, mode: "live", decayEnabled: true, frozenLevel: null };
  }

  return {
    ...base,
    mode: "test",
    decayEnabled: !state.decayOff,
    frozenLevel: state.freezeOn ? clampToBounds(state.freezeLevel, SETUP_BOUNDS.frozenLevel) : null,
  };
}
