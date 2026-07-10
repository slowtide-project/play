/**
 * The decay curve: a continuous, monotonically decreasing shape from 1 at the
 * start of a session to 0 at the end (FR-4, I-3).
 *
 * The shape is defined by monotone (shape-preserving) cubic interpolation over
 * a small set of anchor points tied to the phase model, so the curve holds high
 * through Engage and does most of its descent through Settle and Drift. Because
 * the anchors are monotonically decreasing, the interpolant cannot overshoot or
 * introduce a rising segment.
 */

/** Clamp a value into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Safe indexed read that satisfies noUncheckedIndexedAccess without `!`. */
function at(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`curve: index ${index} out of range`);
  }
  return value;
}

/** Anchor progress positions (0..1), aligned to the phase boundaries. */
const ANCHOR_PROGRESS: readonly number[] = [0, 0.2, 0.55, 0.9, 1];

/** Anchor shape values at steepness = 1. Endpoints 1 and 0 are fixed. */
const ANCHOR_VALUES: readonly number[] = [1, 0.85, 0.45, 0.1, 0];

/**
 * Fritsch-Carlson monotone cubic (PCHIP) interpolation.
 * Preserves the monotonicity of the input data.
 *
 * @param xs strictly increasing sample positions
 * @param ys sample values
 * @param x position to evaluate
 */
export function pchip(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n !== ys.length || n < 2) {
    throw new Error("pchip: xs and ys must be the same length and >= 2");
  }
  if (x <= at(xs, 0)) return at(ys, 0);
  if (x >= at(xs, n - 1)) return at(ys, n - 1);

  // Secant slopes between consecutive points.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    delta.push((at(ys, i + 1) - at(ys, i)) / (at(xs, i + 1) - at(xs, i)));
  }

  // Initial tangents.
  const m: number[] = new Array<number>(n);
  m[0] = at(delta, 0);
  m[n - 1] = at(delta, n - 2);
  for (let i = 1; i < n - 1; i++) {
    m[i] = (at(delta, i - 1) + at(delta, i)) / 2;
  }

  // Enforce monotonicity (Fritsch-Carlson).
  for (let i = 0; i < n - 1; i++) {
    const d = at(delta, i);
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = at(m, i) / d;
    const beta = at(m, i + 1) / d;
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }

  // Find the interval and evaluate the cubic Hermite basis.
  let k = 0;
  while (x > at(xs, k + 1)) k++;
  const h = at(xs, k + 1) - at(xs, k);
  const t = (x - at(xs, k)) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * at(ys, k) + h10 * h * at(m, k) + h01 * at(ys, k + 1) + h11 * h * at(m, k + 1);
}

/**
 * The normalised decay shape at a given progress and steepness.
 *
 * @param progress 0..1 session progress
 * @param steepness > 0; > 1 decays faster, < 1 gentler. Endpoints stay 1 and 0.
 * @returns a value in [0, 1], monotonically non-increasing in progress
 */
export function shape(progress: number, steepness: number): number {
  const p = clamp(progress, 0, 1);
  const k = steepness > 0 ? steepness : 1;
  // v ** k keeps 0 -> 0 and 1 -> 1, preserves ordering, and tunes the descent.
  const adjusted = ANCHOR_VALUES.map((v) => v ** k);
  return clamp(pchip(ANCHOR_PROGRESS, adjusted, p), 0, 1);
}
