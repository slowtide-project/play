/**
 * Parent defaults: the small set of values that persist between sessions only
 * as pre-filled starting points on the setup step (FR-1a, D-6).
 *
 * These are NOT live session state. They never carry an arousal budget, curve
 * position, or in-toy state; they are simply the last-used duration and
 * ceilings so the parent does not re-enter everything each night. Mode and the
 * test toggles are deliberately not persisted: every session defaults to a
 * plain live session and the parent must opt into test mode again each time.
 *
 * This module is pure (no DOM, no storage). Persistence lives in the platform
 * layer; loading always passes untrusted input through {@link sanitiseDefaults}
 * so a corrupt store degrades to the safe baseline rather than the child
 * surface breaking (I-5, NFR-11).
 */

import {
  DEFAULT_SETUP,
  SETUP_BOUNDS,
  clampToBounds,
  type Bounds,
  type SetupState,
} from "./setup-config.js";

export const PARENT_DEFAULTS_VERSION = 1;

/** The persistable subset of the setup form (FR-1a). */
export interface ParentDefaults {
  readonly durationMin: number;
  readonly startCeiling: number;
  readonly steepness: number;
  readonly volume: number;
  readonly brightness: number;
  readonly motion: number;
  /** Infinite-mode frozen calm level, applied when the Infinite tile is tapped (FR-56). */
  readonly infiniteLevel: number;
  readonly version: number;
}

/** The safe baseline, derived from the unconfigured setup default. */
export const DEFAULT_PARENT_DEFAULTS: ParentDefaults = {
  durationMin: DEFAULT_SETUP.durationMin,
  startCeiling: DEFAULT_SETUP.startCeiling,
  steepness: DEFAULT_SETUP.steepness,
  volume: DEFAULT_SETUP.volume,
  brightness: DEFAULT_SETUP.brightness,
  motion: DEFAULT_SETUP.motion,
  infiniteLevel: DEFAULT_SETUP.infiniteLevel,
  version: PARENT_DEFAULTS_VERSION,
};

/** Read one numeric field from untrusted input, clamped, else the fallback. */
function readNumber(value: unknown, fallback: number, bounds: Bounds): number {
  return typeof value === "number" ? clampToBounds(value, bounds) : fallback;
}

/**
 * Coerce anything loaded from storage into valid {@link ParentDefaults}.
 * Unknown shapes, wrong versions, and out-of-range values all resolve to the
 * safe baseline for that field (I-5).
 */
export function sanitiseDefaults(value: unknown): ParentDefaults {
  const raw: Record<string, unknown> =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    durationMin: readNumber(
      raw.durationMin,
      DEFAULT_PARENT_DEFAULTS.durationMin,
      SETUP_BOUNDS.durationMin,
    ),
    startCeiling: readNumber(
      raw.startCeiling,
      DEFAULT_PARENT_DEFAULTS.startCeiling,
      SETUP_BOUNDS.startCeiling,
    ),
    steepness: readNumber(raw.steepness, DEFAULT_PARENT_DEFAULTS.steepness, SETUP_BOUNDS.steepness),
    volume: readNumber(raw.volume, DEFAULT_PARENT_DEFAULTS.volume, SETUP_BOUNDS.ceiling),
    brightness: readNumber(
      raw.brightness,
      DEFAULT_PARENT_DEFAULTS.brightness,
      SETUP_BOUNDS.ceiling,
    ),
    motion: readNumber(raw.motion, DEFAULT_PARENT_DEFAULTS.motion, SETUP_BOUNDS.ceiling),
    infiniteLevel: readNumber(
      raw.infiniteLevel,
      DEFAULT_PARENT_DEFAULTS.infiniteLevel,
      SETUP_BOUNDS.infiniteLevel,
    ),
    version: PARENT_DEFAULTS_VERSION,
  };
}

/** Extract the persistable pre-fills from a confirmed setup (FR-1a). */
export function defaultsFromSetup(state: SetupState): ParentDefaults {
  return sanitiseDefaults({
    durationMin: state.durationMin,
    startCeiling: state.startCeiling,
    steepness: state.steepness,
    volume: state.volume,
    brightness: state.brightness,
    motion: state.motion,
    infiniteLevel: state.infiniteLevel,
    version: PARENT_DEFAULTS_VERSION,
  });
}

/**
 * Build a starting setup form from saved defaults. Mode is always live and the
 * test toggles are always off, so a session never silently starts in test mode
 * because a previous one did (FR-46).
 */
export function applyDefaults(defaults: ParentDefaults): SetupState {
  return {
    ...DEFAULT_SETUP,
    durationMin: defaults.durationMin,
    startCeiling: defaults.startCeiling,
    steepness: defaults.steepness,
    volume: defaults.volume,
    brightness: defaults.brightness,
    motion: defaults.motion,
    infiniteLevel: defaults.infiniteLevel,
  };
}
