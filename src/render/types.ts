/**
 * The contract between the render surface and a toy.
 *
 * A toy draws frames and receives pointer input, but owns none of its own
 * pacing: every speed, colour, and reward value it uses must come from the
 * {@link ToyFrame.levers} the surface hands it, which are derived from the
 * single arousal budget (FR-8, FR-24). This keeps the wind-down consistent
 * across every toy and impossible to raise by interaction (NFR-3, FR-22).
 */

import type { LeverValues, Phase } from "../engine/index.js";

/** A pointer interaction, in CSS pixels relative to the canvas. */
export interface ToyPointer {
  readonly type: "down" | "move" | "up";
  readonly x: number;
  readonly y: number;
}

/** Everything a toy needs to draw one frame. Sizes are in CSS pixels. */
export interface ToyFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  /** Milliseconds since the previous drawn frame, clamped to a sane range. */
  readonly dt: number;
  /** Milliseconds since the toy was initialised for this session. */
  readonly time: number;
  /** Ceiling-clamped sensory outputs for right now (FR-9, FR-12). */
  readonly levers: LeverValues;
  /** Current arousal budget, 0..1. */
  readonly budget: number;
  /**
   * Daylight from the real local clock, 0..1 (1 = day, ~0.4 = sunset, 0 =
   * night). Drives a scene's light independently of the budget, so the world
   * looks like the time of day outside while the budget winds down the activity.
   */
  readonly timeOfDay: number;
  /** Internal phase, for coarse behavioural switches only (FR-3, I-6). */
  readonly phase: Phase | null;
  /** True when the user has asked for reduced motion (NFR-5, WCAG 2.3). */
  readonly reducedMotion: boolean;
}

/**
 * A self-contained digital toy (D-1). The surface owns the canvas and the
 * loop; the toy only reacts to lifecycle calls.
 */
export interface Toy {
  readonly id: string;
  /** Begin a fresh instance for a new session; no state carries over (D-6). */
  init(width: number, height: number, rng?: () => number): void;
  /** The canvas CSS size changed. */
  resize(width: number, height: number): void;
  /** A pointer event within the canvas. Repetition is always honoured (FR-19). */
  pointer(pointer: ToyPointer): void;
  /** Draw one frame using only {@link ToyFrame} values for pacing (FR-24). */
  draw(frame: ToyFrame): void;
}
