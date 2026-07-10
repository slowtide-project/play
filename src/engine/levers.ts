/**
 * Lever mapping: turn the single arousal budget into the sensory and
 * interaction parameters every toy reads from (Section 3 of the concept, FR-9).
 *
 * Each lever interpolates linearly between a low-arousal and a high-arousal
 * endpoint, then is clamped by the relevant parent ceiling (FR-12). Clamping is
 * done here, centrally, so no individual toy can breach a safety limit.
 */

import { clamp } from "./curve.js";
import type { Ceilings, LeverValues } from "./types.js";

/** Interpolate a lever from the budget and clamp to [0, ceiling]. */
function lever(budget: number, low: number, high: number, ceiling = 1): number {
  const b = clamp(budget, 0, 1);
  return clamp(low + b * (high - low), 0, ceiling);
}

/** Low (budget 0) and high (budget 1) endpoints for each lever, all 0..1. */
const ENDPOINTS = {
  animationSpeed: { low: 0.05, high: 1 },
  colourSaturation: { low: 0.15, high: 1 },
  brightness: { low: 0.25, high: 1 },
  audioTempo: { low: 0.2, high: 1 },
  audioVolume: { low: 0.1, high: 1 },
  interactionFrequency: { low: 0, high: 1 },
  rewardIntensity: { low: 0.1, high: 1 },
  contentNovelty: { low: 0, high: 1 },
} as const;

/**
 * Map a budget to the full set of lever values, applying parent ceilings.
 *
 * @param budget arousal budget, 0..1
 * @param ceilings parent-set maximum volume, brightness, and motion (FR-12)
 */
export function mapLevers(budget: number, ceilings: Ceilings): LeverValues {
  return {
    animationSpeed: lever(
      budget,
      ENDPOINTS.animationSpeed.low,
      ENDPOINTS.animationSpeed.high,
      ceilings.motion,
    ),
    colourSaturation: lever(
      budget,
      ENDPOINTS.colourSaturation.low,
      ENDPOINTS.colourSaturation.high,
    ),
    brightness: lever(
      budget,
      ENDPOINTS.brightness.low,
      ENDPOINTS.brightness.high,
      ceilings.brightness,
    ),
    audioTempo: lever(budget, ENDPOINTS.audioTempo.low, ENDPOINTS.audioTempo.high),
    audioVolume: lever(
      budget,
      ENDPOINTS.audioVolume.low,
      ENDPOINTS.audioVolume.high,
      ceilings.volume,
    ),
    interactionFrequency: lever(
      budget,
      ENDPOINTS.interactionFrequency.low,
      ENDPOINTS.interactionFrequency.high,
    ),
    // Rewards involve both sound and motion, so cap by the stricter of the two.
    rewardIntensity: lever(
      budget,
      ENDPOINTS.rewardIntensity.low,
      ENDPOINTS.rewardIntensity.high,
      Math.min(ceilings.volume, ceilings.motion),
    ),
    contentNovelty: lever(budget, ENDPOINTS.contentNovelty.low, ENDPOINTS.contentNovelty.high),
  };
}
