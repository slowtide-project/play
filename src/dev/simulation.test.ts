import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEV_CONFIG,
  createMemoryStorage,
  createSimulation,
  toSessionConfig,
  type DevConfig,
} from "./simulation.js";
import type { SessionRecord } from "../engine/index.js";

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    durationMs: 60_000,
    startCeiling: 1,
    steepness: 1,
    mode: "live",
    decayEnabled: true,
    frozenLevel: null,
    ceilings: { volume: 1, brightness: 1, motion: 1 },
    startEpoch: 0,
    version: 1,
    ...overrides,
  };
}

describe("createMemoryStorage", () => {
  it("round-trips save, load, and clear", () => {
    const storage = createMemoryStorage();
    expect(storage.load()).toBeNull();
    const r = record();
    storage.save(r);
    expect(storage.load()).toBe(r);
    storage.clear();
    expect(storage.load()).toBeNull();
  });
});

describe("toSessionConfig", () => {
  it("converts duration minutes to milliseconds and stays live by default", () => {
    const cfg = toSessionConfig(DEFAULT_DEV_CONFIG);
    expect(cfg.durationMs).toBe(90 * 60_000);
    expect(cfg.mode).toBe("live");
    expect(cfg.decayEnabled).toBe(true);
    expect(cfg.frozenLevel).toBeNull();
  });

  it("enters test mode with decay off but no freeze", () => {
    const cfg = toSessionConfig({ ...DEFAULT_DEV_CONFIG, testDecayOff: true });
    expect(cfg.mode).toBe("test");
    expect(cfg.decayEnabled).toBe(false);
    expect(cfg.frozenLevel).toBeNull();
  });

  it("lets freeze take precedence and carries the frozen level", () => {
    const cfg = toSessionConfig({
      ...DEFAULT_DEV_CONFIG,
      testDecayOff: true,
      freezeOn: true,
      freezeLevel: 0.3,
    });
    expect(cfg.mode).toBe("test");
    expect(cfg.frozenLevel).toBe(0.3);
  });

  it("passes the parent ceilings straight through", () => {
    const cfg = toSessionConfig({
      ...DEFAULT_DEV_CONFIG,
      volume: 0.2,
      brightness: 0.3,
      motion: 0.4,
    });
    expect(cfg.ceilings).toEqual({ volume: 0.2, brightness: 0.3, motion: 0.4 });
  });
});

describe("createSimulation", () => {
  const live: DevConfig = { ...DEFAULT_DEV_CONFIG, durationMin: 60 };

  it("starts at the start ceiling and lands at ~0", () => {
    const sim = createSimulation(toSessionConfig({ ...live, startCeiling: 0.8 }));
    expect(sim.stateAt(0).budget).toBeCloseTo(0.8, 6);
    // Sampling the whole session ends on the engine's ended state (budget 0).
    const curve = sim.sampleCurve(101);
    expect(curve[curve.length - 1]?.budget).toBe(0);
  });

  it("is monotonically non-increasing across a live session", () => {
    const sim = createSimulation(toSessionConfig(live));
    const curve = sim.sampleCurve(200);
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1];
      const cur = curve[i];
      if (prev === undefined || cur === undefined) throw new Error("sample gap");
      expect(cur.budget).toBeLessThanOrEqual(prev.budget + 1e-9);
    }
  });

  it("holds the budget flat when decay is off (FR-43)", () => {
    const sim = createSimulation(
      toSessionConfig({ ...live, startCeiling: 0.7, testDecayOff: true }),
    );
    for (const p of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(sim.stateAt(p).budget).toBeCloseTo(0.7, 6);
    }
  });

  it("holds the budget at the frozen level (FR-44)", () => {
    const sim = createSimulation(toSessionConfig({ ...live, freezeOn: true, freezeLevel: 0.35 }));
    for (const p of [0, 0.5, 0.99]) {
      expect(sim.stateAt(p).budget).toBeCloseTo(0.35, 6);
    }
  });

  it("never lets a lever exceed the parent ceilings, even at full budget (FR-12)", () => {
    const sim = createSimulation(
      toSessionConfig({ ...live, volume: 0.2, brightness: 0.3, motion: 0.4 }),
    );
    const { levers } = sim.stateAt(0);
    expect(levers.audioVolume).toBeLessThanOrEqual(0.2);
    expect(levers.brightness).toBeLessThanOrEqual(0.3);
    expect(levers.animationSpeed).toBeLessThanOrEqual(0.4);
    expect(levers.rewardIntensity).toBeLessThanOrEqual(Math.min(0.2, 0.4));
  });

  it("reports uncapped levers at or above the capped ones, so clipping is visible", () => {
    const sim = createSimulation(
      toSessionConfig({ ...live, volume: 0.2, brightness: 0.3, motion: 0.4 }),
    );
    const capped = sim.stateAt(0).levers;
    const uncapped = sim.uncappedLeversAt(0);
    expect(uncapped.audioVolume).toBeGreaterThan(capped.audioVolume);
    expect(uncapped.brightness).toBeGreaterThan(capped.brightness);
    expect(uncapped.animationSpeed).toBeGreaterThan(capped.animationSpeed);
  });
});
