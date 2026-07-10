/**
 * Small, shared colour helpers for the toy worlds. Pure and DOM-free so they
 * can be unit tested and used from any scene.
 */

export type Rgb = readonly [number, number, number];

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Blend two colours; `t` is clamped to 0..1. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

/** Format a colour as a CSS string, with optional alpha. */
export function css(colour: Rgb, alpha = 1): string {
  return `rgba(${Math.round(colour[0])},${Math.round(colour[1])},${Math.round(colour[2])},${clamp01(alpha)})`;
}
