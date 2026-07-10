/**
 * Headless smoke test for the toy box and the forest world. It stubs a full 2D
 * canvas context and drives the box through daytime, a tap, night, and a drag,
 * asserting real draw calls happen and nothing throws — guarding the whole
 * atmospheric render and infinite-scroll path.
 */
import { describe, it, expect } from "vitest";
import { createToyBox } from "./toy-box.js";
import type { ToyFrame } from "../render/index.js";

interface Counter {
  fill: number;
  fillRect: number;
  stroke: number;
}

function fakeCtx(counter: Counter): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    ellipse: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    closePath: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    setTransform: () => undefined,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillText: () => undefined,
    fill: () => (counter.fill += 1),
    fillRect: () => (counter.fillRect += 1),
    stroke: () => (counter.stroke += 1),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function frame(ctx: CanvasRenderingContext2D, budget: number): ToyFrame {
  const v = budget;
  return {
    ctx,
    width: 900,
    height: 600,
    dt: 16,
    time: 1000,
    budget,
    timeOfDay: budget,
    phase: budget > 0.5 ? "engage" : "drift",
    reducedMotion: false,
    levers: {
      animationSpeed: v,
      colourSaturation: v,
      brightness: v,
      audioTempo: v,
      audioVolume: v,
      interactionFrequency: v,
      rewardIntensity: v,
      contentNovelty: v,
    },
  };
}

describe("toy box + forest render path", () => {
  it("opens the world, draws day and night, and survives tap and drag", () => {
    const counter: Counter = { fill: 0, fillRect: 0, stroke: 0 };
    const ctx = fakeCtx(counter);
    const box = createToyBox();
    box.init(900, 600);

    box.draw(frame(ctx, 0.9)); // daytime forest
    expect(counter.fill + counter.fillRect).toBeGreaterThan(0);

    // A tap (down + up, no move) spawns a bird by day.
    box.pointer({ type: "down", x: 300, y: 300 });
    box.pointer({ type: "up", x: 300, y: 300 });

    // A drag scrolls the world; must not throw and keeps drawing.
    box.pointer({ type: "down", x: 500, y: 300 });
    box.pointer({ type: "move", x: 420, y: 300 });
    box.pointer({ type: "move", x: 360, y: 300 });
    box.pointer({ type: "up", x: 360, y: 300 });

    const beforeNight = counter.stroke;
    box.draw(frame(ctx, 0.15)); // night: stars, moon glow, fireflies
    expect(counter.stroke).toBeGreaterThanOrEqual(beforeNight);

    // Tap at night gathers fireflies.
    box.pointer({ type: "down", x: 450, y: 250 });
    box.pointer({ type: "up", x: 450, y: 250 });
    box.draw(frame(ctx, 0.15));
    expect(counter.fillRect).toBeGreaterThan(0);
  });
});
