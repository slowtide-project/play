/**
 * The session-setup overlay (FR-1): the one and only route into a child
 * session. The parent chooses the mode and options here, then confirms to start
 * a fresh session (FR-1a). If a session is already running, the parent can also
 * end it from here (FR-45).
 *
 * This is the DOM edge; all clamping and the mode rules live in the pure
 * {@link ./setup-config} module, so the form can only ever hand the engine a
 * valid {@link SessionConfig}.
 */

import { createOverlay, el, PARENT_ROOT_CLASS } from "./overlay.js";
import {
  DURATION_PRESETS_MIN,
  SETUP_BOUNDS,
  toSessionConfig,
  type MenuMode,
  type SetupState,
} from "./setup-config.js";
import type { SessionConfig } from "../engine/index.js";

const TITLE_ID = "st-parent-setup-title";

export type SetupResult =
  | { readonly action: "start"; readonly config: SessionConfig; readonly setup: SetupState }
  | { readonly action: "end" }
  | { readonly action: "changePin" }
  | { readonly action: "cancel" };

export interface SetupContext {
  /** Whether a live/test session is currently running (enables "End"). */
  readonly sessionActive: boolean;
  /**
   * Force the app to the latest deployed build (parent-gated, NFR-7). When
   * provided, a "Check for updates" control and the build stamp are shown.
   */
  readonly onCheckForUpdates?: (() => void) | undefined;
  /**
   * Which tile this setup is for (D-14). It decides the single control shown at
   * the top level: Duration for `wind-down`, Calm level for `infinite`. When
   * omitted (the parent-corner "settings" entry) both are shown, along with test
   * mode under Advanced. Everything not featured here folds under Advanced.
   */
  readonly focus?: MenuMode | undefined;
}

type Mutable = { -readonly [K in keyof SetupState]: SetupState[K] };

const pct = (v: number): string => `${Math.round(v * 100)}%`;

interface Slider {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly setValue: (v: number) => void;
}

/** A labelled range with a live readout and an optional hint line. */
function slider(
  label: string,
  bounds: { min: number; max: number },
  step: number,
  initial: number,
  format: (v: number) => string,
  hint?: string,
): Slider {
  const root = el("div", "st-parent-field");
  const head = el("div", "st-parent-field-head");
  const name = el("label", undefined, label);
  const val = el("span", "st-parent-val", format(initial));
  head.append(name, val);
  const input = el("input");
  input.type = "range";
  input.min = String(bounds.min);
  input.max = String(bounds.max);
  input.step = String(step);
  input.value = String(initial);
  root.append(head, input);
  if (hint !== undefined) root.append(el("p", "st-parent-hint", hint));
  return {
    root,
    input,
    setValue: (v) => {
      input.value = String(v);
      val.textContent = format(v);
    },
  };
}

/**
 * Open the setup overlay. Resolves with the parent's choice: start a fresh
 * session, end the current one, or cancel and leave things unchanged.
 */
export function openSessionSetup(
  host: HTMLElement,
  initial: SetupState,
  context: SetupContext,
): Promise<SetupResult> {
  const overlay = createOverlay(host, TITLE_ID);
  const state: Mutable = { ...initial };
  let settled = false;

  let resolveResult!: (value: SetupResult) => void;
  const result = new Promise<SetupResult>((resolve) => {
    resolveResult = resolve;
  });

  function settle(value: SetupResult): void {
    if (settled) return;
    settled = true;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    resolveResult(value);
  }

  const title = el("h2", undefined, "Start a session");
  title.id = TITLE_ID;
  const sub = el(
    "p",
    "st-parent-sub",
    "Choose how tonight's session runs, then hand the iPad over. The child sees none of this.",
  );

  // ---- Mode ---------------------------------------------------------------
  const modeSeg = el("div", "st-parent-seg");
  const liveBtn = el("button", undefined, "Live");
  const testBtn = el("button", undefined, "Test");
  liveBtn.type = "button";
  testBtn.type = "button";
  modeSeg.append(liveBtn, testBtn);
  const modeField = el("div", "st-parent-field");
  const modeHead = el("div", "st-parent-field-head");
  modeHead.append(el("label", undefined, "Mode"));
  modeField.append(
    modeHead,
    modeSeg,
    el("p", "st-parent-hint", "Live decays to sleep. Test is for daytime trials only."),
  );

  // ---- Duration -----------------------------------------------------------
  const durationSlider = slider(
    "Duration",
    SETUP_BOUNDS.durationMin,
    1,
    state.durationMin,
    (v) => `${Math.round(v)} min`,
  );
  const presetRow = el("div", "st-parent-row");
  for (const min of DURATION_PRESETS_MIN) {
    const btn = el("button", "st-parent-btn", `${min} min`);
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.durationMin = min;
      durationSlider.setValue(min);
    });
    presetRow.append(btn);
  }
  durationSlider.input.addEventListener("input", () => {
    state.durationMin = Math.round(durationSlider.input.valueAsNumber);
    durationSlider.setValue(state.durationMin);
  });
  const durationField = el("div", "st-parent-field");
  durationField.append(durationSlider.root, presetRow);

  // ---- Curve --------------------------------------------------------------
  const startCeiling = slider(
    "Start intensity",
    SETUP_BOUNDS.startCeiling,
    0.01,
    state.startCeiling,
    pct,
    "How lively the session begins. Lower it for a child prone to over-stimulation.",
  );
  startCeiling.input.addEventListener("input", () => {
    state.startCeiling = startCeiling.input.valueAsNumber;
    startCeiling.setValue(state.startCeiling);
  });
  const steepness = slider(
    "Wind-down steepness",
    SETUP_BOUNDS.steepness,
    0.01,
    state.steepness,
    (v) => v.toFixed(2),
    "How quickly it settles through the middle. The start and end never change.",
  );
  steepness.input.addEventListener("input", () => {
    state.steepness = steepness.input.valueAsNumber;
    steepness.setValue(state.steepness);
  });

  // ---- Ceilings -----------------------------------------------------------
  const ceilingSet = el("fieldset", "st-parent-fieldset");
  ceilingSet.append(el("legend", undefined, "Maximum limits (never exceeded)"));
  const volume = slider("Volume", SETUP_BOUNDS.ceiling, 0.01, state.volume, pct);
  const brightness = slider("Brightness", SETUP_BOUNDS.ceiling, 0.01, state.brightness, pct);
  const motion = slider("Motion", SETUP_BOUNDS.ceiling, 0.01, state.motion, pct);
  volume.input.addEventListener("input", () => {
    state.volume = volume.input.valueAsNumber;
    volume.setValue(state.volume);
  });
  brightness.input.addEventListener("input", () => {
    state.brightness = brightness.input.valueAsNumber;
    brightness.setValue(state.brightness);
  });
  motion.input.addEventListener("input", () => {
    state.motion = motion.input.valueAsNumber;
    motion.setValue(state.motion);
  });
  ceilingSet.append(volume.root, brightness.root, motion.root);

  // ---- Infinite mode default ---------------------------------------------
  const infiniteSet = el("fieldset", "st-parent-fieldset");
  infiniteSet.append(el("legend", undefined, "Anytime"));
  const infiniteLevel = slider(
    "Calm level",
    SETUP_BOUNDS.infiniteLevel,
    0.01,
    state.infiniteLevel,
    pct,
    "How lively Anytime runs. It holds steady at this level and never winds down.",
  );
  infiniteLevel.input.addEventListener("input", () => {
    state.infiniteLevel = infiniteLevel.input.valueAsNumber;
    infiniteLevel.setValue(state.infiniteLevel);
  });
  infiniteSet.append(infiniteLevel.root);

  // ---- Test-only controls -------------------------------------------------
  const testSet = el("fieldset", "st-parent-fieldset");
  testSet.append(el("legend", undefined, "Test options (daytime only)"));
  const decayLabel = el("label", "st-parent-check");
  const decayInput = el("input");
  decayInput.type = "checkbox";
  decayInput.checked = state.decayOff;
  decayLabel.append(decayInput, document.createTextNode("Hold steady (no wind-down)"));
  const freezeLabel = el("label", "st-parent-check");
  const freezeInput = el("input");
  freezeInput.type = "checkbox";
  freezeInput.checked = state.freezeOn;
  freezeLabel.append(freezeInput, document.createTextNode("Freeze at a set level"));
  const freezeLevel = slider(
    "Frozen level",
    SETUP_BOUNDS.frozenLevel,
    0.01,
    state.freezeLevel,
    pct,
  );
  decayInput.addEventListener("change", () => {
    state.decayOff = decayInput.checked;
  });
  freezeInput.addEventListener("change", () => {
    state.freezeOn = freezeInput.checked;
    freezeLevel.root.style.display = state.freezeOn ? "" : "none";
  });
  freezeLevel.input.addEventListener("input", () => {
    state.freezeLevel = freezeLevel.input.valueAsNumber;
    freezeLevel.setValue(state.freezeLevel);
  });
  testSet.append(decayLabel, freezeLabel, freezeLevel.root);

  // ---- Mode wiring: show test controls only in test mode ------------------
  function applyMode(): void {
    const isTest = state.mode === "test";
    liveBtn.setAttribute("aria-pressed", String(!isTest));
    testBtn.setAttribute("aria-pressed", String(isTest));
    testSet.style.display = isTest ? "" : "none";
    freezeLevel.root.style.display = isTest && state.freezeOn ? "" : "none";
  }
  liveBtn.addEventListener("click", () => {
    state.mode = "live";
    applyMode();
  });
  testBtn.addEventListener("click", () => {
    state.mode = "test";
    applyMode();
  });

  // ---- Actions ------------------------------------------------------------
  const actions = el("div", "st-parent-actions");
  if (context.sessionActive) {
    const endBtn = el("button", "st-parent-btn is-danger", "End current session");
    endBtn.type = "button";
    endBtn.addEventListener("click", () => settle({ action: "end" }));
    actions.append(endBtn);
  }
  // Change PIN moves under Advanced (below), not the main action row.
  const pinBtn = el("button", "st-parent-btn", "Change PIN");
  pinBtn.type = "button";
  pinBtn.addEventListener("click", () => settle({ action: "changePin" }));
  const cancelBtn = el("button", "st-parent-btn", "Cancel");
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => settle({ action: "cancel" }));
  const startBtn = el("button", "st-parent-btn is-primary", "Start session");
  startBtn.type = "button";
  startBtn.addEventListener("click", () => {
    const snapshot: SetupState = { ...state };
    settle({ action: "start", config: toSessionConfig(snapshot), setup: snapshot });
  });
  actions.append(cancelBtn, startBtn);

  // ---- Footer: build stamp + manual force-update (parent-gated) -----------
  // Lives here, behind the gate, never on the child menu (NFR-7, D-14). The
  // build stamp lets a parent confirm a deploy actually landed; the button is
  // the reliable backup that forces the newest build immediately.
  let footer: HTMLElement | null = null;
  if (context.onCheckForUpdates !== undefined) {
    const forceUpdate = context.onCheckForUpdates;
    footer = el("div", "st-parent-foot");
    footer.append(el("span", "st-parent-build", `Build ${__SLOWTIDE_BUILD_ID__}`));
    const updateBtn = el("button", "st-parent-btn", "Check for updates");
    updateBtn.type = "button";
    updateBtn.addEventListener("click", () => {
      updateBtn.disabled = true;
      updateBtn.textContent = "Updating…";
      forceUpdate();
    });
    footer.append(updateBtn);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") settle({ action: "cancel" });
  }
  document.addEventListener("keydown", onKeydown);

  // ---- Assemble: minimal top level, everything else under Advanced (D-14) --
  // The everyday screen shows only the one control that matters for the tapped
  // tile — Duration for Wind-down, Calm level for Anytime — plus Start. All the
  // tuning, test mode, PIN change and update controls fold under Advanced so a
  // parent is not met with a wall of sliders (NFR-7). Section 7's mitigations
  // (start intensity, steepness, ceilings) and test mode (D-5) still live here,
  // one tap away, never removed. With no focus (the parent-corner settings
  // entry) both everyday controls and test mode are shown.
  const focus = context.focus;
  const showDuration = focus !== "infinite";
  const showCalm = focus !== "wind-down";
  const showCurve = focus !== "infinite";
  const showTest = focus === undefined;

  const advanced = el("details", `${PARENT_ROOT_CLASS}-advanced`);
  advanced.append(el("summary", undefined, "Advanced options"));
  if (showCurve) advanced.append(startCeiling.root, steepness.root);
  advanced.append(ceilingSet);
  if (showTest) advanced.append(modeField, testSet);
  const pinRow = el("div", "st-parent-row");
  pinRow.append(pinBtn);
  advanced.append(pinRow);
  if (footer !== null) advanced.append(footer);

  overlay.card.append(title, sub);
  if (showDuration) overlay.card.append(durationField);
  if (showCalm) overlay.card.append(infiniteSet);
  overlay.card.append(advanced, actions);
  applyMode();

  return result;
}
