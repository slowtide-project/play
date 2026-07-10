/**
 * Guards the forest backdrop cache (NFR-12). The sky, stars, celestial body,
 * hills and ground wash are painted once into an offscreen canvas and blitted;
 * the cache must be reused across the forward amble (camDepth) and only rebuilt
 * when the time of day steps or the child pans (camX).
 *
 * The scene now creates several offscreen canvases (backdrop, glow sprite,
 * vignette), so each fake canvas carries its own clear counter and we assert on
 * the first one created, which is always the backdrop (allocated at the top of
 * draw, before the others).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createForestWorld } from "./forest-world.js";
import type { ToyFrame } from "../render/index.js";

/** A permissive 2D-context stand-in: every method is a no-op except clearRect,
 * which we count per canvas. Property writes (fillStyle, etc.) are accepted. */
function proxyCtx(onClear: () => void): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(_t, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => gradient;
      }
      if (prop === "clearRect") return onClear;
      if (typeof prop === "string" && prop in store) return store[prop];
      return () => undefined;
    },
    set(_t, prop, value) {
      store[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Offscreen canvases created via document.createElement, in creation order,
 * each with its own clear counter. canvases[0] is the backdrop. */
let canvases: { clears: number }[] = [];

function fakeCanvas(): HTMLCanvasElement {
  const rec = { clears: 0 };
  canvases.push(rec);
  return {
    width: 0,
    height: 0,
    getContext: () => proxyCtx(() => (rec.clears += 1)),
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

/** Backdrop rebuild count: clears on the first offscreen canvas created. */
function backdropRebuilds(): number {
  return canvases[0]?.clears ?? 0;
}

describe("forest backdrop cache (NFR-12)", () => {
  beforeEach(() => {
    canvases = [];
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the backdrop once, then reuses it across the forward amble", () => {
    const main: Counters = { draw: 0 };
    const ctx = mainCtx(main);
    const forest = createForestWorld();
    forest.init(900, 600);

    forest.draw(frame(ctx, 0.15));
    expect(backdropRebuilds()).toBe(1);
    expect(main.draw).toBeGreaterThan(0); // backdrop (and vignette) blitted

    // Several more frames, same time of day, no panning: the scene ambles
    // forward (camDepth) but the backdrop must not be rebuilt.
    for (let i = 0; i < 10; i++) forest.draw(frame(ctx, 0.15));
    expect(backdropRebuilds()).toBe(1);
  });

  it("rebuilds when the child pans (camX changes)", () => {
    const ctx = mainCtx({ draw: 0 });
    const forest = createForestWorld();
    forest.init(900, 600);
    forest.draw(frame(ctx, 0.15));
    expect(backdropRebuilds()).toBe(1);

    forest.pointer({ type: "down", x: 500, y: 300 });
    forest.pointer({ type: "move", x: 380, y: 300 });
    forest.draw(frame(ctx, 0.15));
    expect(backdropRebuilds()).toBe(2);
  });

  it("rebuilds when the time of day steps", () => {
    const ctx = mainCtx({ draw: 0 });
    const forest = createForestWorld();
    forest.init(900, 600);
    forest.draw(frame(ctx, 0.15));
    expect(backdropRebuilds()).toBe(1);

    forest.draw(frame(ctx, 0.9)); // day: a different time-of-day bucket
    expect(backdropRebuilds()).toBe(2);
  });
});

interface Counters {
  draw: number;
}

/** The main frame context: counts drawImage blits, ignores everything else. */
function mainCtx(counters: Counters): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(_t, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => gradient;
      }
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
