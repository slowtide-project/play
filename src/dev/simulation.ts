/**
 * Developer-only simulation harness around the pure engine.
 *
 * This drives the real engine (src/engine) through an in-memory storage so the
 * dev visualisation can sweep a whole session and read the budget and levers at
 * any point WITHOUT touching localStorage or changing any engine behaviour. The
 * engine stays a pure function of time; this is only a harness around it.
 *
 * Everything here is DOM- and timer-free so it can be unit tested in Node. The
 * DOM view (dev-view.ts) is the impure edge and is mounted only in the dev
 * build, so none of this can reach the child-facing surface.
 */

import { clamp, createEngine, mapLevers } from "../engine/index.js";
import type {
  Ceilings,
  EngineState,
  LeverValues,
  SessionConfig,
  SessionRecord,
  Storage,
} from "../engine/index.js";

/** Fixed synthetic session start; the harness works in progress-space (0..1). */
export const DEV_START_EPOCH = 0;

/** No-restriction ceilings, used to read a lever value before parent clamping. */
export const OPEN_CEILINGS: Ceilings = { volume: 1, brightness: 1, motion: 1 };

/** The parent-facing tuning knobs the dev view exposes as controls. */
export interface DevConfig {
  /** Session length in minutes (converted to ms for the engine). */
  readonly durationMin: number;
  /** Starting arousal level / curve ceiling, 0..1 (FR-10). */
  readonly startCeiling: number;
  /** Curve descent shaping, > 0 (FR-11). */
  readonly steepness: number;
  /** Parent volume ceiling, 0..1 (FR-12). */
  readonly volume: number;
  /** Parent brightness ceiling, 0..1 (FR-12). */
  readonly brightness: number;
  /** Parent motion ceiling, 0..1 (FR-12). */
  readonly motion: number;
  /** Test mode: hold the budget high instead of decaying it (FR-43). */
  readonly testDecayOff: boolean;
  /** Test mode: freeze the budget at {@link freezeLevel} (FR-44). */
  readonly freezeOn: boolean;
  /** The level to freeze at when {@link freezeOn} is set, 0..1. */
  readonly freezeLevel: number;
}

/** Sensible starting point for the controls: a full-intensity 90-minute session. */
export const DEFAULT_DEV_CONFIG: DevConfig = {
  durationMin: 90,
  startCeiling: 1,
  steepness: 1,
  volume: 1,
  brightness: 1,
  motion: 1,
  testDecayOff: false,
  freezeOn: false,
  freezeLevel: 0.5,
};

/**
 * Translate the dev controls into a real {@link SessionConfig}.
 *
 * Either test-mode toggle puts the session into `test` mode. Freeze takes
 * precedence over decay-off, matching the engine's own resolution order, so the
 * dev view shows exactly what the engine will do.
 */
export function toSessionConfig(c: DevConfig): SessionConfig {
  const testMode = c.testDecayOff || c.freezeOn;
  return {
    durationMs: c.durationMin * 60_000,
    startCeiling: c.startCeiling,
    steepness: c.steepness,
    mode: testMode ? "test" : "live",
    decayEnabled: !c.testDecayOff,
    frozenLevel: c.freezeOn ? c.freezeLevel : null,
    ceilings: { volume: c.volume, brightness: c.brightness, motion: c.motion },
  };
}

/** An in-memory {@link Storage} so the engine can run without the platform layer. */
export function createMemoryStorage(): Storage {
  let record: SessionRecord | null = null;
  return {
    load: () => record,
    save: (r) => {
      record = r;
    },
    clear: () => {
      record = null;
    },
  };
}

/** One point on the budget curve. */
export interface Sample {
  readonly progress: number;
  readonly budget: number;
}

export interface Simulation {
  /** The sanitised record the engine actually runs (echoes the config). */
  readonly record: SessionRecord;
  /** Engine state at a point in the session, progress 0..1. Pure read. */
  stateAt(progress: number): EngineState;
  /** Levers with no parent ceiling applied, to show what the ceilings clip. */
  uncappedLeversAt(progress: number): LeverValues;
  /** Evenly-spaced samples of the budget curve across the whole session. */
  sampleCurve(steps: number): Sample[];
}

/**
 * Build a simulation for one dev configuration. Internally it starts a real
 * session at {@link DEV_START_EPOCH} and reads state by mapping progress back to
 * a synthetic wall-clock time, so nothing about the engine is special-cased.
 */
export function createSimulation(config: SessionConfig): Simulation {
  const engine = createEngine(createMemoryStorage());
  const record = engine.startSession(config, DEV_START_EPOCH);

  function stateAt(progress: number): EngineState {
    const p = clamp(progress, 0, 1);
    return engine.getState(DEV_START_EPOCH + p * record.durationMs);
  }

  return {
    record,
    stateAt,
    uncappedLeversAt(progress) {
      return mapLevers(stateAt(progress).budget, OPEN_CEILINGS);
    },
    sampleCurve(steps) {
      const n = Math.max(2, Math.floor(steps));
      const out: Sample[] = [];
      for (let i = 0; i < n; i++) {
        const progress = i / (n - 1);
        out.push({ progress, budget: stateAt(progress).budget });
      }
      return out;
    },
  };
}
