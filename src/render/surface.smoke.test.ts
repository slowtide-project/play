/**
 * A headless smoke test for the DOM render edge. It stubs the minimum canvas
 * and window surface so the loop can run in Node, then drives one active frame
 * and one neutral paint, asserting the surface actually issues draw calls and
 * never throws. This guards against the "blank screen" class of runtime bug
 * that pure-model tests cannot catch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mountSurface } from "./surface.js";
import type { Engine, EngineState, LeverValues } from "../engine/index.js";
import type { Toy } from "./types.js";

/** A trivial toy that just records lifecycle calls, to test the surface loop. */
function stubToy(counter: { init: number; draw: number }): Toy {
  return {
    id: "stub",
    init: () => (counter.init += 1),
    resize: () => undefined,
    pointer: () => undefined,
    draw: (frame) => {
      counter.draw += 1;
      frame.ctx.fillRect(0, 0, frame.width, frame.height);
    },
  };
}

interface Counter {
  fillRect: number;
  stroke: number;
  fill: number;
}

let rafCb: FrameRequestCallback | null = null;

function fakeContext(counter: Counter): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return {
    setTransform: () => undefined,
    createRadialGradient: () => gradient,
    fillRect: () => (counter.fillRect += 1),
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    ellipse: () => undefined,
    arc: () => undefined,
    stroke: () => (counter.stroke += 1),
    fill: () => (counter.fill += 1),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
  } as unknown as CanvasRenderingContext2D;
}

const noopListeners = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

const rect = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };

function installDom(counter: Counter): HTMLElement {
  const canvas = {
    style: {},
    getContext: () => fakeContext(counter),
    getBoundingClientRect: () => rect,
    width: 0,
    height: 0,
    remove: () => undefined,
    ...noopListeners,
  };
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    ...noopListeners,
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    createElement: () => canvas,
    ...noopListeners,
  });
  return { append: () => undefined, getBoundingClientRect: () => rect } as unknown as HTMLElement;
}

function levers(value: number): LeverValues {
  return {
    animationSpeed: value,
    colourSaturation: value,
    brightness: value,
    audioTempo: value,
    audioVolume: value,
    interactionFrequency: value,
    rewardIntensity: value,
    contentNovelty: value,
  };
}

function stateOf(status: EngineState["status"]): EngineState {
  const active = status === "active";
  return {
    status,
    budget: active ? 0.8 : 0,
    phase: active ? "engage" : null,
    progress: active ? 0.1 : null,
    levers: levers(active ? 0.8 : 0),
  };
}

function engineReturning(status: EngineState["status"]): Engine {
  return {
    getState: () => stateOf(status),
    isActive: () => status === "active",
    startSession: () => {
      throw new Error("not used in smoke test");
    },
    endSession: () => undefined,
  };
}

describe("surface render edge (blank-screen guard)", () => {
  beforeEach(() => {
    rafCb = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the loop and draws the toy on an active frame", () => {
    const counter: Counter = { fillRect: 0, stroke: 0, fill: 0 };
    const life = { init: 0, draw: 0 };
    const host = installDom(counter);
    const controller = mountSurface(host, engineReturning("active"), () => 1000, stubToy(life));
    expect(rafCb).not.toBeNull();
    rafCb?.(16);
    controller.destroy();
    expect(life.init).toBeGreaterThan(0);
    expect(life.draw).toBeGreaterThan(0);
    expect(counter.fillRect).toBeGreaterThan(0);
  });

  it("paints the neutral rest surface without running the toy", () => {
    const counter: Counter = { fillRect: 0, stroke: 0, fill: 0 };
    const life = { init: 0, draw: 0 };
    const host = installDom(counter);
    const controller = mountSurface(host, engineReturning("neutral"), () => 1000, stubToy(life));
    controller.destroy();
    expect(counter.fillRect).toBeGreaterThan(0);
    expect(life.draw).toBe(0);
  });
});
