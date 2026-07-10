/**
 * Developer-only visualisation for tuning and debugging the arousal-budget
 * engine at http://localhost:5173. This is NOT the child-facing UI: it is
 * allowed to show clocks, numbers, phase labels, and controls that the child
 * surface (NFR-1) must never show.
 *
 * It reads from the pure engine via {@link createSimulation} and never mutates
 * engine behaviour. It is the impure edge (DOM, canvas, requestAnimationFrame)
 * and is mounted only in the dev build (see app.ts), so it cannot ship to the
 * child surface.
 */

import {
  DEFAULT_DEV_CONFIG,
  createSimulation,
  toSessionConfig,
  type DevConfig,
  type Sample,
  type Simulation,
} from "./simulation.js";
import type { EngineState, LeverValues } from "../engine/index.js";

/** Which parent ceiling clips a lever, or null if the lever is uncapped. */
type CeilingKey = "volume" | "brightness" | "motion" | "reward" | null;

interface LeverMeta {
  readonly key: keyof LeverValues;
  readonly label: string;
  readonly ceiling: CeilingKey;
}

/** Levers in display order, tagged with the ceiling that clips each (Section 4). */
const LEVER_META: readonly LeverMeta[] = [
  { key: "animationSpeed", label: "Animation speed", ceiling: "motion" },
  { key: "colourSaturation", label: "Colour saturation", ceiling: null },
  { key: "brightness", label: "Brightness / warmth", ceiling: "brightness" },
  { key: "audioTempo", label: "Audio tempo", ceiling: null },
  { key: "audioVolume", label: "Audio volume", ceiling: "volume" },
  { key: "interactionFrequency", label: "Interaction frequency", ceiling: null },
  { key: "rewardIntensity", label: "Reward intensity", ceiling: "reward" },
  { key: "contentNovelty", label: "Content novelty", ceiling: null },
];

/** Internal phase bands, for shading the plot (dev-only; never shown to child). */
const PHASES: readonly { readonly label: string; readonly from: number; readonly to: number }[] = [
  { label: "Engage", from: 0, to: 0.2 },
  { label: "Settle", from: 0.2, to: 0.55 },
  { label: "Drift", from: 0.55, to: 0.9 },
  { label: "Land", from: 0.9, to: 1 },
];

const CURVE_SAMPLES = 240;
const ROOT_ID = "slowtide-dev-view";

/** A locally-mutable working copy of the (readonly) dev config. */
type MutableDevConfig = { -readonly [K in keyof DevConfig]: DevConfig[K] };

/** Preset "full-sweep" playback durations, in seconds. */
const SWEEP_OPTIONS: readonly number[] = [15, 30, 60];

/** Format progress-into-session as mm:ss against the chosen duration. */
function formatClock(progress: number, durationMin: number): string {
  const totalSeconds = Math.round(progress * durationMin * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

/** Resolve the numeric ceiling that applies to a lever for the given config. */
function ceilingValue(kind: CeilingKey, c: DevConfig): number {
  switch (kind) {
    case "volume":
      return c.volume;
    case "brightness":
      return c.brightness;
    case "motion":
      return c.motion;
    case "reward":
      return Math.min(c.volume, c.motion);
    case null:
      return 1;
  }
}

/** Create an element with a class and optional text. */
function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface RangeRow {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly value: HTMLElement;
}

/** Build a labelled range slider with a live numeric readout. */
function rangeRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
): RangeRow {
  const root = make("label", "st-dev-row");
  const head = make("span", "st-dev-row-head");
  const name = make("span", "st-dev-row-label", label);
  const value = make("span", "st-dev-row-value", initial.toFixed(2));
  head.append(name, value);
  const input = make("input", "st-dev-slider");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  root.append(head, input);
  return { root, input, value };
}

interface LeverRow {
  readonly fill: HTMLElement;
  readonly clip: HTMLElement;
  readonly tick: HTMLElement;
  readonly value: HTMLElement;
}

/** Build one lever bar: a filled track, a clipped overlay, and a ceiling tick. */
function leverRow(meta: LeverMeta): { root: HTMLElement; row: LeverRow } {
  const root = make("div", "st-dev-lever");
  const head = make("div", "st-dev-lever-head");
  const label = make("span", "st-dev-lever-label", meta.label);
  const value = make("span", "st-dev-lever-value", "0.00");
  head.append(label, value);
  const track = make("div", "st-dev-track");
  const fill = make("div", "st-dev-fill");
  const clip = make("div", "st-dev-clip");
  const tick = make("div", "st-dev-tick");
  if (meta.ceiling === null) tick.style.display = "none";
  track.append(fill, clip, tick);
  root.append(head, track);
  return { root, row: { fill, clip, tick, value } };
}

const STYLE = `
#${ROOT_ID} {
  position: fixed; inset: 0; display: flex; gap: 16px; padding: 16px;
  box-sizing: border-box; overflow: auto; background: #0b0d1a; color: #e7ecf5;
  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#${ROOT_ID} h1 { font-size: 15px; margin: 0 0 4px; letter-spacing: 0.04em; }
#${ROOT_ID} .st-dev-note { color: #8a94ad; font-size: 11px; margin: 0 0 12px; }
#${ROOT_ID} .st-dev-panel {
  width: 320px; flex: 0 0 320px; display: flex; flex-direction: column; gap: 10px;
}
#${ROOT_ID} .st-dev-main { flex: 1 1 auto; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
#${ROOT_ID} fieldset { border: 1px solid #232a3f; border-radius: 8px; margin: 0; padding: 10px 12px 12px; }
#${ROOT_ID} legend { color: #9fb0d0; padding: 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
#${ROOT_ID} .st-dev-row { display: block; margin: 8px 0 0; }
#${ROOT_ID} .st-dev-row-head { display: flex; justify-content: space-between; }
#${ROOT_ID} .st-dev-row-value { color: #7fd1ff; }
#${ROOT_ID} .st-dev-slider { width: 100%; margin: 4px 0 0; accent-color: #7fd1ff; }
#${ROOT_ID} .st-dev-presets { display: flex; gap: 6px; margin-top: 6px; }
#${ROOT_ID} button, #${ROOT_ID} select {
  background: #1a2136; color: #e7ecf5; border: 1px solid #2d3653; border-radius: 6px;
  padding: 4px 10px; font: inherit; cursor: pointer;
}
#${ROOT_ID} button:hover, #${ROOT_ID} select:hover { border-color: #7fd1ff; }
#${ROOT_ID} .st-dev-check { display: flex; align-items: center; gap: 8px; margin-top: 8px; cursor: pointer; }
#${ROOT_ID} .st-dev-check input { accent-color: #7fd1ff; }
#${ROOT_ID} canvas { width: 100%; height: 260px; display: block; background: #10142a; border-radius: 8px; }
#${ROOT_ID} .st-dev-transport { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
#${ROOT_ID} .st-dev-transport input[type=range] { flex: 1 1 200px; accent-color: #7fd1ff; }
#${ROOT_ID} .st-dev-readout { display: flex; gap: 18px; flex-wrap: wrap; color: #9fb0d0; }
#${ROOT_ID} .st-dev-readout b { color: #e7ecf5; font-weight: 600; }
#${ROOT_ID} .st-dev-levers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
#${ROOT_ID} .st-dev-lever-head { display: flex; justify-content: space-between; }
#${ROOT_ID} .st-dev-lever-value { color: #7fd1ff; }
#${ROOT_ID} .st-dev-track { position: relative; height: 12px; margin-top: 3px; background: #1a2136; border-radius: 6px; overflow: hidden; }
#${ROOT_ID} .st-dev-fill { position: absolute; inset: 0 auto 0 0; width: 0; background: #7fd1ff; }
#${ROOT_ID} .st-dev-clip { position: absolute; top: 0; bottom: 0; width: 0; background: repeating-linear-gradient(45deg, #f2a03d55, #f2a03d55 4px, transparent 4px, transparent 8px); }
#${ROOT_ID} .st-dev-tick { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #f2a03d; }
`;

/**
 * Mount the developer visualisation into `root`. Idempotent: mounting again
 * removes any previous instance first. Returns a teardown function.
 */
export function mountDevView(root: HTMLElement): () => void {
  document.getElementById(ROOT_ID)?.remove();

  const cfg: MutableDevConfig = { ...DEFAULT_DEV_CONFIG };
  let progress = 0;
  let sweepSeconds = 30;
  let playing = false;
  let rafId = 0;
  let lastTs = 0;
  let sim: Simulation = createSimulation(toSessionConfig(cfg));
  let curve: Sample[] = sim.sampleCurve(CURVE_SAMPLES);

  const style = make("style", "");
  style.textContent = STYLE;

  const container = make("div", "");
  container.id = ROOT_ID;

  // ---- Controls panel -----------------------------------------------------
  const panel = make("aside", "st-dev-panel");
  const title = make("h1", "", "Slowtide — engine dev view");
  const note = make(
    "p",
    "st-dev-note",
    "Developer tuning tool. Shows clocks and numbers the child UI never does.",
  );
  panel.append(title, note);

  const sessionSet = make("fieldset", "");
  sessionSet.append(make("legend", "", "Session"));
  const durationRow = rangeRow("Duration (min)", 1, 180, 1, cfg.durationMin);
  durationRow.value.textContent = String(cfg.durationMin);
  const presets = make("div", "st-dev-presets");
  const preset60 = make("button", "", "60 min");
  const preset90 = make("button", "", "90 min");
  presets.append(preset60, preset90);
  const startCeilingRow = rangeRow("Start ceiling", 0, 1, 0.01, cfg.startCeiling);
  const steepnessRow = rangeRow("Steepness", 0.6, 1.6, 0.01, cfg.steepness);
  sessionSet.append(durationRow.root, presets, startCeilingRow.root, steepnessRow.root);

  const ceilingSet = make("fieldset", "");
  ceilingSet.append(make("legend", "", "Parent ceilings"));
  const volumeRow = rangeRow("Volume", 0, 1, 0.01, cfg.volume);
  const brightnessRow = rangeRow("Brightness", 0, 1, 0.01, cfg.brightness);
  const motionRow = rangeRow("Motion", 0, 1, 0.01, cfg.motion);
  ceilingSet.append(volumeRow.root, brightnessRow.root, motionRow.root);

  const testSet = make("fieldset", "");
  testSet.append(make("legend", "", "Test mode"));
  const decayLabel = make("label", "st-dev-check");
  const decayInput = make("input", "");
  decayInput.type = "checkbox";
  decayLabel.append(decayInput, document.createTextNode("Decay off (hold high)"));
  const freezeLabel = make("label", "st-dev-check");
  const freezeInput = make("input", "");
  freezeInput.type = "checkbox";
  freezeLabel.append(freezeInput, document.createTextNode("Freeze level"));
  const freezeRow = rangeRow("Frozen at", 0, 1, 0.01, cfg.freezeLevel);
  testSet.append(decayLabel, freezeLabel, freezeRow.root);

  panel.append(sessionSet, ceilingSet, testSet);

  // ---- Main area ----------------------------------------------------------
  const main = make("div", "st-dev-main");
  const canvas = make("canvas", "");
  const ctx = canvas.getContext("2d");

  const transport = make("div", "st-dev-transport");
  const playBtn = make("button", "", "▶ Play");
  const scrubber = make("input", "");
  scrubber.type = "range";
  scrubber.min = "0";
  scrubber.max = "1";
  scrubber.step = "0.001";
  scrubber.value = "0";
  const sweepSelect = make("select", "");
  for (const s of SWEEP_OPTIONS) {
    const opt = make("option", "", `sweep ${s}s`);
    opt.value = String(s);
    if (s === sweepSeconds) opt.selected = true;
    sweepSelect.append(opt);
  }
  transport.append(playBtn, scrubber, sweepSelect);

  const readout = make("div", "st-dev-readout");
  const clockOut = make("span", "");
  const progressOut = make("span", "");
  const statusOut = make("span", "");
  const phaseOut = make("span", "");
  const budgetOut = make("span", "");
  readout.append(clockOut, progressOut, statusOut, phaseOut, budgetOut);

  const leverGrid = make("div", "st-dev-levers");
  const leverRows = new Map<keyof LeverValues, LeverRow>();
  for (const meta of LEVER_META) {
    const { root: rowRoot, row } = leverRow(meta);
    leverRows.set(meta.key, row);
    leverGrid.append(rowRoot);
  }

  main.append(canvas, transport, readout, leverGrid);
  container.append(panel, main);
  root.append(style, container);

  // ---- Rendering ----------------------------------------------------------
  function drawPlot(state: EngineState): void {
    if (ctx === null) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 40;
    const padR = 12;
    const padT = 16;
    const padB = 22;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const xAt = (p: number): number => padL + p * plotW;
    const yAt = (b: number): number => padT + (1 - b) * plotH;

    // Phase bands.
    for (let i = 0; i < PHASES.length; i++) {
      const phase = PHASES[i];
      if (phase === undefined) continue;
      ctx.fillStyle = i % 2 === 0 ? "#141a33" : "#171e3a";
      ctx.fillRect(xAt(phase.from), padT, (phase.to - phase.from) * plotW, plotH);
      ctx.fillStyle = "#5a668a";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(phase.label, xAt(phase.from) + 4, padT + 11);
    }

    // Gridlines at budget 0.25 / 0.5 / 0.75.
    ctx.strokeStyle = "#232a45";
    ctx.fillStyle = "#5a668a";
    ctx.lineWidth = 1;
    for (const b of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(padL, yAt(b));
      ctx.lineTo(padL + plotW, yAt(b));
      ctx.stroke();
      ctx.fillText(b.toFixed(2), 6, yAt(b) + 3);
    }

    // Budget curve.
    ctx.strokeStyle = "#7fd1ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < curve.length; i++) {
      const point = curve[i];
      if (point === undefined) continue;
      const x = xAt(point.progress);
      const y = yAt(point.budget);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current-position marker.
    const mx = xAt(progress);
    ctx.strokeStyle = "#f2a03d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = "#f2a03d";
    ctx.beginPath();
    ctx.arc(mx, yAt(state.budget), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateLevers(capped: LeverValues, uncapped: LeverValues): void {
    for (const meta of LEVER_META) {
      const row = leverRows.get(meta.key);
      if (row === undefined) continue;
      const cappedValue = capped[meta.key];
      const rawValue = uncapped[meta.key];
      row.fill.style.width = `${(cappedValue * 100).toFixed(1)}%`;
      const clipped = rawValue - cappedValue;
      if (clipped > 0.001) {
        row.clip.style.left = `${(cappedValue * 100).toFixed(1)}%`;
        row.clip.style.width = `${(clipped * 100).toFixed(1)}%`;
      } else {
        row.clip.style.width = "0";
      }
      if (meta.ceiling !== null) {
        row.tick.style.left = `${(ceilingValue(meta.ceiling, cfg) * 100).toFixed(1)}%`;
      }
      row.value.textContent =
        clipped > 0.001
          ? `${cappedValue.toFixed(2)} ↓ ${rawValue.toFixed(2)}`
          : cappedValue.toFixed(2);
    }
  }

  function update(): void {
    const state = sim.stateAt(progress);
    drawPlot(state);
    updateLevers(state.levers, sim.uncappedLeversAt(progress));
    clockOut.innerHTML = `clock <b>${formatClock(progress, cfg.durationMin)}</b> / ${formatClock(1, cfg.durationMin)}`;
    progressOut.innerHTML = `progress <b>${(progress * 100).toFixed(1)}%</b>`;
    statusOut.innerHTML = `status <b>${state.status}</b>`;
    phaseOut.innerHTML = `phase <b>${state.phase ?? "—"}</b>`;
    budgetOut.innerHTML = `budget <b>${state.budget.toFixed(3)}</b>`;
  }

  function rebuild(): void {
    sim = createSimulation(toSessionConfig(cfg));
    curve = sim.sampleCurve(CURVE_SAMPLES);
    update();
  }

  // ---- Playback loop ------------------------------------------------------
  function stop(): void {
    playing = false;
    playBtn.textContent = "▶ Play";
    if (rafId !== 0) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function tick(ts: number): void {
    if (!playing) return;
    if (lastTs === 0) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    progress = Math.min(1, progress + dt / 1000 / sweepSeconds);
    scrubber.value = String(progress);
    update();
    if (progress >= 1) {
      stop();
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function play(): void {
    if (progress >= 1) progress = 0;
    playing = true;
    lastTs = 0;
    playBtn.textContent = "⏸ Pause";
    rafId = window.requestAnimationFrame(tick);
  }

  // ---- Wiring -------------------------------------------------------------
  function setDuration(minutes: number): void {
    cfg.durationMin = minutes;
    durationRow.input.value = String(minutes);
    durationRow.value.textContent = String(minutes);
    rebuild();
  }

  durationRow.input.addEventListener("input", () => {
    setDuration(Math.round(durationRow.input.valueAsNumber));
  });
  preset60.addEventListener("click", () => setDuration(60));
  preset90.addEventListener("click", () => setDuration(90));

  function bindCeiling(row: RangeRow, apply: (v: number) => void): void {
    row.input.addEventListener("input", () => {
      const v = row.input.valueAsNumber;
      row.value.textContent = v.toFixed(2);
      apply(v);
      rebuild();
    });
  }

  bindCeiling(startCeilingRow, (v) => {
    cfg.startCeiling = v;
  });
  bindCeiling(steepnessRow, (v) => {
    cfg.steepness = v;
  });
  bindCeiling(volumeRow, (v) => {
    cfg.volume = v;
  });
  bindCeiling(brightnessRow, (v) => {
    cfg.brightness = v;
  });
  bindCeiling(motionRow, (v) => {
    cfg.motion = v;
  });
  bindCeiling(freezeRow, (v) => {
    cfg.freezeLevel = v;
  });

  decayInput.addEventListener("change", () => {
    cfg.testDecayOff = decayInput.checked;
    rebuild();
  });
  freezeInput.addEventListener("change", () => {
    cfg.freezeOn = freezeInput.checked;
    rebuild();
  });

  scrubber.addEventListener("input", () => {
    progress = scrubber.valueAsNumber;
    update();
  });
  playBtn.addEventListener("click", () => (playing ? stop() : play()));
  sweepSelect.addEventListener("change", () => {
    const parsed = Number(sweepSelect.value);
    if (Number.isFinite(parsed) && parsed > 0) sweepSeconds = parsed;
  });

  const onResize = (): void => update();
  window.addEventListener("resize", onResize);

  update();

  return () => {
    stop();
    window.removeEventListener("resize", onResize);
    container.remove();
    style.remove();
  };
}
