import { describe, it, expect } from "vitest";
import { createEngine } from "./session.js";
import type { Ceilings, SessionConfig, SessionRecord, Storage } from "./types.js";

const NINETY_MIN = 90 * 60 * 1000;
const OPEN: Ceilings = { volume: 1, brightness: 1, motion: 1 };

function memoryStorage(): Storage {
  let record: SessionRecord | null = null;
  return {
    load: () => record,
    save: (r) => {
      record = r;
    },
    clear: () => {
      record = null;
    },
  };
}

function liveConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    durationMs: NINETY_MIN,
    startCeiling: 1,
    steepness: 1,
    mode: "live",
    decayEnabled: true,
    frozenLevel: null,
    ceilings: OPEN,
    ...overrides,
  };
}

const START = 1_000_000;

describe("session lifecycle", () => {
  it("starts active at the configured ceiling (FR-1, FR-10)", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig({ startCeiling: 0.9 }), START);
    const state = engine.getState(START);
    expect(state.status).toBe("active");
    expect(state.budget).toBeCloseTo(0.9);
    expect(state.phase).toBe("engage");
    expect(state.progress).toBeCloseTo(0);
  });

  it("decays monotonically to near zero across the session (FR-4)", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig(), START);
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const now = START + (i / 100) * NINETY_MIN;
      const { budget } = engine.getState(now);
      expect(budget).toBeLessThanOrEqual(prev + 1e-9);
      prev = budget;
    }
    expect(engine.getState(START + NINETY_MIN * 0.999).budget).toBeLessThan(0.05);
  });

  it("is over, not continued, once the duration elapses (FR-6, D-6)", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig(), START);
    expect(engine.getState(START + NINETY_MIN - 1).status).toBe("active");
    expect(engine.getState(START + NINETY_MIN).status).toBe("ended");
    expect(engine.getState(START + NINETY_MIN * 5).status).toBe("ended");
  });

  it("rests neutral with no session and before the start time", () => {
    const engine = createEngine(memoryStorage());
    expect(engine.getState(START).status).toBe("neutral");
    engine.startSession(liveConfig(), START);
    expect(engine.getState(START - 1).status).toBe("neutral");
  });

  it("resumes the same session at the right point after a reload (FR-6)", () => {
    const storage = memoryStorage();
    const engine1 = createEngine(storage);
    engine1.startSession(liveConfig(), START);
    const mid = START + NINETY_MIN * 0.4;
    const before = engine1.getState(mid).budget;
    // A fresh engine over the same persisted storage models an app relaunch.
    const engine2 = createEngine(storage);
    expect(engine2.getState(mid).budget).toBeCloseTo(before);
  });

  it("starts fresh with no carry-over from a previous session (FR-1a)", () => {
    const storage = memoryStorage();
    const engine = createEngine(storage);
    engine.startSession(liveConfig({ startCeiling: 1 }), START);
    const laterStart = START + NINETY_MIN * 2;
    engine.startSession(liveConfig({ startCeiling: 0.5 }), laterStart);
    // At the new start the budget reflects the new ceiling, not the old curve.
    expect(engine.getState(laterStart).budget).toBeCloseTo(0.5);
    expect(engine.getState(laterStart).progress).toBeCloseTo(0);
  });

  it("clears to neutral on endSession", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig(), START);
    engine.endSession();
    expect(engine.getState(START).status).toBe("neutral");
  });

  it("defensively repairs an invalid steepness and ceiling (I-5)", () => {
    const engine = createEngine(memoryStorage());
    // steepness <= 0 falls back to 1; an out-of-range ceiling is clamped.
    engine.startSession(liveConfig({ steepness: 0, startCeiling: 5 }), START);
    const state = engine.getState(START);
    expect(state.budget).toBeCloseTo(1);
    expect(state.budget).toBeLessThanOrEqual(1);
  });
});

describe("test mode (D-5)", () => {
  it("freezes the budget at the chosen level regardless of time (FR-44)", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig({ mode: "test", frozenLevel: 0.3 }), START);
    expect(engine.getState(START).budget).toBeCloseTo(0.3);
    expect(engine.getState(START + NINETY_MIN * 0.5).budget).toBeCloseTo(0.3);
    expect(engine.getState(START + NINETY_MIN - 1).budget).toBeCloseTo(0.3);
  });

  it("holds at the ceiling with decay off (FR-43)", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(
      liveConfig({ mode: "test", decayEnabled: false, startCeiling: 0.8 }),
      START,
    );
    expect(engine.getState(START).budget).toBeCloseTo(0.8);
    expect(engine.getState(START + NINETY_MIN * 0.7).budget).toBeCloseTo(0.8);
  });
});

describe("infinite mode (D-12, FR-50)", () => {
  it("holds the budget at the frozen level for any elapsed time", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(
      liveConfig({ mode: "infinite", decayEnabled: false, frozenLevel: 0.3 }),
      START,
    );
    expect(engine.getState(START).budget).toBeCloseTo(0.3);
    expect(engine.getState(START + NINETY_MIN * 0.5).budget).toBeCloseTo(0.3);
    expect(engine.getState(START + NINETY_MIN * 3).budget).toBeCloseTo(0.3);
  });

  it("never ends on elapsed time (FR-50): stays active well past the duration", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(
      liveConfig({ mode: "infinite", decayEnabled: false, frozenLevel: 0.3 }),
      START,
    );
    expect(engine.getState(START + NINETY_MIN).status).toBe("active");
    expect(engine.getState(START + NINETY_MIN * 100).status).toBe("active");
    expect(engine.getState(START + NINETY_MIN * 100).progress).toBeNull();
    expect(engine.getState(START + NINETY_MIN * 100).phase).toBeNull();
  });

  it("ends to neutral only when the parent ends it", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig({ mode: "infinite", frozenLevel: 0.3 }), START);
    engine.endSession();
    expect(engine.getState(START + NINETY_MIN * 5).status).toBe("neutral");
  });

  it("keeps frozen levers within the parent ceilings (FR-12)", () => {
    const ceilings: Ceilings = { volume: 0.2, brightness: 0.3, motion: 0.4 };
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig({ mode: "infinite", frozenLevel: 1, ceilings }), START);
    const { levers } = engine.getState(START + NINETY_MIN * 2);
    expect(levers.audioVolume).toBeLessThanOrEqual(ceilings.volume);
    expect(levers.brightness).toBeLessThanOrEqual(ceilings.brightness);
    expect(levers.animationSpeed).toBeLessThanOrEqual(ceilings.motion);
  });
});

describe("exploit resilience (NFR-3, FR-22, FR-47)", () => {
  it("returns the same budget for the same time no matter how often it is read", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig(), START);
    const now = START + NINETY_MIN * 0.3;
    const first = engine.getState(now).budget;
    for (let i = 0; i < 50; i++) {
      expect(engine.getState(now).budget).toBe(first);
    }
  });

  it("never lets later time yield a higher budget than earlier time", () => {
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig(), START);
    const earlier = engine.getState(START + NINETY_MIN * 0.2).budget;
    const later = engine.getState(START + NINETY_MIN * 0.6).budget;
    expect(later).toBeLessThanOrEqual(earlier);
  });

  it("keeps active levers within the parent ceilings throughout (FR-12)", () => {
    const ceilings: Ceilings = { volume: 0.3, brightness: 0.4, motion: 0.5 };
    const engine = createEngine(memoryStorage());
    engine.startSession(liveConfig({ ceilings }), START);
    for (let i = 0; i <= 50; i++) {
      const { levers } = engine.getState(START + (i / 50) * NINETY_MIN);
      expect(levers.audioVolume).toBeLessThanOrEqual(ceilings.volume);
      expect(levers.brightness).toBeLessThanOrEqual(ceilings.brightness);
      expect(levers.animationSpeed).toBeLessThanOrEqual(ceilings.motion);
    }
  });
});
