import { describe, it, expect } from "vitest";
import { DEFAULT_SETUP, SETUP_BOUNDS, toSessionConfig, clampToBounds } from "./setup-config.js";
import type { SetupState } from "./setup-config.js";

function setup(overrides: Partial<SetupState> = {}): SetupState {
  return { ...DEFAULT_SETUP, ...overrides };
}

describe("clampToBounds", () => {
  it("clamps out-of-range values into the bounds", () => {
    expect(clampToBounds(5, { min: 0, max: 1 })).toBe(1);
    expect(clampToBounds(-3, { min: 0, max: 1 })).toBe(0);
    expect(clampToBounds(0.5, { min: 0, max: 1 })).toBe(0.5);
  });

  it("falls back to the low bound for non-finite input (I-5)", () => {
    expect(clampToBounds(Number.NaN, { min: 0.2, max: 1 })).toBe(0.2);
    expect(clampToBounds(Number.POSITIVE_INFINITY, { min: 0.2, max: 1 })).toBe(0.2);
  });
});

describe("toSessionConfig — live sessions (FR-46)", () => {
  it("always decays and is never frozen, even if test toggles are set", () => {
    const config = toSessionConfig(setup({ mode: "live", decayOff: true, freezeOn: true }));
    expect(config.mode).toBe("live");
    expect(config.decayEnabled).toBe(true);
    expect(config.frozenLevel).toBeNull();
  });

  it("maps duration in minutes to milliseconds", () => {
    expect(toSessionConfig(setup({ durationMin: 60 })).durationMs).toBe(60 * 60_000);
    expect(toSessionConfig(setup({ durationMin: 90 })).durationMs).toBe(90 * 60_000);
  });
});

describe("toSessionConfig — test mode (D-5)", () => {
  it("carries decay-off through in test mode (FR-43)", () => {
    const config = toSessionConfig(setup({ mode: "test", decayOff: true }));
    expect(config.mode).toBe("test");
    expect(config.decayEnabled).toBe(false);
    expect(config.frozenLevel).toBeNull();
  });

  it("freezes at the chosen level when freeze is on (FR-44)", () => {
    const config = toSessionConfig(setup({ mode: "test", freezeOn: true, freezeLevel: 0.3 }));
    expect(config.frozenLevel).toBeCloseTo(0.3);
  });

  it("prefers freeze over decay-off when both are set", () => {
    const config = toSessionConfig(
      setup({ mode: "test", decayOff: true, freezeOn: true, freezeLevel: 0.4 }),
    );
    expect(config.frozenLevel).toBeCloseTo(0.4);
  });
});

describe("toSessionConfig — clamping (I-5, FR-12)", () => {
  it("clamps every out-of-range value into safe bounds", () => {
    const config = toSessionConfig(
      setup({
        durationMin: 10_000,
        startCeiling: 9,
        steepness: 99,
        volume: 5,
        brightness: -2,
        motion: 3,
      }),
    );
    expect(config.durationMs).toBe(SETUP_BOUNDS.durationMin.max * 60_000);
    expect(config.startCeiling).toBe(SETUP_BOUNDS.startCeiling.max);
    expect(config.steepness).toBe(SETUP_BOUNDS.steepness.max);
    expect(config.ceilings.volume).toBe(1);
    expect(config.ceilings.brightness).toBe(0);
    expect(config.ceilings.motion).toBe(1);
  });

  it("never lets the start ceiling drop to silence", () => {
    const config = toSessionConfig(setup({ startCeiling: 0 }));
    expect(config.startCeiling).toBe(SETUP_BOUNDS.startCeiling.min);
    expect(config.startCeiling).toBeGreaterThan(0);
  });
});
