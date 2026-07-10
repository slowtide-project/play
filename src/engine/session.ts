/**
 * Session lifecycle and the engine's public surface.
 *
 * Key guarantees:
 *  - The budget is a pure function of wall-clock time and the session config
 *    (I-1). No method other than startSession / endSession changes state, and
 *    neither is reachable from the child surface, so no interaction can raise
 *    the budget (NFR-3, FR-22, FR-47).
 *  - Time is wall-clock; a reload mid-session resumes at the right position,
 *    and a session past its duration is over, never continued (FR-6, D-6).
 *  - Each start overwrites all prior state; nothing carries between sessions
 *    (FR-1a).
 *  - Any missing, malformed, or out-of-range state resolves to the neutral,
 *    lowest-arousal surface (I-5, NFR-11, FR-28).
 */

import { clamp, shape } from "./curve.js";
import { mapLevers } from "./levers.js";
import type {
  EngineState,
  EngineStatus,
  Phase,
  SessionConfig,
  SessionRecord,
  Storage,
} from "./types.js";

export const SCHEMA_VERSION = 1;

/** Default ceilings (no restriction) used for the record-less neutral surface. */
const OPEN_CEILINGS = { volume: 1, brightness: 1, motion: 1 } as const;

/** Phase boundaries as fractions of progress. Internal only (FR-3). */
function phaseFor(progress: number): Phase {
  if (progress < 0.2) return "engage";
  if (progress < 0.55) return "settle";
  if (progress < 0.9) return "drift";
  return "land";
}

/** The arousal budget for a record at a given elapsed time. Pure. */
function computeBudget(record: SessionRecord, elapsed: number): number {
  if (record.mode === "test") {
    if (record.frozenLevel !== null) return clamp(record.frozenLevel, 0, 1);
    if (!record.decayEnabled) return clamp(record.startCeiling, 0, 1);
  }
  const progress = clamp(elapsed / record.durationMs, 0, 1);
  return clamp(record.startCeiling, 0, 1) * shape(progress, record.steepness);
}

/** Build an inactive (neutral or ended) state: safe, dim, no invitation. */
function inactiveState(status: EngineStatus): EngineState {
  return {
    status,
    budget: 0,
    phase: null,
    progress: null,
    levers: mapLevers(0, OPEN_CEILINGS),
  };
}

function isValidRecord(record: SessionRecord | null): record is SessionRecord {
  return (
    record !== null &&
    record.version === SCHEMA_VERSION &&
    Number.isFinite(record.startEpoch) &&
    Number.isFinite(record.durationMs) &&
    record.durationMs > 0
  );
}

export interface Engine {
  /** Begin a fresh session at `now`, overwriting any prior state (FR-1, FR-1a). */
  startSession(config: SessionConfig, now: number): SessionRecord;
  /** Derive the current state from wall-clock `now`. Pure read. */
  getState(now: number): EngineState;
  /** End the current session (parent-invoked or on handover). */
  endSession(): void;
  isActive(now: number): boolean;
}

/**
 * Create an engine bound to a storage implementation. Time is always passed in,
 * never read internally, which keeps the engine pure and trivially testable.
 */
export function createEngine(storage: Storage): Engine {
  function getState(now: number): EngineState {
    const record = storage.load();
    if (!isValidRecord(record)) return inactiveState("neutral");

    const elapsed = now - record.startEpoch;
    if (!Number.isFinite(elapsed) || elapsed < 0) return inactiveState("neutral");
    if (elapsed >= record.durationMs) return inactiveState("ended");

    const budget = computeBudget(record, elapsed);
    const progress = clamp(elapsed / record.durationMs, 0, 1);
    return {
      status: "active",
      budget,
      phase: phaseFor(progress),
      progress,
      levers: mapLevers(budget, record.ceilings),
    };
  }

  return {
    startSession(config, now) {
      const record: SessionRecord = {
        ...config,
        startCeiling: clamp(config.startCeiling, 0, 1),
        steepness: config.steepness > 0 ? config.steepness : 1,
        startEpoch: now,
        version: SCHEMA_VERSION,
      };
      storage.save(record);
      return record;
    },
    getState,
    endSession() {
      storage.clear();
    },
    isActive(now) {
      return getState(now).status === "active";
    },
  };
}
