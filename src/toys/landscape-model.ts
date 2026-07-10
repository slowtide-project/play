/**
 * Pure model for the atmospheric landscape worlds, free of any DOM so it can be
 * unit tested. It turns the single arousal budget into the mood of the scene —
 * a muted, naturalistic wind-down from a hazy daytime, through a warm sunset,
 * to a deep moonlit night — and provides the seamless-scroll maths the worlds
 * use to place scenery endlessly without seams.
 *
 * The palette is deliberately soft and desaturated, not bold and primary. The
 * whole atmosphere is a continuous function of the budget (FR-4, FR-8): nothing
 * steps, and there is no clock — the child just feels the light fade (NFR-1).
 */

import { clamp01, lerp, mix, type Rgb } from "./colour.js";

export { css, mix, clamp01, type Rgb } from "./colour.js";

/** Deterministic pseudo-random value in [0, 1) for an integer index. */
export function hash(index: number): number {
  const x = Math.sin(index * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The inclusive index range of repeating scenery whose copies can be visible
 * for a scroll offset, so a world draws only what's on screen and never leaves
 * a seam. Pure: positions are a function of index, so scrolling simply reveals
 * more indices.
 */
export function visibleRange(
  scroll: number,
  depth: number,
  spacing: number,
  width: number,
  margin: number,
): { readonly start: number; readonly end: number } {
  const off = scroll * depth;
  const start = Math.floor((off - margin) / spacing);
  const end = Math.ceil((off + width + margin) / spacing);
  return { start, end };
}

// ---- 2.5D camera / perspective ------------------------------------------
// A shallow depth model for "walking through" a scene: scenery has a relative
// depth from the camera, projected to a screen scale and a ground height.

/** Nearest and farthest depth the camera renders. The near plane is very close
 * so trees grow large and only leave as you actually pass them (eye-level). */
export const CAM_NEAR = 0.12;
export const CAM_FAR = 26;

/** Screen scale for an object at relative depth `d` (closer is larger). */
export function perspectiveScale(depthRel: number, focal: number): number {
  return focal / Math.max(CAM_NEAR, depthRel);
}

/**
 * Screen y of a point on the ground at relative depth `d`: near the bottom when
 * close, rising to `horizonY` as it recedes (the vanishing point).
 */
export function groundYAtDepth(depthRel: number, horizonY: number, spread: number): number {
  return horizonY + spread * (CAM_NEAR / Math.max(CAM_NEAR, depthRel));
}

/** Haze fraction for depth: 0 up close, 1 at the far plane. */
export function depthHaze(depthRel: number): number {
  return clamp01((depthRel - 2) / (CAM_FAR - 2));
}

/**
 * Tree density at a relative depth: sparse up close (an open, walkable path)
 * ramping to full density by `rampEnd`, so the wood reads deep without a wall
 * right in front of the walker.
 */
export function densityAtDepth(
  depthRel: number,
  near: number,
  far: number,
  rampEnd: number,
): number {
  const t = clamp01((depthRel - CAM_NEAR) / Math.max(0.001, rampEnd - CAM_NEAR));
  return near + (far - near) * t;
}

/** A full atmosphere snapshot for one budget value. */
export interface Atmosphere {
  readonly skyTop: Rgb;
  readonly skyBottom: Rgb;
  readonly hillFar: Rgb;
  readonly hillNear: Rgb;
  readonly pine: Rgb;
  readonly ground: Rgb;
  /** Star / firefly visibility, 0..1. */
  readonly starAlpha: number;
  /** Strength of the moon's glow halo, 0..1. */
  readonly moonGlow: number;
  readonly celestialColour: Rgb;
  /** Vertical position of the sun/moon, 0 (top) to 1 (horizon). */
  readonly celestialY: number;
  readonly isMoon: boolean;
}

// Keyframes taken from the reference scenes: hazy day, warm sunset, deep night.
const DAY: Atmosphere = {
  skyTop: [138, 167, 192],
  skyBottom: [193, 210, 216],
  hillFar: [150, 168, 172],
  hillNear: [96, 122, 98],
  pine: [58, 82, 64],
  ground: [86, 106, 76],
  starAlpha: 0,
  moonGlow: 0,
  celestialColour: [246, 240, 214],
  celestialY: 0.2,
  isMoon: false,
};
const SUNSET: Atmosphere = {
  skyTop: [74, 59, 102],
  skyBottom: [236, 166, 110],
  hillFar: [92, 112, 142],
  hillNear: [52, 70, 92],
  pine: [14, 16, 24],
  ground: [40, 54, 40],
  starAlpha: 0.1,
  moonGlow: 0.15,
  celestialColour: [255, 170, 110],
  celestialY: 0.52,
  isMoon: false,
};
const NIGHT: Atmosphere = {
  skyTop: [18, 20, 44],
  skyBottom: [34, 38, 66],
  hillFar: [30, 36, 62],
  hillNear: [22, 26, 48],
  pine: [8, 10, 20],
  ground: [16, 20, 34],
  starAlpha: 1,
  moonGlow: 1,
  celestialColour: [240, 242, 250],
  celestialY: 0.28,
  isMoon: true,
};

/** Budget at and below which the sun has set and the moon is out. */
export const SUNSET_AT = 0.4;

function blend(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  return {
    skyTop: mix(a.skyTop, b.skyTop, t),
    skyBottom: mix(a.skyBottom, b.skyBottom, t),
    hillFar: mix(a.hillFar, b.hillFar, t),
    hillNear: mix(a.hillNear, b.hillNear, t),
    pine: mix(a.pine, b.pine, t),
    ground: mix(a.ground, b.ground, t),
    starAlpha: lerp(a.starAlpha, b.starAlpha, t),
    moonGlow: lerp(a.moonGlow, b.moonGlow, t),
    celestialColour: mix(a.celestialColour, b.celestialColour, t),
    celestialY: lerp(a.celestialY, b.celestialY, t),
    isMoon: t > 0.5 ? b.isMoon : a.isMoon,
  };
}

/**
 * The atmosphere for a budget: day↔sunset above {@link SUNSET_AT}, then
 * sunset↔night below it, so the scene darkens continuously across the session.
 */
export function atmosphere(budget: number): Atmosphere {
  const b = clamp01(budget);
  if (b >= SUNSET_AT) {
    return blend(SUNSET, DAY, (b - SUNSET_AT) / (1 - SUNSET_AT));
  }
  return blend(NIGHT, SUNSET, b / SUNSET_AT);
}
