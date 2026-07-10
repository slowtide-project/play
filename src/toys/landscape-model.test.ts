import { describe, it, expect } from "vitest";
import {
  CAM_FAR,
  CAM_NEAR,
  SUNSET_AT,
  atmosphere,
  densityAtDepth,
  depthHaze,
  groundYAtDepth,
  hash,
  perspectiveScale,
  visibleRange,
  type Rgb,
} from "./landscape-model.js";

const lum = (c: Rgb): number => c[0] + c[1] + c[2];

describe("atmosphere", () => {
  it("darkens the sky continuously from day to night", () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const b = 1 - i / 20;
      const l = lum(atmosphere(b).skyTop);
      expect(l).toBeLessThanOrEqual(prev + 1e-6);
      prev = l;
    }
  });

  it("brings out stars and moon glow as it darkens", () => {
    expect(atmosphere(1).starAlpha).toBe(0);
    expect(atmosphere(0).starAlpha).toBeGreaterThan(0.5);
    expect(atmosphere(0).moonGlow).toBeGreaterThan(atmosphere(1).moonGlow);
  });

  it("shows a moon only deep in the session", () => {
    expect(atmosphere(1).isMoon).toBe(false);
    expect(atmosphere(SUNSET_AT).isMoon).toBe(false);
    expect(atmosphere(0.05).isMoon).toBe(true);
  });

  it("keeps pines darkest at night (silhouettes)", () => {
    expect(lum(atmosphere(0).pine)).toBeLessThan(lum(atmosphere(1).pine));
  });
});

describe("hash", () => {
  it("is deterministic and within [0, 1)", () => {
    for (let i = -5; i < 50; i++) {
      const h = hash(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(hash(i)).toBe(h);
    }
  });

  it("varies between neighbours", () => {
    expect(hash(1)).not.toBe(hash(2));
  });
});

describe("perspective (2.5D walk)", () => {
  it("makes closer things larger", () => {
    expect(perspectiveScale(CAM_NEAR, 500)).toBeGreaterThan(perspectiveScale(CAM_FAR, 500));
  });

  it("clamps depth at the near plane so scale cannot blow up", () => {
    expect(perspectiveScale(0.0001, 500)).toBe(perspectiveScale(CAM_NEAR, 500));
    expect(Number.isFinite(perspectiveScale(0, 500))).toBe(true);
  });

  it("ground rises toward the horizon as depth grows", () => {
    const near = groundYAtDepth(CAM_NEAR, 400, 200);
    const far = groundYAtDepth(CAM_FAR, 400, 200);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(400);
    expect(groundYAtDepth(1e6, 400, 200)).toBeCloseTo(400, 0);
  });

  it("haze grows with depth, 0 near and 1 far", () => {
    expect(depthHaze(0)).toBe(0);
    expect(depthHaze(CAM_FAR)).toBeCloseTo(1);
    expect(depthHaze(10)).toBeGreaterThan(depthHaze(5));
  });

  it("density is sparse near and thickens with depth", () => {
    expect(densityAtDepth(CAM_NEAR, 0.3, 0.85, 9)).toBeCloseTo(0.3);
    expect(densityAtDepth(9, 0.3, 0.85, 9)).toBeCloseTo(0.85);
    expect(densityAtDepth(20, 0.3, 0.85, 9)).toBeCloseTo(0.85);
    expect(densityAtDepth(4, 0.3, 0.85, 9)).toBeGreaterThan(densityAtDepth(1, 0.3, 0.85, 9));
  });
});

describe("visibleRange (seamless scroll)", () => {
  it("covers the screen width plus margin", () => {
    const { start, end } = visibleRange(1000, 0.5, 80, 900, 100);
    // offset = 500; window [400, 1500] over spacing 80.
    expect(start).toBe(Math.floor(400 / 80));
    expect(end).toBe(Math.ceil(1500 / 80));
    expect((end - start) * 80).toBeGreaterThanOrEqual(900);
  });

  it("advances as the scroll increases, revealing new indices", () => {
    const a = visibleRange(0, 1, 100, 800, 0);
    const b = visibleRange(1000, 1, 100, 800, 0);
    expect(b.start).toBeGreaterThan(a.start);
    expect(b.end).toBeGreaterThan(a.end);
  });
});
