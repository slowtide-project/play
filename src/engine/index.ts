/** Public entry point for the Slowtide arousal-budget engine. */

export { createEngine, SCHEMA_VERSION } from "./session.js";
export type { Engine } from "./session.js";
export { shape, pchip, clamp } from "./curve.js";
export { mapLevers } from "./levers.js";
export type {
  Ceilings,
  EngineState,
  EngineStatus,
  LeverValues,
  Phase,
  SessionConfig,
  SessionMode,
  SessionRecord,
  Storage,
} from "./types.js";
