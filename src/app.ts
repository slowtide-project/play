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
import { mountSurface } from "./render/index.js";
import { createToyBox } from "./toys/index.js";

/** How long the corner must be held to reveal the parent gate, in ms (FR-29). */
const HOLD_TO_REVEAL_MS = 3000;

const engine = createEngine(createLocalStorage());
const defaultsStore = createParentDefaultsStore();

const app = document.getElementById("app");

// The render surface owns the canvas and the loop. It resolves the launch
// surface itself (resuming an in-flight session or resting quiet), so the app
// never auto-starts one (FR-1b, FR-6).
const surface = app === null ? null : mountSurface(app, engine, () => Date.now(), createToyBox());

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

/**
 * A press-and-hold target in the top-right corner. Holding it steadily for
 * {@link HOLD_TO_REVEAL_MS} opens the parent gate; a tap or a wandering finger
 * does nothing, keeping it out of a child's reach (FR-29). It sits opposite the
 * child's home button, which lives in the top-left.
 */
function mountHoldTarget(): void {
  const target = document.createElement("div");
  target.setAttribute("aria-hidden", "true");
  Object.assign(target.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "72px",
    height: "72px",
    zIndex: "10",
    touchAction: "none",
    background: "transparent",
  } satisfies Partial<CSSStyleDeclaration>);

  let holdTimer = 0;
  const cancel = (): void => {
    if (holdTimer !== 0) {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    }
  };
  target.addEventListener("pointerdown", () => {
    cancel();
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      void openEntry();
    }, HOLD_TO_REVEAL_MS);
  });
  for (const event of ["pointerup", "pointerleave", "pointercancel"] as const) {
    target.addEventListener(event, cancel);
  }
  document.body.append(target);
}

mountHoldTarget();

// Developer-only conveniences. All gated on `__SLOWTIDE_DEV_TOOLS__`, a
// compile-time constant (see vite.config.ts) that is true under the Vite dev
// server, and also in a preview build made with SLOWTIDE_PREVIEW=1. In a normal
// production build it is baked to `false`, so this whole block — and the src/dev
// module behind it — is tree-shaken out and can never reach the child surface.
// Shipped production still rests neutral until the parent gate (FR-1b); it never
// auto-starts. A preview build deliberately does auto-start, for inspection only.
if (__SLOWTIDE_DEV_TOOLS__ && surface !== null) {
  // Default straight into the forest so there is no dev dance to see the scene.
  engine.startSession(toSessionConfig(DEFAULT_SETUP), Date.now());
  surface.restart();

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
  addBtn("Now", () => surface.setTimeOfDayOverride(null));
  addBtn("Day", () => surface.setTimeOfDayOverride(0.9));
  addBtn("Dusk", () => surface.setTimeOfDayOverride(0.4));
  addBtn("Night", () => surface.setTimeOfDayOverride(0.05));
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
