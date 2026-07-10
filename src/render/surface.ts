/**
 * The render surface: owns the canvas, the animation loop, and the transitions
 * between the neutral rest surface and an active toy.
 *
 * The surface is the only place `requestAnimationFrame` runs. It resamples the
 * budget from the pure engine on a low-frequency cadence (FR-40), throttles the
 * drawn frame rate by the animation-speed lever, and recomputes from wall-clock
 * time whenever the tab becomes visible again, so a reload or backgrounding
 * resumes on the curve rather than resetting it (FR-6, FR-39).
 *
 * Outside an active session it paints a quiet, dim rest surface and stops the
 * loop entirely — no invitation to play, and nothing that reveals progress
 * (FR-5, FR-7, NFR-1). It is an impure edge; all timing maths lives in the pure
 * {@link ./frame} helpers.
 */

import type { Engine } from "../engine/index.js";
import {
  BUDGET_SAMPLE_MS,
  clampDevicePixelRatio,
  clampFrameDelta,
  daylightAtEpoch,
  targetFrameInterval,
} from "./frame.js";
import type { Toy, ToyPointer } from "./types.js";

export interface SurfaceController {
  /** Re-read wall-clock state and continue, without disturbing toy state. */
  sync(): void;
  /** Begin a fresh active instance now (called after a session starts). */
  restart(): void;
  /** Dev-only: pin the scene's time-of-day (0..1), or null for the real clock. */
  setTimeOfDayOverride(value: number | null): void;
  /**
   * Dev-only: the recent median toy draw time and the current frame-rate cap, or
   * null when the meter is off (production). The dev toolbar renders this; it is
   * never painted on the child-facing surface (NFR-1).
   */
  frameStats(): { drawMs: number; capFps: number } | null;
  destroy(): void;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Mount a surface into `host`, driving `toy` from `engine`. `now` supplies
 * wall-clock time (injected so the engine stays pure and the surface stays
 * testable at the edges).
 */
export function mountSurface(
  host: HTMLElement,
  engine: Engine,
  now: () => number,
  toy: Toy,
  onActiveChange?: (active: boolean) => void,
  meterEnabled?: boolean,
): SurfaceController {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    touchAction: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  host.append(canvas);
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let running = false;
  let toyReady = false;
  let rafId = 0;
  let lastDrawTs = 0;
  let mountWall = now();
  let lastSampleWall = now();
  let state = engine.getState(mountWall);
  let pressed = false;
  let timeOfDayOverride: number | null = null;
  let deviceRatio = 1;

  // Developer-only frame-time meter. Enabled by the caller (the composition root
  // passes the resolved dev-mode state, which covers both the preview build and
  // the runtime unlock on the deployed site); otherwise it falls back to the
  // compile-time flag. It only records timings — the readout is rendered by the
  // dev toolbar, never on the child-facing surface (NFR-1).
  const devMeter =
    meterEnabled ?? (typeof __SLOWTIDE_DEV_TOOLS__ !== "undefined" && __SLOWTIDE_DEV_TOOLS__);
  const perfSamples: number[] = [];
  function perfNow(): number {
    return typeof performance !== "undefined" ? performance.now() : now();
  }

  function resize(): void {
    const dpr = clampDevicePixelRatio(window.devicePixelRatio || 1);
    deviceRatio = dpr;
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (ctx !== null) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (running && toyReady) toy.resize(width, height);
    if (!running) drawRest();
  }

  /** The quiet, dim rest surface for neutral and ended states (FR-5, FR-7). */
  function drawRest(): void {
    if (ctx === null) return;
    const gradient = ctx.createRadialGradient(
      width / 2,
      height * 0.62,
      0,
      width / 2,
      height * 0.62,
      Math.max(width, height) * 0.75,
    );
    // Dim and calm, but a visible warm vignette rather than pure black, so a
    // resting screen never reads as a broken one (FR-5, FR-7).
    gradient.addColorStop(0, "hsl(28 26% 10%)");
    gradient.addColorStop(1, "hsl(24 22% 4%)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawActive(ts: number): void {
    if (ctx === null) return;
    const dt = clampFrameDelta(lastDrawTs === 0 ? 0 : ts - lastDrawTs);
    lastDrawTs = ts;
    const drawStart = devMeter ? perfNow() : 0;
    toy.draw({
      ctx,
      width,
      height,
      dt,
      time: now() - mountWall,
      levers: state.levers,
      budget: state.budget,
      timeOfDay: timeOfDayOverride ?? daylightAtEpoch(now()),
      phase: state.phase,
      reducedMotion: prefersReducedMotion(),
      dpr: deviceRatio,
    });
    if (devMeter) {
      perfSamples.push(perfNow() - drawStart);
      if (perfSamples.length > 60) perfSamples.shift();
    }
  }

  /** Dev-only: recent median draw time and the current fps cap, for the toolbar. */
  function frameStats(): { drawMs: number; capFps: number } | null {
    if (!devMeter || perfSamples.length === 0) return null;
    const sorted = [...perfSamples].sort((a, b) => a - b);
    const drawMs = sorted[sorted.length >> 1] ?? 0;
    const capFps = Math.round(1000 / targetFrameInterval(state.levers.animationSpeed));
    return { drawMs, capFps };
  }

  function loop(ts: number): void {
    if (!running) return;
    const wall = now();
    if (wall - lastSampleWall >= BUDGET_SAMPLE_MS) {
      lastSampleWall = wall;
      const next = engine.getState(wall);
      if (next.status !== "active") {
        state = next;
        deactivate();
        return;
      }
      state = next;
    }
    const interval = targetFrameInterval(state.levers.animationSpeed);
    if (lastDrawTs === 0 || ts - lastDrawTs >= interval) drawActive(ts);
    rafId = window.requestAnimationFrame(loop);
  }

  function startLoop(): void {
    if (running) return;
    running = true;
    lastDrawTs = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop(): void {
    running = false;
    if (rafId !== 0) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function activate(reinit: boolean): void {
    const wall = now();
    state = engine.getState(wall);
    mountWall = wall;
    lastSampleWall = wall;
    if (reinit || !toyReady) {
      toy.init(width, height);
      toyReady = true;
    }
    startLoop();
    onActiveChange?.(true);
  }

  function deactivate(): void {
    stopLoop();
    toyReady = false;
    pressed = false;
    drawRest();
    onActiveChange?.(false);
  }

  function toPointer(event: PointerEvent, type: ToyPointer["type"]): ToyPointer {
    const rect = canvas.getBoundingClientRect();
    return { type, x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: PointerEvent): void {
    if (!running || !toyReady) return;
    pressed = true;
    toy.pointer(toPointer(event, "down"));
  }
  function onPointerMove(event: PointerEvent): void {
    if (!running || !toyReady || !pressed) return;
    toy.pointer(toPointer(event, "move"));
  }
  function onPointerUp(event: PointerEvent): void {
    if (!running || !toyReady || !pressed) return;
    pressed = false;
    toy.pointer(toPointer(event, "up"));
  }

  /** Re-read wall-clock state and continue without disturbing toy state. */
  function syncNow(): void {
    const next = engine.getState(now());
    state = next;
    if (next.status === "active") {
      if (!running) activate(false);
    } else {
      deactivate();
    }
  }

  /** Begin a fresh active instance now (after a session starts). */
  function restartNow(): void {
    const next = engine.getState(now());
    if (next.status === "active") {
      activate(true);
    } else {
      state = next;
      deactivate();
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === "visible") syncNow();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  // Resolve the launch surface: resume an in-flight session, else rest quiet.
  if (state.status === "active") {
    activate(true);
  } else {
    drawRest();
    onActiveChange?.(false);
  }

  return {
    sync: syncNow,
    restart: restartNow,
    setTimeOfDayOverride(value: number | null) {
      timeOfDayOverride = value;
    },
    frameStats,
    destroy() {
      stopLoop();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    },
  };
}
