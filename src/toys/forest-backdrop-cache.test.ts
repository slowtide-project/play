/**
 * Guards the forest backdrop cache (NFR-12). The sky, stars, celestial body and
 * hills are painted once into an offscreen canvas and blitted; the cache must be
 * reused across the forward amble (camDepth) and only rebuilt when the time of
 * day steps or the child pans (camX). These tests stub a minimal canvas so the
 * cache path (which is skipped in the plain headless smoke test) actually runs,
 * counting offscreen clears as rebuilds and main-canvas blits as reuse.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createForestWorld } from "./forest-world.js";
import type { ToyFrame } from "../render/index.js";

interface Counters {
  clear: number;
  draw: number;
}

/** A permissive 2D-context stand-in: every method is a no-op except the two we
 * count. Property writes (fillStyle, etc.) are accepted and ignored. */
function proxyCtx(counters: Counters): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(_t, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => gradient;
      }
      if (prop === "clearRect") return () => (counters.clear += 1);
      if (prop === "drawImage") return () => (counters.draw += 1);
      if (typeof prop === "string" && prop in store) return store[prop];
      return () => undefined;
    },
    set(_t, prop, value) {
      store[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(counters: Counters): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => proxyCtx(counters),
  } as unknown as HTMLCanvasElement;
}

function levers(v: number) {
  return {
    animationSpeed: v,
    colourSaturation: v,
    brightness: v,
    audioTempo: v,
    audioVolume: v,
    interactionFrequency: v,
    rewardIntensity: v,
    contentNovelty: v,
  };
}

function frame(ctx: CanvasRenderingContext2D, timeOfDay: number): ToyFrame {
  return {
    ctx,
    width: 900,
    height: 600,
    dt: 16,
    time: 1000,
    budget: 0.5,
    timeOfDay,
    phase: "drift",
    reducedMotion: false,
    dpr: 2,
    levers: levers(0.5),
  };
}

let offscreen: Counters;

describe("forest backdrop cache (NFR-12)", () => {
  beforeEach(() => {
    offscreen = { clear: 0, draw: 0 };
    vi.stubGlobal("document", { createElement: () => fakeCanvas(offscreen) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the backdrop once, then reuses it across the forward amble", () => {
    const main: Counters = { clear: 0, draw: 0 };
    const ctx = proxyCtx(main);
    const forest = createForestWorld();
    forest.init(900, 600);

    forest.draw(frame(ctx, 0.15));
    expect(offscreen.clear).toBe(1); // one rebuild
    expect(main.draw).toBeGreaterThan(0); // blitted at least once

    // Several more frames at the same time of day, no panning: the scene ambles
    // forward (camDepth) but the backdrop must not be rebuilt.
    for (let i = 0; i < 10; i++) forest.draw(frame(ctx, 0.15));
    expect(offscreen.clear).toBe(1);
  });

  it("rebuilds when the child pans (camX changes)", () => {
    const main: Counters = { clear: 0, draw: 0 };
    const ctx = proxyCtx(main);
    const forest = createForestWorld();
    forest.init(900, 600);
    forest.draw(frame(ctx, 0.15));
    expect(offscreen.clear).toBe(1);

    forest.pointer({ type: "down", x: 500, y: 300 });
    forest.pointer({ type: "move", x: 380, y: 300 });
    forest.draw(frame(ctx, 0.15));
    expect(offscreen.clear).toBe(2);
  });

  it("rebuilds when the time of day steps", () => {
    const main: Counters = { clear: 0, draw: 0 };
    const ctx = proxyCtx(main);
    const forest = createForestWorld();
    forest.init(900, 600);
    forest.draw(frame(ctx, 0.15));
    expect(offscreen.clear).toBe(1);

    forest.draw(frame(ctx, 0.9)); // day: a different time-of-day bucket
    expect(offscreen.clear).toBe(2);
  });
});
