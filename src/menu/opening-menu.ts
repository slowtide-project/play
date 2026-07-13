/**
 * The opening menu (D-14, FR-55): the child-facing surface the app rests on when
 * no session is running. It offers the two session modes as two large,
 * icon-led, non-verbal tiles (FR-55, NFR-6). Tapping a tile asks the app to
 * start a session in that mode (FR-56); the app resolves the settings from the
 * parent's saved defaults.
 *
 * This is a child-facing DOM edge. It carries no engine logic and no session
 * config: it only reports which tile was tapped. It sits above the dim rest
 * canvas and below the hidden parent-gate corner (which keeps a higher z-index),
 * so the corner hold-to-reveal still works while the menu is shown. It shows
 * nothing about pacing or progress and never animates in a startling way
 * (NFR-1, NFR-5).
 */

import type { MenuMode } from "../parent/setup-config.js";

const STYLE_ID = "slowtide-opening-menu-style";
const ROOT_CLASS = "st-menu";

export interface OpeningMenu {
  /** Reveal the menu (the resting surface). */
  show(): void;
  /** Hide the menu (an active session owns the screen). */
  hide(): void;
  destroy(): void;
}

interface TileSpec {
  readonly mode: MenuMode;
  readonly label: string;
  /** Inline SVG for the emblem; drawn in currentColor. */
  readonly icon: string;
  readonly className: string;
}

// A waning crescent for the bedtime wind-down; a smooth endless loop for anytime
// play. Both are sized by CSS (below) so the two tiles' labels line up.
const MOON_ICON =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<path fill="currentColor" d="M67 8a44 44 0 1 0 25 79 36 36 0 0 1-25-79z"/></svg>';
const LOOP_ICON =
  '<svg viewBox="0 0 120 80" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="11" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M60 40C72 20 100 20 100 40C100 60 72 60 60 40C48 20 20 20 20 40C20 60 48 60 60 40Z"/>' +
  "</svg>";

const TILES: readonly TileSpec[] = [
  { mode: "wind-down", label: "Wind-down", icon: MOON_ICON, className: "st-menu-tile--winddown" },
  { mode: "infinite", label: "Anytime", icon: LOOP_ICON, className: "st-menu-tile--infinite" },
];

const STYLE = `
.${ROOT_CLASS} {
  position: fixed; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  gap: clamp(20px, 5vw, 56px); padding: 6vmin;
  box-sizing: border-box; pointer-events: none;
  opacity: 0; transition: opacity 600ms ease;
  font: 500 16px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.${ROOT_CLASS}.is-shown { opacity: 1; }
.${ROOT_CLASS}.is-hidden { display: none; }
.${ROOT_CLASS}-tile {
  pointer-events: auto; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(12px, 2vh, 24px);
  width: clamp(180px, 34vmin, 340px); aspect-ratio: 1 / 1;
  border: 0; border-radius: 28px; color: #e9eef8;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.42);
  transition: transform 220ms ease, filter 220ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.${ROOT_CLASS}-tile:active { transform: scale(0.97); filter: brightness(1.08); }
.st-menu-tile--winddown { background: radial-gradient(circle at 38% 32%, #343a63, #1b1f38); }
.st-menu-tile--infinite { background: radial-gradient(circle at 38% 32%, #285049, #16302c); }
/* Fixed-height emblem box so both tiles' labels sit at the same baseline. */
.${ROOT_CLASS}-emblem {
  min-height: clamp(80px, 12vh, 100px);
  display: flex; align-items: center; justify-content: center; opacity: 0.92;
}
.${ROOT_CLASS}-emblem svg { display: block; width: auto; }
.st-menu-tile--winddown .st-menu-emblem { color: #d6def7; }
.st-menu-tile--winddown .st-menu-emblem svg { height: clamp(60px, 9vh, 82px); }
.st-menu-tile--infinite .st-menu-emblem { color: #c6ece0; }
.st-menu-tile--infinite .st-menu-emblem svg { height: clamp(38px, 5.6vh, 52px); }
.${ROOT_CLASS}-label {
  font-size: clamp(16px, 2.4vh, 22px); letter-spacing: 0.01em; color: rgba(233, 238, 248, 0.9);
}
@media (prefers-reduced-motion: reduce) {
  .${ROOT_CLASS} { transition: none; }
  .${ROOT_CLASS}-tile { transition: none; }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

/** Mount the opening menu into `host`; `onChoose` fires with the tapped mode. */
export function createOpeningMenu(
  host: HTMLElement,
  onChoose: (mode: MenuMode) => void,
): OpeningMenu {
  ensureStyles();
  const root = document.createElement("div");
  root.className = `${ROOT_CLASS} is-hidden`;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Choose how to play");

  for (const spec of TILES) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `${ROOT_CLASS}-tile ${spec.className}`;
    tile.setAttribute("aria-label", spec.label);
    const emblem = document.createElement("span");
    emblem.className = "st-menu-emblem";
    emblem.innerHTML = spec.icon;
    const label = document.createElement("span");
    label.className = `${ROOT_CLASS}-label`;
    label.textContent = spec.label;
    tile.append(emblem, label);
    tile.addEventListener("click", () => onChoose(spec.mode));
    root.append(tile);
  }

  host.append(root);

  let shownFrame = 0;

  return {
    show() {
      root.classList.remove("is-hidden");
      // Let the display flip apply before fading in, so the transition runs.
      if (shownFrame !== 0) window.cancelAnimationFrame(shownFrame);
      shownFrame = window.requestAnimationFrame(() => {
        shownFrame = window.requestAnimationFrame(() => root.classList.add("is-shown"));
      });
    },
    hide() {
      if (shownFrame !== 0) {
        window.cancelAnimationFrame(shownFrame);
        shownFrame = 0;
      }
      root.classList.remove("is-shown");
      root.classList.add("is-hidden");
    },
    destroy() {
      if (shownFrame !== 0) window.cancelAnimationFrame(shownFrame);
      root.remove();
    },
  };
}
