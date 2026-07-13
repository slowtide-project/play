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
import { createParentPinStore } from "./platform/parent-pin-store.js";
import { applyDefaults, defaultsFromSetup } from "./parent/parent-defaults.js";
import { openParentEntry } from "./parent/index.js";
import { menuModeConfig, type MenuMode } from "./parent/setup-config.js";
import { createOpeningMenu } from "./menu/opening-menu.js";
import { mountSurface, type SurfaceController } from "./render/index.js";
import { createToyBox } from "./toys/index.js";
import { resolveDevMode } from "./platform/dev-mode.js";
import { forceReloadLatest, setupAutoUpdate } from "./platform/app-update.js";

// Whether the developer tools are active this launch: the compile-time preview
// flag, or the hidden runtime unlock (`?dev=on`) on the deployed build. Resolved
// once here, the single composition root, and threaded to the surface and the
// toolbar below (see ./platform/dev-mode).
const devTools = resolveDevMode();

// Register the service worker and keep it fresh, so a new deploy is picked up on
// the next launch/foreground without clearing Safari history by hand (NFR-8).
setupAutoUpdate();

/** How long the corner must be held to reveal the parent gate, in ms (FR-29). */
const HOLD_TO_REVEAL_MS = 3000;

const engine = createEngine(createLocalStorage());
const defaultsStore = createParentDefaultsStore();
const pinStore = createParentPinStore();

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
      pin: pinStore,
      // Parent-gated manual force-update (NFR-7): the reliable backup for when a
      // deploy should be pulled in immediately rather than on the next launch.
      onCheckForUpdates: () => {
        void forceReloadLatest();
      },
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
    height: "132px",
    zIndex: "10",
    touchAction: "none",
    background: "transparent",
    display: "flex",
    // Sit the cue just below the status bar / Dynamic Island rather than
    // centred in the box, so it is never hidden behind the island and stays
    // reachable in portrait on a notched phone as well as landscape on iPad.
    // The safe-area insets are zero on non-notched devices, where the small
    // floor keeps the cue clear of a normal status bar.
    alignItems: "flex-start",
    justifyContent: "flex-end",
    paddingTop: "max(env(safe-area-inset-top, 0px), 10px)",
    paddingRight: "max(env(safe-area-inset-right, 0px), 18px)",
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
  // No words: begin is now via the menu tiles; this faint corner is only the
  // parent's way into settings (FR-57), so it must not read as a child control.
  hint.textContent = "";
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
  // pointerdown forces the cue visible for hold feedback; when the hold ends we
  // must return it to the visibility its resting state dictates. Without this the
  // cue stays lit after a hold *during* a session, since nothing else hides it
  // again until the next session boundary.
  const settleCueOpacity = (): void => {
    cue.style.opacity = resting ? "1" : "0";
  };
  const stopHold = (): void => {
    if (holdRaf !== 0) {
      window.cancelAnimationFrame(holdRaf);
      holdRaf = 0;
    }
    setArc(0);
    settleCueOpacity();
    if (resting) startPulse();
  };
  const tickHold = (nowMs: number): void => {
    const progress = Math.min(1, (nowMs - holdStart) / HOLD_TO_REVEAL_MS);
    setArc(progress);
    if (progress >= 1) {
      holdRaf = 0;
      setArc(0);
      settleCueOpacity();
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

/**
 * Start a session from the opening menu (FR-1, FR-56): resolve the config for
 * the chosen mode from the parent's saved defaults, begin a fresh session, and
 * repaint. This is the child's route in; the detailed configuration behind it
 * stays in the parent gate (FR-57).
 */
function startFromMenu(mode: MenuMode): void {
  const saved = applyDefaults(defaultsStore.load());
  engine.startSession(menuModeConfig(mode, saved), Date.now());
  surface?.restart();
}

const openingMenu = createOpeningMenu(document.body, startFromMenu);

// Wire the surface now that the cue and menu exist: the surface reports when it
// enters or leaves an active session (including a natural end when a timed
// session's duration elapses). The parent cue and the opening menu both follow,
// showing only on the rest surface (FR-7).
surface =
  app === null
    ? null
    : mountSurface(
        app,
        engine,
        () => Date.now(),
        createToyBox(),
        (active) => {
          holdCue.setResting(!active);
          if (active) openingMenu.hide();
          else openingMenu.show();
        },
        devTools,
      );

// Developer-only conveniences. Active when `devTools` is true: either the
// compile-time preview flag (Vite dev server or a SLOWTIDE_PREVIEW=1 build) or
// the hidden runtime unlock on the deployed site (`?dev=on`). By default on the
// deployed build `devTools` is false, so this whole block is inert and the app
// rests neutral until the parent gate (FR-1b).
//
// Every launch, dev or not, rests on the opening menu (FR-1b, FR-7): a session
// begins only from a menu tile or the parent setup. There is deliberately no
// auto-start into a scene — the menu must be the first thing anyone sees (D-14).
if (devTools && surface !== null) {
  // `surface` is a mutable binding, so capture the non-null value for the button
  // callbacks below (which would otherwise see it as possibly null).
  const surf = surface;

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

  // A live frame-time readout, measured in the surface loop and polled here, so
  // the true forest render cost can be read on a real device via the preview
  // build. Text only, inside the dev toolbar, never on the child surface.
  const stats = document.createElement("span");
  Object.assign(stats.style, {
    alignSelf: "center",
    marginLeft: "4px",
    minWidth: "148px",
    color: "#8ff0c8",
    font: "12px ui-monospace, monospace",
  } satisfies Partial<CSSStyleDeclaration>);
  bar.append(stats);
  window.setInterval(() => {
    const s = surf.frameStats();
    stats.textContent =
      s === null ? "measuring…" : `draw ${s.drawMs.toFixed(1)}ms · cap ${s.capFps}fps`;
  }, 400);

  document.body.append(bar);
}
