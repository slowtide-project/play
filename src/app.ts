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
import { createMenuSetupStore } from "./platform/menu-setup-store.js";
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

/** How long the fill takes to complete once the hold has activated, in ms (FR-29). */
const HOLD_TO_REVEAL_MS = 3000;

/**
 * A silent dead time at the very start of a press: nothing is shown and nothing
 * begins filling until the corner has been held continuously for this long. A
 * child's casual tap, poke, or brush gets no feedback at all, so there is
 * nothing to notice or probe; only a deliberate sustained hold crosses it and
 * starts the reveal (FR-29, NFR-1, NFR-3). Total time to open is this plus
 * {@link HOLD_TO_REVEAL_MS}.
 */
const HOLD_ACTIVATION_MS = 700;

const engine = createEngine(createLocalStorage());
const defaultsStore = createParentDefaultsStore();
const pinStore = createParentPinStore();
const menuSetupStore = createMenuSetupStore();

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
 * On the rest surface it carries a faint, parent-only cue: a dim ring with a
 * centre dot marking where to press, so an adult can find the way in on a first
 * launch instead of facing a blank screen. A press does nothing at all for a
 * short dead time ({@link HOLD_ACTIVATION_MS}), so a child's tap or brush gets no
 * feedback to notice or probe; only once a deliberate hold crosses that delay
 * does an expanding ripple grow outward from the exact touch point and past the
 * finger, so the person holding can see how far the gesture has progressed even
 * with a thumb over the corner. The cue is deliberately quiet and non-playful, and is
 * hidden entirely during an active session, so the child is never shown anything
 * that invites play or reveals the wind-down (FR-7, NFR-1). The ripple reflects
 * the hold gesture only, never session progress.
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

  // The resting handle: a faint static ring with a centre dot, so a parent can
  // find the corner on a blank first-launch surface. It no longer shows hold
  // progress itself (that is the ripple below); it is only a "start here" mark.
  const R = 16;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "40");
  svg.setAttribute("height", "40");
  svg.setAttribute("viewBox", "0 0 44 44");
  const base = document.createElementNS(SVG_NS, "circle");
  base.setAttribute("cx", "22");
  base.setAttribute("cy", "22");
  base.setAttribute("r", String(R));
  base.setAttribute("fill", "none");
  base.setAttribute("stroke-width", "2");
  base.setAttribute("stroke-linecap", "round");
  base.setAttribute("stroke", "rgba(231,236,245,0.16)");
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", "22");
  dot.setAttribute("cy", "22");
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "rgba(231,236,245,0.5)");
  svg.append(base, dot);

  cue.append(hint, svg);
  target.append(cue);
  document.body.append(target);

  // Hold feedback fills *outward* from under the finger rather than around a
  // ring's circumference: a fingertip covers the corner ring, so a circumference
  // fill is invisible to the person doing the hold. Instead an expanding ripple
  // is centred on the exact touch point and grows past the fingertip, so the
  // leading edge clears the thumb and the parent sees how far the hold has got.
  // RIPPLE_MAX is comfortably wider than a thumb's contact patch for this reason.
  // This reflects the hold gesture only, never session progress (NFR-1), and is
  // shown even under reduced motion since it is functional feedback, not decor.
  const RIPPLE_MIN = 12;
  const RIPPLE_MAX = 92;
  const RIPPLE_BOX = RIPPLE_MAX * 2 + 8;
  const RIPPLE_C = RIPPLE_BOX / 2;
  const ripple = document.createElementNS(SVG_NS, "svg");
  ripple.setAttribute("width", String(RIPPLE_BOX));
  ripple.setAttribute("height", String(RIPPLE_BOX));
  ripple.setAttribute("viewBox", `0 0 ${RIPPLE_BOX} ${RIPPLE_BOX}`);
  ripple.setAttribute("aria-hidden", "true");
  Object.assign(ripple.style, {
    position: "fixed",
    left: "0",
    top: "0",
    // Parked off-screen until a hold begins; positioned on pointerdown.
    transform: "translate(-9999px, -9999px)",
    opacity: "0",
    transition: "opacity 160ms ease",
    pointerEvents: "none",
    zIndex: "11",
  } satisfies Partial<CSSStyleDeclaration>);
  // A static outer target ring at the completion radius: the goal the growing
  // fill is racing toward. Seeing the gap between the expanding edge and this
  // ring tells the parent how close the menu is to opening. Fainter than the
  // moving edge so the fill reads as the active element.
  const rippleTarget = document.createElementNS(SVG_NS, "circle");
  rippleTarget.setAttribute("cx", String(RIPPLE_C));
  rippleTarget.setAttribute("cy", String(RIPPLE_C));
  rippleTarget.setAttribute("r", String(RIPPLE_MAX));
  rippleTarget.setAttribute("fill", "none");
  rippleTarget.setAttribute("stroke", "rgba(231,236,245,0.22)");
  rippleTarget.setAttribute("stroke-width", "1.5");
  const rippleFill = document.createElementNS(SVG_NS, "circle");
  const rippleEdge = document.createElementNS(SVG_NS, "circle");
  for (const c of [rippleFill, rippleEdge]) {
    c.setAttribute("cx", String(RIPPLE_C));
    c.setAttribute("cy", String(RIPPLE_C));
    c.setAttribute("r", String(RIPPLE_MIN));
  }
  rippleFill.setAttribute("fill", "rgba(231,236,245,0.10)");
  rippleEdge.setAttribute("fill", "none");
  rippleEdge.setAttribute("stroke", "rgba(231,236,245,0.80)");
  rippleEdge.setAttribute("stroke-width", "2.5");
  ripple.append(rippleTarget, rippleFill, rippleEdge);
  document.body.append(ripple);

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
  let holdX = 0;
  let holdY = 0;
  let activated = false;
  // Grow the ripple radius with progress so the leading edge sweeps outward from
  // the touch point; at progress 1 it reaches RIPPLE_MAX, well past the finger.
  const setProgress = (progress: number): void => {
    const r = RIPPLE_MIN + (RIPPLE_MAX - RIPPLE_MIN) * progress;
    rippleFill.setAttribute("r", String(r));
    rippleEdge.setAttribute("r", String(r));
  };
  const hideRipple = (): void => {
    ripple.style.opacity = "0";
    ripple.style.transform = "translate(-9999px, -9999px)";
    setProgress(0);
  };
  const placeRipple = (x: number, y: number): void => {
    ripple.style.transform = `translate(${x - RIPPLE_C}px, ${y - RIPPLE_C}px)`;
    ripple.style.opacity = "1";
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
    activated = false;
    hideRipple();
    settleCueOpacity();
    if (resting) startPulse();
  };
  const tickHold = (nowMs: number): void => {
    const held = nowMs - holdStart;
    // Dead time: hold recognised but nothing shown yet. A press released in here
    // leaves no trace, so a stray tap never reveals that anything is there.
    if (held < HOLD_ACTIVATION_MS) {
      holdRaf = window.requestAnimationFrame(tickHold);
      return;
    }
    // First frame past the dead time: the hold has proven deliberate, so now
    // bring up the ripple under the finger and quiet the resting cue's breath.
    if (!activated) {
      activated = true;
      stopPulse();
      cue.style.opacity = "1";
      placeRipple(holdX, holdY);
    }
    const progress = Math.min(1, (held - HOLD_ACTIVATION_MS) / HOLD_TO_REVEAL_MS);
    setProgress(progress);
    if (progress >= 1) {
      holdRaf = 0;
      activated = false;
      hideRipple();
      settleCueOpacity();
      void openEntry();
      return;
    }
    holdRaf = window.requestAnimationFrame(tickHold);
  };

  target.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (holdRaf !== 0) return;
    // Record where the press landed but show nothing yet: the ripple only
    // appears once the dead time elapses (see tickHold).
    holdX = event.clientX;
    holdY = event.clientY;
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

/** Begin a session in the tapped menu mode from the saved defaults, and repaint. */
function startSavedSession(mode: MenuMode): void {
  const saved = applyDefaults(defaultsStore.load());
  engine.startSession(menuModeConfig(mode, saved), Date.now());
  surface?.restart();
}

/**
 * A tile's first-ever use (D-14): before that first session runs, take the
 * parent through the gate and setup so they configure the mode (and, on a fresh
 * install, set the PIN) rather than starting on bare defaults. On confirm, save
 * the chosen values as pre-fills, remember that this tile is now configured, and
 * start the session in the tapped mode. A cancelled gate or setup leaves the app
 * resting on the menu, unchanged, and the tile stays "first-run" for next time.
 */
async function openMenuSetup(mode: MenuMode): Promise<void> {
  if (entryOpen) return;
  entryOpen = true;
  try {
    const result = await openParentEntry(document.body, {
      initialSetup: applyDefaults(defaultsStore.load()),
      sessionActive: engine.isActive(Date.now()),
      pin: pinStore,
      focus: mode,
      onCheckForUpdates: () => {
        void forceReloadLatest();
      },
    });
    if (result.action === "start") {
      defaultsStore.save(defaultsFromSetup(result.setup));
      menuSetupStore.markConfigured(mode);
      engine.startSession(menuModeConfig(mode, result.setup), Date.now());
      surface?.restart();
    } else if (result.action === "end") {
      engine.endSession();
      surface?.sync();
    }
  } finally {
    entryOpen = false;
  }
}

/**
 * Start a session from the opening menu (FR-1, FR-56). The first time each tile
 * is used it routes through parent setup first (D-14, {@link openMenuSetup});
 * after that, tapping the tile starts immediately from the saved defaults, so
 * daily use stays child-simple and the detailed configuration stays behind the
 * parent gate (FR-57).
 */
function startFromMenu(mode: MenuMode): void {
  if (menuSetupStore.isConfigured(mode)) {
    startSavedSession(mode);
    return;
  }
  void openMenuSetup(mode);
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
