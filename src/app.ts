/**
 * Composition root. Wires the pure engine to the platform edges and the parent
 * entry flow.
 *
 * Responsibilities in this slice:
 *  - Resolve the current session state from wall-clock time on launch and rest
 *    on the correct surface. The app never auto-starts or auto-continues a
 *    session (FR-1b): a session can begin only through the parent entry.
 *  - Provide the single parent entry (gate → setup), reachable by a deliberate
 *    press-and-hold in a corner so a child cannot stumble into it (FR-29).
 *  - Start a fresh session on confirm (FR-1, FR-1a) or end the running one
 *    (FR-45), persisting the chosen values as pre-fills only (FR-1a).
 *
 * The child-facing rendering and the toy worlds live in src/render and
 * src/toys. The surface shows nothing that reveals session progress (NFR-1) and
 * resolves to a quiet, dim rest state outside an active session (FR-7, I-5).
 */

import { createEngine } from "./engine/index.js";
import { createLocalStorage } from "./platform/local-storage.js";
import { createParentDefaultsStore } from "./platform/parent-defaults-store.js";
import { applyDefaults, defaultsFromSetup } from "./parent/parent-defaults.js";
import { openParentEntry } from "./parent/index.js";
import { DEFAULT_SETUP, toSessionConfig } from "./parent/setup-config.js";
import { mountSurface, type SurfaceController } from "./render/index.js";
import { createToyBox } from "./toys/index.js";

/** How long the corner must be held to reveal the parent gate, in ms (FR-29). */
const HOLD_TO_REVEAL_MS = 3000;

const engine = createEngine(createLocalStorage());
const defaultsStore = createParentDefaultsStore();

const app = document.getElementById("app");

// The render surface owns the canvas and the loop. It resolves the launch
// surface itself (resuming an in-flight session or resting quiet), so the app
// never auto-starts one (FR-1b, FR-6). Assigned below, once the parent cue
// exists, so the surface can show/hide the cue as the session begins and ends.
let surface: SurfaceController | null = null;

let entryOpen = false;

/** Open the parent entry, apply the result, and repaint. */
async function openEntry(): Promise<void> {
  if (entryOpen) return;
  entryOpen = true;
  try {
    const result = await openParentEntry(document.body, {
      initialSetup: applyDefaults(defaultsStore.load()),
      sessionActive: engine.isActive(Date.now()),
    });
    if (result.action === "start") {
      engine.startSession(result.config, Date.now());
      defaultsStore.save(defaultsFromSetup(result.setup));
      surface?.restart();
    } else if (result.action === "end") {
      engine.endSession();
      surface?.sync();
    }
  } finally {
    entryOpen = false;
  }
}

interface HoldCue {
  /** Show the parent cue (rest surface) or hide it (during an active session). */
  setResting(resting: boolean): void;
}

/**
 * A press-and-hold target in the top-right corner. Holding it steadily for
 * {@link HOLD_TO_REVEAL_MS} opens the parent gate; a tap or a wandering finger
 * does nothing, keeping it out of a child's reach (FR-29). It sits opposite the
 * child's home button, which lives in the top-left.
 *
 * On the rest surface it carries a faint, parent-only cue: a dim ring that
 * fills as the corner is held, next to a low-contrast "hold to begin" hint, so
 * an adult can find the way in on a first launch instead of facing a blank
 * screen. The cue is deliberately quiet and non-playful, and is hidden entirely
 * during an active session, so the child is never shown anything that invites
 * play or reveals the wind-down (FR-7, NFR-1). The filling ring reflects the
 * hold gesture only, never session progress.
 */
function mountHoldTarget(): HoldCue {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = (() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  })();

  const target = document.createElement("div");
  target.setAttribute("aria-hidden", "true");
  Object.assign(target.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "168px",
    height: "96px",
    zIndex: "10",
    touchAction: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: "18px",
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  // Suppress the iOS long-press text selection, callout, and tap highlight, so a
  // steady hold reads as a gesture rather than selecting the hint text.
  target.style.setProperty("-webkit-user-select", "none");
  target.style.setProperty("-webkit-touch-callout", "none");
  target.style.setProperty("-webkit-tap-highlight-color", "transparent");

  // The cue itself. Non-interactive (the whole target is the hit area) and very
  // low-contrast, so it reads as a quiet adult handle, not a toy.
  const cue = document.createElement("div");
  Object.assign(cue.style, {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    opacity: "0",
    transition: "opacity 700ms ease",
    pointerEvents: "none",
    userSelect: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const hint = document.createElement("span");
  hint.textContent = "hold to begin";
  Object.assign(hint.style, {
    color: "rgba(231,236,245,0.32)",
    font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, sans-serif",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  } satisfies Partial<CSSStyleDeclaration>);

  const R = 16;
  const CIRC = 2 * Math.PI * R;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "40");
  svg.setAttribute("height", "40");
  svg.setAttribute("viewBox", "0 0 44 44");
  const base = document.createElementNS(SVG_NS, "circle");
  const arc = document.createElementNS(SVG_NS, "circle");
  for (const ring of [base, arc]) {
    ring.setAttribute("cx", "22");
    ring.setAttribute("cy", "22");
    ring.setAttribute("r", String(R));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke-width", "2");
    ring.setAttribute("stroke-linecap", "round");
  }
  base.setAttribute("stroke", "rgba(231,236,245,0.16)");
  arc.setAttribute("stroke", "rgba(231,236,245,0.72)");
  arc.setAttribute("stroke-dasharray", String(CIRC));
  arc.setAttribute("stroke-dashoffset", String(CIRC));
  arc.setAttribute("transform", "rotate(-90 22 22)");
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", "22");
  dot.setAttribute("cy", "22");
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "rgba(231,236,245,0.5)");
  svg.append(base, arc, dot);

  cue.append(hint, svg);
  target.append(cue);
  document.body.append(target);

  let resting = false;

  // A slow breath so a resting parent's eye finds the handle; skipped under
  // reduced motion. Idle affordance only, never session progress (NFR-1).
  let pulse: Animation | null = null;
  const startPulse = (): void => {
    if (reduceMotion || pulse !== null || !resting) return;
    pulse = cue.animate([{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }], {
      duration: 3800,
      iterations: Infinity,
      easing: "ease-in-out",
    });
  };
  const stopPulse = (): void => {
    pulse?.cancel();
    pulse = null;
  };

  // Drive the fill ring by hand from a rAF clock rather than the Web Animations
  // API: Safari does not reliably animate SVG stroke-dashoffset that way, and
  // this feedback must show even under reduced motion, since it reflects the
  // hold gesture, not decorative motion or session progress. The ring fills
  // across the hold and opens the gate when it completes.
  let holdRaf = 0;
  let holdStart = 0;
  const setArc = (progress: number): void => {
    arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - progress)));
  };
  const stopHold = (): void => {
    if (holdRaf !== 0) {
      window.cancelAnimationFrame(holdRaf);
      holdRaf = 0;
    }
    setArc(0);
    if (resting) startPulse();
  };
  const tickHold = (nowMs: number): void => {
    const progress = Math.min(1, (nowMs - holdStart) / HOLD_TO_REVEAL_MS);
    setArc(progress);
    if (progress >= 1) {
      holdRaf = 0;
      setArc(0);
      void openEntry();
      return;
    }
    holdRaf = window.requestAnimationFrame(tickHold);
  };

  target.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (holdRaf !== 0) return;
    stopPulse();
    cue.style.opacity = "1";
    holdStart = performance.now();
    holdRaf = window.requestAnimationFrame(tickHold);
  });
  for (const event of ["pointerup", "pointerleave", "pointercancel"] as const) {
    target.addEventListener(event, stopHold);
  }

  return {
    setResting(next: boolean): void {
      resting = next;
      cue.style.opacity = next ? "1" : "0";
      if (next) {
        startPulse();
      } else {
        stopPulse();
        stopHold();
      }
    },
  };
}

const holdCue = mountHoldTarget();

// Wire the surface now that the cue exists: the surface reports when it enters
// or leaves an active session (including a natural end when the duration
// elapses), and the parent cue follows, showing only on the rest surface.
surface =
  app === null
    ? null
    : mountSurface(
        app,
        engine,
        () => Date.now(),
        createToyBox(),
        (active) => holdCue.setResting(!active),
      );

// Developer-only conveniences. All gated on `__SLOWTIDE_DEV_TOOLS__`, a
// compile-time constant (see vite.config.ts) that is true under the Vite dev
// server, and also in a preview build made with SLOWTIDE_PREVIEW=1. In a normal
// production build it is baked to `false`, so this whole block — and the src/dev
// module behind it — is tree-shaken out and can never reach the child surface.
// Shipped production still rests neutral until the parent gate (FR-1b); it never
// auto-starts. A preview build deliberately does auto-start, for inspection only.
if (__SLOWTIDE_DEV_TOOLS__ && surface !== null) {
  // `surface` is a mutable binding, so capture the non-null value for the button
  // callbacks below (which would otherwise see it as possibly null).
  const surf = surface;
  // Default straight into the forest so there is no dev dance to see the scene.
  engine.startSession(toSessionConfig(DEFAULT_SETUP), Date.now());
  surf.restart();

  const styleBtn = (b: HTMLButtonElement): void => {
    Object.assign(b.style, {
      background: "#1a2136",
      color: "#e7ecf5",
      border: "1px solid #2d3653",
      borderRadius: "6px",
      padding: "7px 11px",
      font: "12px ui-monospace, monospace",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
  };
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    position: "fixed",
    bottom: "12px",
    left: "12px",
    zIndex: "2147483003",
    display: "flex",
    gap: "6px",
  } satisfies Partial<CSSStyleDeclaration>);
  const addBtn = (text: string, onClick: () => void): void => {
    const b = document.createElement("button");
    b.textContent = text;
    styleBtn(b);
    b.addEventListener("click", onClick);
    bar.append(b);
  };
  // Preview the scene at different times of day (the real clock drives it by
  // default; these pin it for inspection). "Now" returns to the real clock.
  addBtn("Now", () => surf.setTimeOfDayOverride(null));
  addBtn("Day", () => surf.setTimeOfDayOverride(0.9));
  addBtn("Dusk", () => surf.setTimeOfDayOverride(0.4));
  addBtn("Night", () => surf.setTimeOfDayOverride(0.05));
  // Single toggle for the engine tuner: opens it, and closes it again.
  let teardownDev: (() => void) | null = null;
  const engineBtn = document.createElement("button");
  styleBtn(engineBtn);
  const setEngineLabel = (): void => {
    engineBtn.textContent = teardownDev ? "Close engine view" : "Engine view";
  };
  setEngineLabel();
  engineBtn.addEventListener("click", () => {
    if (teardownDev) {
      teardownDev();
      teardownDev = null;
      setEngineLabel();
      return;
    }
    void import("./dev/index.js").then(({ mountDevView }) => {
      teardownDev = mountDevView(document.body);
      setEngineLabel();
    });
  });
  bar.append(engineBtn);
  document.body.append(bar);
}
