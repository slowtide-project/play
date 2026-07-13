/**
 * The parent gate overlay (FR-29, D-13): a PIN challenge that stands between the
 * child surface and all configuration. It is only ever reached through the
 * hidden press-and-hold in the app root (FR-29a); this module owns what happens
 * once it is open.
 *
 * The parent sets their own PIN, entered on a keypad whose digit positions
 * reshuffle on every presentation and after every wrong attempt, so a watching
 * child cannot learn the entry by tap pattern (FR-29b). A wrong entry simply
 * reshuffles and clears — no locked, greyed, error, or "wait" state that would
 * reveal the mechanism or invite probing (NFR-1, NFR-3). Cancelling (the ✕ or
 * Escape) resolves `false`.
 *
 * On first run, or when the parent chooses to change the PIN, the gate runs a
 * set-and-confirm flow instead and resolves `true` once a new PIN is saved.
 *
 * This is the DOM edge; the PIN rules and keypad shuffle are pure and tested in
 * {@link ./parent-pin}.
 */

import { createOverlay, el } from "./overlay.js";
import { PIN_LENGTH, shuffledKeypad, verifyPin, type PinPort } from "./parent-pin.js";

const TITLE_ID = "st-parent-gate-title";

export interface ParentGateOptions {
  /** The PIN store: its `read` decides set-vs-enter, its `write` saves a new PIN. */
  readonly pin: PinPort;
  /** Force the set-a-PIN flow even when a PIN exists (the "change PIN" path). */
  readonly mode?: "enter" | "set" | undefined;
  /** Injectable randomness for the keypad shuffle (tests); defaults to Math.random. */
  readonly rng?: (() => number) | undefined;
}

export interface ParentGate {
  /** Resolves true when the parent passes (or sets) the PIN, false if they cancel. */
  readonly passed: Promise<boolean>;
  /** Dismiss the gate early (resolves the promise as a cancel). */
  close(): void;
}

type Phase = "enter" | "create" | "confirm";

/** Open the parent gate over `host`. */
export function openParentGate(host: HTMLElement, options: ParentGateOptions): ParentGate {
  const rng = options.rng ?? Math.random;
  const stored = options.pin.read();
  let phase: Phase = options.mode === "set" || stored === null ? "create" : "enter";

  const overlay = createOverlay(host, TITLE_ID);
  let entered = "";
  let firstEntry = "";
  let settled = false;

  const title = el("h2", undefined, "Parent access");
  title.id = TITLE_ID;
  const sub = el("p", "st-parent-sub");
  const entryRow = el("div", "st-parent-entry");
  const keypad = el("div", "st-parent-keypad");

  const SUBTITLES: Record<Phase, string> = {
    enter: "Enter your PIN to reach the settings.",
    create: `Choose a ${PIN_LENGTH}-digit PIN. You'll use it each time to reach the settings.`,
    confirm: "Enter your PIN again to confirm.",
  };

  function renderEntry(): void {
    entryRow.textContent = "•".repeat(entered.length).padEnd(PIN_LENGTH, "·");
  }

  function renderPhase(): void {
    sub.textContent = SUBTITLES[phase];
    entered = "";
    renderEntry();
    renderKeypad();
  }

  function shake(): void {
    entryRow.classList.add("is-wrong");
    window.setTimeout(() => entryRow.classList.remove("is-wrong"), 300);
  }

  let resolvePassed!: (value: boolean) => void;
  const passed = new Promise<boolean>((resolve) => {
    resolvePassed = resolve;
  });

  function settle(result: boolean): void {
    if (settled) return;
    settled = true;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    resolvePassed(result);
  }

  /** A full-length entry arrived; resolve it according to the current phase. */
  function submit(): void {
    if (phase === "enter") {
      if (stored !== null && verifyPin(stored, entered)) settle(true);
      else {
        shake();
        renderPhase();
      }
      return;
    }
    if (phase === "create") {
      firstEntry = entered;
      phase = "confirm";
      renderPhase();
      return;
    }
    // confirm
    if (entered === firstEntry) {
      options.pin.write(firstEntry);
      settle(true);
    } else {
      shake();
      firstEntry = "";
      phase = "create";
      renderPhase();
    }
  }

  function press(digit: string): void {
    if (settled || entered.length >= PIN_LENGTH) return;
    entered += digit;
    renderEntry();
    if (entered.length === PIN_LENGTH) submit();
  }

  function backspace(): void {
    entered = entered.slice(0, -1);
    renderEntry();
  }

  /** Rebuild the keypad with a freshly shuffled digit order (FR-29b). */
  function renderKeypad(): void {
    const digits = shuffledKeypad(rng);
    const buttons: HTMLButtonElement[] = digits.map((d) => {
      const btn = el("button", undefined, d);
      btn.type = "button";
      btn.addEventListener("click", () => press(d));
      return btn;
    });
    const backBtn = el("button", undefined, "⌫");
    backBtn.type = "button";
    backBtn.setAttribute("aria-label", "Delete");
    backBtn.addEventListener("click", () => backspace());
    const cancelBtn = el("button", undefined, "✕");
    cancelBtn.type = "button";
    cancelBtn.setAttribute("aria-label", "Cancel");
    cancelBtn.addEventListener("click", () => settle(false));
    keypad.replaceChildren(...buttons, backBtn, cancelBtn);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key >= "0" && event.key <= "9") press(event.key);
    else if (event.key === "Backspace") backspace();
    else if (event.key === "Escape") settle(false);
  }
  document.addEventListener("keydown", onKeydown);

  renderPhase();
  overlay.card.append(title, sub, entryRow, keypad);

  return {
    passed,
    close: () => settle(false),
  };
}
