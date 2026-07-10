/**
 * The toy-box menu: a scatter of big, tappable circular tiles, one per world
 * (FR-16, the "channel" chooser). No scrolling feed, no search, no reading
 * required; just large, colourful targets a child can pick from.
 *
 * This is a DOM/canvas edge. It draws into the shared surface canvas and calls
 * back when a tile is chosen; the toy box owns which world that opens.
 */

import type { Toy, ToyFrame, ToyPointer } from "../render/index.js";
import { css, type Rgb } from "./colour.js";

/** One entry in the toy box: a world and how its tile looks. */
export interface WorldEntry {
  readonly id: string;
  readonly label: string;
  readonly tile: Rgb;
  /** Draw the tile emblem, centred at (cx, cy) within radius r. */
  readonly emblem: (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;
  /** Build a fresh instance of the world. */
  readonly make: () => Toy;
}

interface TilePos {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** Lay tiles out in a centred grid with a gentle scatter, so it feels playful. */
function layout(width: number, height: number, count: number): TilePos[] {
  const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const r = Math.max(48, Math.min(width / (cols + 1), height / (rows + 1)) * 0.42);
  const gapX = width / (cols + 1);
  const gapY = height / (rows + 1);
  const out: TilePos[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitter = Math.sin(i * 2.4) * r * 0.14;
    out.push({ cx: gapX * (col + 1), cy: gapY * (row + 1) + jitter, r });
  }
  return out;
}

export function createMenu(worlds: readonly WorldEntry[], onSelect: (id: string) => void): Toy {
  let width = 0;
  let height = 0;

  function tiles(): TilePos[] {
    return layout(width, height, worlds.length);
  }

  function drawTile(ctx: CanvasRenderingContext2D, entry: WorldEntry, pos: TilePos): void {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = pos.r * 0.3;
    ctx.shadowOffsetY = pos.r * 0.08;
    ctx.fillStyle = css(entry.tile);
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, pos.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    entry.emblem(ctx, pos.cx, pos.cy, pos.r);

    ctx.fillStyle = "rgba(231,236,245,0.8)";
    ctx.font = `${Math.round(pos.r * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entry.label, pos.cx, pos.cy + pos.r * 1.28);
  }

  return {
    id: "menu",
    init(w, h) {
      width = w;
      height = h;
    },
    resize(w, h) {
      width = w;
      height = h;
    },
    pointer(pointer: ToyPointer) {
      if (pointer.type !== "down") return;
      const positions = tiles();
      for (let i = 0; i < worlds.length; i++) {
        const pos = positions[i];
        const entry = worlds[i];
        if (pos === undefined || entry === undefined) continue;
        const dx = pointer.x - pos.cx;
        const dy = pointer.y - pos.cy;
        if (dx * dx + dy * dy <= pos.r * pos.r) {
          onSelect(entry.id);
          return;
        }
      }
    },
    draw(frame: ToyFrame) {
      width = frame.width;
      height = frame.height;
      const { ctx } = frame;
      const dim = 0.6 + 0.4 * frame.budget;
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, css([30, 26, 44], dim));
      bg.addColorStop(1, css([16, 14, 26], dim));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      const positions = tiles();
      for (let i = 0; i < worlds.length; i++) {
        const pos = positions[i];
        const entry = worlds[i];
        if (pos !== undefined && entry !== undefined) drawTile(ctx, entry, pos);
      }
    },
  };
}
