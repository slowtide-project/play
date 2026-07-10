import { describe, it, expect } from "vitest";
import { shape, pchip, clamp } from "./curve.js";

describe("clamp", () => {
  it("bounds values to the range", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe("pchip", () => {
  it("returns anchor values at the anchor positions", () => {
    const xs = [0, 0.5, 1];
    const ys = [1, 0.4, 0];
    expect(pchip(xs, ys, 0)).toBeCloseTo(1);
    expect(pchip(xs, ys, 0.5)).toBeCloseTo(0.4);
    expect(pchip(xs, ys, 1)).toBeCloseTo(0);
  });

  it("preserves monotonicity of decreasing data", () => {
    const xs = [0, 0.2, 0.55, 0.9, 1];
    const ys = [1, 0.85, 0.45, 0.1, 0];
    let prev = Infinity;
    for (let i = 0; i <= 200; i++) {
      const y = pchip(xs, ys, i / 200);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
  });

  it("handles a flat segment without introducing a rise", () => {
    const xs = [0, 0.5, 1];
    const ys = [1, 1, 0]; // flat then falling; exercises the zero-slope branch
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const y = pchip(xs, ys, i / 100);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
  });

  it("clamps steep tangents to stay monotone", () => {
    const xs = [0, 0.05, 1];
    const ys = [1, 0.02, 0]; // sharp early drop; exercises the tangent-limit branch
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const y = pchip(xs, ys, i / 100);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      expect(Number.isFinite(y)).toBe(true);
      prev = y;
    }
  });

  it("throws on malformed input", () => {
    expect(() => pchip([0], [1], 0.5)).toThrow();
    expect(() => pchip([0, 1], [1], 0.5)).toThrow();
  });
});

describe("shape", () => {
  const steepnesses = [0.6, 1, 1.6];

  it("has fixed endpoints of 1 and 0 for any steepness", () => {
    for (const k of steepnesses) {
      expect(shape(0, k)).toBeCloseTo(1);
      expect(shape(1, k)).toBeCloseTo(0);
    }
  });

  it("is monotonically non-increasing across the session (FR-4)", () => {
    for (const k of steepnesses) {
      let prev = Infinity;
      for (let i = 0; i <= 200; i++) {
        const v = shape(i / 200, k);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
    }
  });

  it("higher steepness gives a lower mid-session budget (FR-11)", () => {
    expect(shape(0.5, 1.6)).toBeLessThan(shape(0.5, 0.6));
  });

  it("clamps out-of-range progress", () => {
    expect(shape(-5, 1)).toBeCloseTo(1);
    expect(shape(5, 1)).toBeCloseTo(0);
  });
});
