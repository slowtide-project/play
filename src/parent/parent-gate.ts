/**
 * The parent gate overlay (FR-29): a code-entry challenge that stands between
 * the child surface and all configuration.
 *
 * A fresh code is shown each time and must be re-entered. A wrong full-length
 * entry regenerates the code and clears the field, so trial-and-error gets no
 * traction. Cancelling (the ✕ or Escape) resolves `false`; a correct code
 * resolves `true`. This is the DOM edge; the code logic is pure and tested in
 * {@link ./parent-gate-challenge}.
 */

import { createOverlay, el } from "./overlay.js";
import {
  isGateAnswerCorrect,
  makeGateChallenge,
  type GateChallenge,
} from "./parent-gate-challenge.js";

const TITLE_ID = "st-parent-gate-title";

export interface ParentGate {
  /** Resolves true when the parent enters the code, false if they cancel. */
  readonly passed: Promise<boolean>;
  /** Dismiss the gate early (resolves the promise as a cancel). */
  close(): void;
}

/**
 * Open the parent gate over `host`. `rng` is injectable for deterministic
 * tests; it defaults to `Math.random`.
 */
export function openParentGate(host: HTMLElement, rng: () => number = Math.random): ParentGate {
  const overlay = createOverlay(host, TITLE_ID);
  let challenge: GateChallenge = makeGateChallenge(rng);
  let entered = "";
  let settled = false;

  const title = el("h2", undefined, "Parent access");
  title.id = TITLE_ID;
  const sub = el(
    "p",
    "st-parent-sub",
    "Enter the code below to reach the settings. A new code is shown each time.",
  );

  const codeRow = el("div", "st-parent-code");
  const entryRow = el("div", "st-parent-entry");

  function renderCode(): void {
    codeRow.replaceChildren(...[...challenge.code].map((d) => el("span", undefined, d)));
  }

  function renderEntry(): void {
    entryRow.textContent = "•".repeat(entered.length).padEnd(challenge.code.length, "·");
  }

  function reject(): void {
    entryRow.classList.add("is-wrong");
    window.setTimeout(() => entryRow.classList.remove("is-wrong"), 300);
    challenge = makeGateChallenge(rng);
    entered = "";
    renderCode();
    renderEntry();
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

  function press(digit: string): void {
    if (settled || entered.length >= challenge.code.length) return;
    entered += digit;
    renderEntry();
    if (entered.length < challenge.code.length) return;
    if (isGateAnswerCorrect(challenge, entered)) settle(true);
    else reject();
  }

  function backspace(): void {
    entered = entered.slice(0, -1);
    renderEntry();
  }

  // ---- Keypad -------------------------------------------------------------
  const keypad = el("div", "st-parent-keypad");
  const digitButtons: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (const d of digitButtons) {
    const btn = el("button", undefined, d);
    btn.type = "button";
    btn.addEventListener("click", () => press(d));
    keypad.append(btn);
  }
  const backBtn = el("button", undefined, "⌫");
  backBtn.type = "button";
  backBtn.setAttribute("aria-label", "Delete");
  backBtn.addEventListener("click", () => backspace());
  const zeroBtn = el("button", undefined, "0");
  zeroBtn.type = "button";
  zeroBtn.addEventListener("click", () => press("0"));
  const cancelBtn = el("button", undefined, "✕");
  cancelBtn.type = "button";
  cancelBtn.setAttribute("aria-label", "Cancel");
  cancelBtn.addEventListener("click", () => settle(false));
  keypad.append(backBtn, zeroBtn, cancelBtn);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key >= "0" && event.key <= "9") press(event.key);
    else if (event.key === "Backspace") backspace();
    else if (event.key === "Escape") settle(false);
  }
  document.addEventListener("keydown", onKeydown);

  renderCode();
  renderEntry();
  overlay.card.append(title, sub, codeRow, entryRow, keypad);

  return {
    passed,
    close: () => settle(false),
  };
}
