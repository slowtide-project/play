import { describe, it, expect } from "vitest";
import {
  DEFAULT_PARENT_DEFAULTS,
  PARENT_DEFAULTS_VERSION,
  applyDefaults,
  defaultsFromSetup,
  sanitiseDefaults,
} from "./parent-defaults.js";
import { DEFAULT_SETUP } from "./setup-config.js";

describe("sanitiseDefaults (I-5)", () => {
  it("returns the baseline for junk input", () => {
    expect(sanitiseDefaults(null)).toEqual(DEFAULT_PARENT_DEFAULTS);
    expect(sanitiseDefaults("nonsense")).toEqual(DEFAULT_PARENT_DEFAULTS);
    expect(sanitiseDefaults(42)).toEqual(DEFAULT_PARENT_DEFAULTS);
  });

  it("clamps out-of-range fields and always stamps the current version", () => {
    const result = sanitiseDefaults({ durationMin: 99_999, volume: 5, version: 999 });
    expect(result.durationMin).toBe(180);
    expect(result.volume).toBe(1);
    expect(result.version).toBe(PARENT_DEFAULTS_VERSION);
  });

  it("keeps valid values", () => {
    const result = sanitiseDefaults({ durationMin: 60, steepness: 1.2, brightness: 0.5 });
    expect(result.durationMin).toBe(60);
    expect(result.steepness).toBeCloseTo(1.2);
    expect(result.brightness).toBeCloseTo(0.5);
  });
});

describe("defaultsFromSetup / applyDefaults", () => {
  it("round-trips the persistable fields", () => {
    const saved = defaultsFromSetup({
      ...DEFAULT_SETUP,
      durationMin: 60,
      startCeiling: 0.8,
      steepness: 1.3,
      volume: 0.6,
    });
    const prefilled = applyDefaults(saved);
    expect(prefilled.durationMin).toBe(60);
    expect(prefilled.startCeiling).toBeCloseTo(0.8);
    expect(prefilled.steepness).toBeCloseTo(1.3);
    expect(prefilled.volume).toBeCloseTo(0.6);
  });

  it("never carries mode or test toggles into the pre-fill (FR-46)", () => {
    const saved = defaultsFromSetup({
      ...DEFAULT_SETUP,
      mode: "test",
      decayOff: true,
      freezeOn: true,
      freezeLevel: 0.2,
    });
    const prefilled = applyDefaults(saved);
    expect(prefilled.mode).toBe("live");
    expect(prefilled.decayOff).toBe(false);
    expect(prefilled.freezeOn).toBe(false);
  });
});
