/**
 * Core types for the Slowtide arousal-budget engine.
 *
 * The engine is a pure module: given the wall-clock time and a session
 * configuration it produces the arousal budget and the derived sensory /
 * interaction levers. Nothing here touches the DOM, timers, or I/O.
 */

export type SessionMode = "live" | "test" | "infinite";

/** Parent-set upper limits the engine output must never exceed (FR-12). All 0..1. */
export interface Ceilings {
  readonly volume: number;
  readonly brightness: number;
  readonly motion: number;
}

/** Everything the parent selects at the setup step (FR-1) for one session. */
export interface SessionConfig {
  /** Chosen session length in milliseconds (FR-2, FR-45). */
  readonly durationMs: number;
  /** Starting arousal level / curve ceiling, 0..1 (FR-10). */
  readonly startCeiling: number;
  /** Curve descent shaping, > 0. 1 is the baseline (FR-11). */
  readonly steepness: number;
  readonly mode: SessionMode;
  /** Live sessions always decay. Test and infinite modes hold steady (FR-43, D-12). */
  readonly decayEnabled: boolean;
  /**
   * Hold the budget at this level, 0..1, else null. Used by test mode (FR-44)
   * and by Infinite mode, which runs frozen at a parent-set calm level (D-12).
   */
  readonly frozenLevel: number | null;
  readonly ceilings: Ceilings;
}

/** A persisted, time-anchored session. The only cross-launch state (FR-41). */
export interface SessionRecord extends SessionConfig {
  /** Wall-clock start, ms since epoch, fixed at setup confirmation (FR-1, I-2). */
  readonly startEpoch: number;
  /** Schema version, for forward-safe storage upgrades. */
  readonly version: number;
}

/** Internal phase, derived from progress. Never shown to the child (FR-3, I-6). */
export type Phase = "engage" | "settle" | "drift" | "land";

/** Normalised sensory / interaction outputs, each 0..1. */
export interface LeverValues {
  readonly animationSpeed: number;
  readonly colourSaturation: number;
  readonly brightness: number;
  readonly audioTempo: number;
  readonly audioVolume: number;
  readonly interactionFrequency: number;
  readonly rewardIntensity: number;
  readonly contentNovelty: number;
}

export type EngineStatus = "neutral" | "active" | "ended";

export interface EngineState {
  readonly status: EngineStatus;
  /** Current arousal budget, 0..1. */
  readonly budget: number;
  /** Internal only; null when not in an active session. */
  readonly phase: Phase | null;
  /** Session progress 0..1; null when not in an active session. */
  readonly progress: number | null;
  readonly levers: LeverValues;
}

/**
 * Persistence boundary. Implemented by the platform layer (localStorage /
 * IndexedDB) and by an in-memory fake in tests, keeping the engine pure.
 */
export interface Storage {
  load(): SessionRecord | null;
  save(record: SessionRecord): void;
  clear(): void;
}
