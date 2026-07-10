import { describe, it, expect } from "vitest";
import {
  MAX_DEVICE_PIXEL_RATIO,
  MAX_FPS,
  MAX_FRAME_DELTA_MS,
  MIN_FPS,
  clampDevicePixelRatio,
  clampFrameDelta,
  daylightAtHour,
  targetFrameInterval,
} from "./frame.js";

describe("targetFrameInterval (FR-40)", () => {
  it("runs near max fps when lively and min fps when calm", () => {
    expect(targetFrameInterval(1)).toBeCloseTo(1000 / MAX_FPS);
    expect(targetFrameInterval(0)).toBeCloseTo(1000 / MIN_FPS);
  });

  it("is monotonic: more speed never means fewer frames", () => {
    let prev = Infinity;
    for (let i = 0; i <= 10; i++) {
      const interval = targetFrameInterval(i / 10);
      expect(interval).toBeLessThanOrEqual(prev + 1e-9);
      prev = interval;
    }
  });

  it("clamps out-of-range speed", () => {
    expect(targetFrameInterval(-5)).toBeCloseTo(1000 / MIN_FPS);
    expect(targetFrameInterval(5)).toBeCloseTo(1000 / MAX_FPS);
    expect(targetFrameInterval(Number.NaN)).toBeCloseTo(1000 / MIN_FPS);
  });
});

describe("clampDevicePixelRatio (NFR-12)", () => {
  it("caps a retina ratio at the ceiling", () => {
    expect(clampDevicePixelRatio(2)).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(clampDevicePixelRatio(3)).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it("passes ratios below the ceiling through unchanged", () => {
    expect(clampDevicePixelRatio(1)).toBe(1);
    expect(clampDevicePixelRatio(1.1)).toBe(1.1);
  });

  it("defends against non-finite or sub-unity input", () => {
    expect(clampDevicePixelRatio(0)).toBe(1);
    expect(clampDevicePixelRatio(-2)).toBe(1);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
  });
});

describe("daylightAtHour", () => {
  it("is full day at midday and dark overnight", () => {
    expect(daylightAtHour(12)).toBe(1);
    expect(daylightAtHour(2)).toBe(0);
    expect(daylightAtHour(23)).toBe(0);
  });

  it("gives a golden dusk in the evening", () => {
    const v = daylightAtHour(19.75);
    expect(v).toBeGreaterThan(0.3);
    expect(v).toBeLessThan(0.6);
  });

  it("falls through evening and rises through dawn", () => {
    expect(daylightAtHour(18)).toBeLessThan(daylightAtHour(17));
    expect(daylightAtHour(7)).toBeGreaterThan(daylightAtHour(6));
  });

  it("wraps and defends against bad input", () => {
    expect(daylightAtHour(36)).toBe(daylightAtHour(12));
    expect(daylightAtHour(Number.NaN)).toBe(1);
  });
});

describe("clampFrameDelta", () => {
  it("caps a large delta so a resumed tab cannot jump the toy", () => {
    expect(clampFrameDelta(5000)).toBe(MAX_FRAME_DELTA_MS);
  });

  it("passes a normal delta through", () => {
    expect(clampFrameDelta(16)).toBe(16);
  });

  it("falls back for non-positive or non-finite deltas", () => {
    expect(clampFrameDelta(0)).toBeCloseTo(1000 / MAX_FPS);
    expect(clampFrameDelta(-3)).toBeCloseTo(1000 / MAX_FPS);
    expect(clampFrameDelta(Number.NaN)).toBeCloseTo(1000 / MAX_FPS);
  });
});
