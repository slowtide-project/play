/**
 * Pure timing helpers for the render loop, kept DOM-free so they can be unit
 * tested in Node.
 *
 * Two ideas keep the runtime cheap (FR-40, NFR-12):
 *  - The arousal budget changes very slowly, so it is resampled from the engine
 *    on a low-frequency cadence, not every animation frame.
 *  - The drawn frame rate follows the animation-speed lever: lively early, and
 *    dropping toward a near-static handful of frames a second during Land, so
 *    the device stays cool on a lap.
 */

/** How often the budget is resampled from the engine, in milliseconds. */
export const BUDGET_SAMPLE_MS = 1000;

/** Frames per second at the calmest (budget ~0) and liveliest (budget 1).
 *
 * The ceiling is deliberately below the display's 60Hz: the scene is soft and
 * drifting, so 40fps reads smoothly even at the liveliest, while cutting the
 * per-second render (and therefore heat and battery) most in the busy Engage
 * phase where the animation-speed lever is near 1 (NFR-12). */
export const MIN_FPS = 6;
export const MAX_FPS = 30;

/** Largest per-frame delta we hand a toy, so a paused tab cannot jump it. */
export const MAX_FRAME_DELTA_MS = 100;

/**
 * Largest device-pixel-ratio we render the canvas at. Retina iPads report 2 (or
 * more); the muted, low-contrast art does not need every backing pixel, and the
 * fill-rate saving from capping is large on an older GPU, which then shades far
 * fewer pixels per frame (NFR-12). Below this, the raw ratio is honoured.
 */
export const MAX_DEVICE_PIXEL_RATIO = 1.25;

/** Clamp a raw device-pixel-ratio into the range we actually render at. */
export function clampDevicePixelRatio(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Target milliseconds between drawn frames for a given animation-speed lever.
 * Higher speed means shorter interval (more frames); low speed throttles down
 * to {@link MIN_FPS} to save power.
 */
export function targetFrameInterval(animationSpeed: number): number {
  const fps = MIN_FPS + clamp01(animationSpeed) * (MAX_FPS - MIN_FPS);
  return 1000 / fps;
}

/** Clamp a raw frame delta into a safe range for a toy to integrate against. */
export function clampFrameDelta(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 1000 / MAX_FPS;
  return Math.min(deltaMs, MAX_FRAME_DELTA_MS);
}

// Daylight anchors across a 24-hour clock, mapping local time to a 0..1
// daylight value (1 = full day, ~0.4 = sunset, 0 = night).
const DAYLIGHT_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 0],
  [8, 1],
  [17, 1],
  [20, 0.35],
  [22, 0],
  [24, 0],
];

/**
 * Daylight for a local time in hours (0..24): full day through midday, a golden
 * fall through the evening, night from ~22:00, rising again at dawn. Lets a
 * scene take its light from the real clock rather than from session progress.
 */
export function daylightAtHour(hours: number): number {
  const h = Number.isFinite(hours) ? ((hours % 24) + 24) % 24 : 12;
  let prev = DAYLIGHT_ANCHORS[0] ?? [0, 0];
  for (let i = 1; i < DAYLIGHT_ANCHORS.length; i++) {
    const curr = DAYLIGHT_ANCHORS[i];
    if (curr === undefined) break;
    if (h <= curr[0]) {
      const span = curr[0] - prev[0] || 1;
      return clamp01(prev[1] + (curr[1] - prev[1]) * ((h - prev[0]) / span));
    }
    prev = curr;
  }
  return 0;
}

/** Daylight for an epoch-ms instant, using the local time zone. */
export function daylightAtEpoch(nowMs: number): number {
  const d = new Date(nowMs);
  return daylightAtHour(d.getHours() + d.getMinutes() / 60);
}
