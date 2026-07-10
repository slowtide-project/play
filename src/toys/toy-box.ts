/**
 * The toy box: the single {@link Toy} the surface runs. It hosts the worlds and
 * switches between them (D-1, FR-16, FR-25).
 *
 * With a single world it opens straight into it, with no menu and no home
 * pebble. Once there is more than one world it shows a chooser first and a soft
 * four-dot "home" pebble (top-left) to return to it. All worlds read the same
 * budget, so the whole box winds down together.
 */

import type { Toy, ToyFrame, ToyPointer } from "../render/index.js";
import { createMenu, type WorldEntry } from "./menu.js";
import { createForestWorld } from "./forest-world.js";

/** A pine emblem for the forest tile (only shown once there are 2+ worlds). */
function forestEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const s = r * 0.6;
  ctx.fillStyle = "#f2f4ee";
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx - s * 0.6, cy + s * 0.5);
  ctx.lineTo(cx + s * 0.6, cy + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - s * 0.08, cy + s * 0.5, s * 0.16, s * 0.3);
}

const WORLDS: readonly WorldEntry[] = [
  {
    id: "forest",
    label: "Forest",
    tile: [92, 118, 110],
    emblem: forestEmblem,
    make: createForestWorld,
  },
];

const HOME_R = 30;
const HOME_C = 46;
const HAS_MENU = WORLDS.length > 1;

function drawHome(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(247,244,238,0.92)";
  ctx.beginPath();
  ctx.arc(HOME_C, HOME_C, HOME_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const dot = HOME_R * 0.24;
  const off = HOME_R * 0.34;
  const colours = ["#e2624a", "#f2c14e", "#f2c14e", "#4a90d9"];
  const spots = [
    [-off, -off],
    [off, -off],
    [-off, off],
    [off, off],
  ] as const;
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    if (spot === undefined) continue;
    ctx.fillStyle = colours[i] ?? "#333";
    ctx.beginPath();
    ctx.arc(HOME_C + spot[0], HOME_C + spot[1], dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createToyBox(): Toy {
  let width = 0;
  let height = 0;
  let current = "menu";
  let active: Toy | null = null;

  function open(id: string): void {
    const entry = WORLDS.find((w) => w.id === id);
    if (entry === undefined) return;
    active = entry.make();
    active.init(width, height);
    current = id;
  }

  const menu = createMenu(WORLDS, open);
  const first = WORLDS[0];

  function reset(): void {
    if (!HAS_MENU && first !== undefined) {
      open(first.id);
    } else {
      active = null;
      current = "menu";
      menu.init(width, height);
    }
  }

  return {
    id: "toy-box",
    init(w, h) {
      width = w;
      height = h;
      reset();
    },
    resize(w, h) {
      width = w;
      height = h;
      menu.resize(w, h);
      active?.resize(w, h);
    },
    pointer(pointer: ToyPointer) {
      if (current === "menu") {
        menu.pointer(pointer);
        return;
      }
      if (HAS_MENU && pointer.type === "down") {
        const dx = pointer.x - HOME_C;
        const dy = pointer.y - HOME_C;
        if (dx * dx + dy * dy <= (HOME_R + 6) * (HOME_R + 6)) {
          active = null;
          current = "menu";
          menu.init(width, height);
          return;
        }
      }
      active?.pointer(pointer);
    },
    draw(frame: ToyFrame) {
      width = frame.width;
      height = frame.height;
      if (current === "menu" || active === null) {
        menu.draw(frame);
        return;
      }
      active.draw(frame);
      if (HAS_MENU) drawHome(frame.ctx);
    },
  };
}
