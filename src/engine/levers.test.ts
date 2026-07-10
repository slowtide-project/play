import { describe, it, expect } from "vitest";
import { mapLevers } from "./levers.js";
import type { Ceilings, LeverValues } from "./types.js";

const OPEN: Ceilings = { volume: 1, brightness: 1, motion: 1 };

describe("mapLevers", () => {
  it("produces richer output at high budget than at low budget", () => {
    const high = mapLevers(1, OPEN);
    const low = mapLevers(0, OPEN);
    const keys = Object.keys(high) as (keyof LeverValues)[];
    for (const key of keys) {
      expect(high[key]).toBeGreaterThanOrEqual(low[key]);
    }
  });

  it("keeps every lever within [0, 1]", () => {
    for (let i = 0; i <= 20; i++) {
      const levers = mapLevers(i / 20, OPEN);
      for (const value of Object.values(levers)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never exceeds the parent ceilings, even at full budget (FR-12)", () => {
    const ceilings: Ceilings = { volume: 0.2, brightness: 0.3, motion: 0.4 };
    const levers = mapLevers(1, ceilings);
    expect(levers.audioVolume).toBeLessThanOrEqual(ceilings.volume);
    expect(levers.brightness).toBeLessThanOrEqual(ceilings.brightness);
    expect(levers.animationSpeed).toBeLessThanOrEqual(ceilings.motion);
    // Rewards are capped by the stricter of volume and motion.
    expect(levers.rewardIntensity).toBeLessThanOrEqual(Math.min(ceilings.volume, ceilings.motion));
  });
});
