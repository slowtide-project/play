/**
 * Shared DOM scaffolding for the parent-facing overlays (gate and setup).
 *
 * These overlays are parent-only surfaces mounted above the child app. They are
 * allowed to show text, numbers, and controls that the child surface (NFR-1)
 * never shows. They mount as siblings of the child `main`, not inside it, so the
 * child region can stay `aria-hidden` while the overlay is fully accessible to
 * the parent.
 *
 * This is an impure edge (DOM only) and carries no engine logic.
 */

const STYLE_ID = "slowtide-parent-style";
export const PARENT_ROOT_CLASS = "st-parent";

/** Create an element with an optional class and text, typed by tag name. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STYLE = `
.${PARENT_ROOT_CLASS}-backdrop {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  box-sizing: border-box; background: rgba(4, 6, 16, 0.82);
  font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e7ecf5;
  -webkit-tap-highlight-color: transparent;
}
.${PARENT_ROOT_CLASS}-card {
  width: min(560px, 100%); max-height: 100%; overflow: auto;
  background: #121732; border: 1px solid #2d3653; border-radius: 16px;
  padding: 24px 24px 20px; box-sizing: border-box;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}
.${PARENT_ROOT_CLASS}-card h2 { margin: 0 0 4px; font-size: 20px; }
.${PARENT_ROOT_CLASS}-card p.st-parent-sub { margin: 0 0 20px; color: #9fb0d0; font-size: 14px; }
.${PARENT_ROOT_CLASS}-code {
  display: flex; gap: 10px; justify-content: center; margin: 4px 0 18px;
  font-size: 34px; letter-spacing: 0.12em; font-variant-numeric: tabular-nums;
}
.${PARENT_ROOT_CLASS}-code span {
  min-width: 44px; text-align: center; padding: 6px 0; border-radius: 10px;
  background: #0d1226; border: 1px solid #2d3653; color: #7fd1ff;
}
.${PARENT_ROOT_CLASS}-entry {
  height: 22px; text-align: center; font-size: 26px; letter-spacing: 0.35em;
  color: #e7ecf5; margin: 0 0 16px; font-variant-numeric: tabular-nums;
}
.${PARENT_ROOT_CLASS}-entry.is-wrong { color: #f2a03d; animation: st-parent-shake 0.3s; }
@keyframes st-parent-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.${PARENT_ROOT_CLASS}-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.${PARENT_ROOT_CLASS}-keypad button {
  padding: 18px 0; font-size: 22px; border-radius: 12px;
  background: #1a2136; color: #e7ecf5; border: 1px solid #2d3653; cursor: pointer;
}
.${PARENT_ROOT_CLASS}-keypad button:active { background: #232c48; }
.${PARENT_ROOT_CLASS}-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.${PARENT_ROOT_CLASS}-field { margin: 0 0 16px; }
.${PARENT_ROOT_CLASS}-field-head { display: flex; justify-content: space-between; align-items: baseline; }
.${PARENT_ROOT_CLASS}-field-head label { font-weight: 600; }
.${PARENT_ROOT_CLASS}-field-head .st-parent-val { color: #7fd1ff; font-variant-numeric: tabular-nums; }
.${PARENT_ROOT_CLASS}-field .st-parent-hint { margin: 2px 0 0; color: #8a94ad; font-size: 12px; }
.${PARENT_ROOT_CLASS} input[type="range"] { width: 100%; margin: 8px 0 0; accent-color: #7fd1ff; }
.${PARENT_ROOT_CLASS}-seg { display: inline-flex; border: 1px solid #2d3653; border-radius: 10px; overflow: hidden; }
.${PARENT_ROOT_CLASS}-seg button {
  padding: 10px 18px; font: inherit; background: #1a2136; color: #e7ecf5; border: 0; cursor: pointer;
}
.${PARENT_ROOT_CLASS}-seg button[aria-pressed="true"] { background: #7fd1ff; color: #08122a; font-weight: 600; }
.${PARENT_ROOT_CLASS}-check { display: flex; align-items: center; gap: 10px; margin: 12px 0 0; cursor: pointer; }
.${PARENT_ROOT_CLASS}-check input { width: 20px; height: 20px; accent-color: #7fd1ff; }
.${PARENT_ROOT_CLASS}-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; flex-wrap: wrap; }
.${PARENT_ROOT_CLASS}-btn {
  padding: 12px 20px; font: inherit; border-radius: 12px; cursor: pointer;
  background: #1a2136; color: #e7ecf5; border: 1px solid #2d3653;
}
.${PARENT_ROOT_CLASS}-btn.is-primary { background: #7fd1ff; color: #08122a; border-color: #7fd1ff; font-weight: 600; }
.${PARENT_ROOT_CLASS}-btn.is-danger { color: #f2a03d; border-color: #5a3a1a; }
.${PARENT_ROOT_CLASS}-fieldset { border: 1px solid #232a3f; border-radius: 12px; padding: 12px 14px 4px; margin: 8px 0 0; }
.${PARENT_ROOT_CLASS}-fieldset legend { padding: 0 6px; color: #9fb0d0; font-size: 13px; }
.${PARENT_ROOT_CLASS}-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-wrap: wrap; margin-top: 20px; padding-top: 16px; border-top: 1px solid #232a3f;
}
.${PARENT_ROOT_CLASS}-build { color: #8a94ad; font-size: 12px; font-variant-numeric: tabular-nums; }
.${PARENT_ROOT_CLASS}-foot .st-parent-btn:disabled { opacity: 0.6; cursor: default; }
`;

/** Inject the shared parent stylesheet once. */
export function ensureParentStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = el("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

export interface Overlay {
  readonly backdrop: HTMLElement;
  readonly card: HTMLElement;
  remove(): void;
}

/**
 * Mount a centred modal card on a dim backdrop. The card is a `dialog`-role
 * region; callers fill it and call {@link Overlay.remove} when done.
 */
export function createOverlay(host: HTMLElement, labelledBy: string): Overlay {
  ensureParentStyles();
  const backdrop = el("div", `${PARENT_ROOT_CLASS} ${PARENT_ROOT_CLASS}-backdrop`);
  const card = el("div", `${PARENT_ROOT_CLASS}-card`);
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", labelledBy);
  card.tabIndex = -1;
  backdrop.append(card);
  host.append(backdrop);
  card.focus();
  return {
    backdrop,
    card,
    remove() {
      backdrop.remove();
    },
  };
}
