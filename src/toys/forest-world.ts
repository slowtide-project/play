/**
 * The forest world: a calm, muted landscape you can walk through and pan across
 * (D-1, FR-23a/24/25). It is a shallow 2.5D scene — a camera with a lateral
 * position and a depth into the woods. Dragging sideways pans; dragging up and
 * down walks forward and back. The scene also ambles gently forward on its own,
 * so there is always a soft sense of journeying.
 *
 * Trees live on a deterministic, endless grid: only those near the camera are
 * drawn, projected far-to-near with distance haze, so the forest never seams
 * and never ends (see the perspective helpers in {@link ./landscape-model}).
 *
 * Everything reads its pace and light from the budget (FR-8, FR-24): the auto
 * amble, the sway, and all motion slow and stop as the session winds down,
 * while the whole scene drifts from hazy day, through sunset, to moonlit night.
 * Forward motion is deliberately slow and gentle, and honours reduced motion,
 * since optical flow toward the viewer must never be over-stimulating (NFR-5).
 */

import type { Toy, ToyFrame, ToyPointer } from "../render/index.js";
import {
  CAM_FAR,
  CAM_NEAR,
  atmosphere,
  css,
  depthHaze,
  groundYAtDepth,
  hash,
  mix,
  perspectiveScale,
  type Atmosphere,
  type Rgb,
} from "./landscape-model.js";

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  life: number;
}
interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

const DRAG_THRESHOLD = 8;
const MAX_BIRDS = 10;
const MAX_FIREFLIES = 40;

/** Tree grid spacing and height, in world units. Trees are tall so that, up
 * close, they tower past the top of the screen and you see mostly trunk. */
const CELL = 1.2;
const TREE_H = 2.6;
/** Fraction of grid cells that hold a tree. Fixed per world cell (not relative
 * to the camera) so trees never wink in or out as you walk. */
const TREE_DENSITY = 0.85;
/** Gentle self-propelled forward amble, world units per second at full budget. */
const AUTO_WALK = 0.25;
/** How far a vertical drag walks, world units per pixel. */
const WALK_PER_PX = 0.02;

/** Undergrowth (ferns/tufts) grid, near the walker so it streams past underfoot. */
const UNDER_CELL = 0.7;
const UNDER_FAR = 9;
const UNDER_DENSITY = 0.62;
/** Dappled light patches on the ground (day only). */
const DAPPLE_CELL = 1.5;
const DAPPLE_FAR = 9;
/** Drifting motes in the air. */
const MOTE_COUNT = 26;

export function createForestWorld(): Toy {
  let width = 0;
  let height = 0;
  let time = 0;
  let camX = 0;
  let camDepth = 0;
  let velX = 0;
  let velDepth = 0;
  let lastTimeOfDay = 1;

  let pressed = false;
  let moved = false;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;

  let birds: Bird[] = [];
  let fireflies: Firefly[] = [];
  let motes: { x: number; y: number; z: number; phase: number }[] = [];
  let focusX = 0;
  let focusY = 0;

  const horizon = (): number => height * 0.52;
  const focal = (): number => width * 0.6;
  const spread = (): number => height * 0.6;
  /** World units per screen pixel for panning, referenced to a mid depth. */
  const panRef = (): number => perspectiveScale(4, focal());

  function hh(ix: number, iz: number, salt: number): number {
    return hash(ix * 127.1 + iz * 311.7 + salt * 57.3);
  }

  // ---- scenery ------------------------------------------------------------
  /** How far sky and ground overdraw past the frame edges, so the walking bob
   * (which translates the whole scene) can never expose a stale strip. */
  const edgeOver = (): number => height * 0.03;

  function drawSky(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    const over = edgeOver();
    const g = ctx.createLinearGradient(0, 0, 0, horizon());
    g.addColorStop(0, css(at.skyTop));
    g.addColorStop(1, css(at.skyBottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, -over, width, horizon() + over + 1);
  }

  function drawStars(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    if (at.starAlpha < 0.02) return;
    const off = camX * 6;
    for (let i = 0; i < 140; i++) {
      const sx = (((hash(i) * width * 2 - off) % (width + 40)) + width + 40) % (width + 40);
      const sy = hash(i * 3.1) * horizon() * 0.62;
      const tw = 0.6 + 0.4 * Math.sin(time * 0.001 + i);
      ctx.fillStyle = css([245, 246, 255], at.starAlpha * tw);
      ctx.beginPath();
      ctx.arc(sx, sy, hash(i * 7.7) > 0.85 ? 1.8 : 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCelestial(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    const cx = width * 0.76 - camX * 4;
    const cy = at.celestialY * horizon();
    const r = Math.min(width, height) * 0.06;
    if (at.moonGlow > 0.02) {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 6);
      glow.addColorStop(0, css(at.celestialColour, 0.5 * at.moonGlow));
      glow.addColorStop(1, css(at.celestialColour, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, horizon());
    }
    ctx.fillStyle = css(at.celestialColour, at.isMoon ? 1 : 0.85);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    const bands = [
      {
        colour: at.hillFar,
        par: 12,
        base: horizon() - height * 0.05,
        amp: height * 0.02,
        fr: 0.004,
      },
      {
        colour: at.hillNear,
        par: 30,
        base: horizon() - height * 0.01,
        amp: height * 0.03,
        fr: 0.006,
      },
    ];
    for (const b of bands) {
      const off = camX * b.par;
      ctx.fillStyle = css(b.colour);
      ctx.beginPath();
      ctx.moveTo(0, horizon());
      for (let x = 0; x <= width; x += 8) {
        const y =
          b.base +
          Math.sin((x + off) * b.fr) * b.amp +
          Math.sin((x + off) * b.fr * 0.37) * b.amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, horizon());
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Per-tree shape variation, derived from stable hashes so it never flickers. */
  interface TreeShape {
    /** "fir" (tiered conifer) or "round" (broadleaf blob). */
    readonly round: boolean;
    /** Number of drooping tiers for a fir. */
    readonly tiers: number;
    /** Crown width multiplier: slender to broad. */
    readonly widthMul: number;
    /** Fraction of height that is bare trunk. */
    readonly trunkFrac: number;
  }

  function drawTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    baseY: number,
    h: number,
    foliage: Rgb,
    trunk: Rgb,
    shape: TreeShape,
  ): void {
    if (h < 3) {
      // Distant tiny trees: cheap flat shapes, no shading.
      ctx.fillStyle = css(foliage);
      ctx.beginPath();
      if (shape.round) {
        ctx.arc(x, baseY - h * 0.5, h * 0.4, 0, Math.PI * 2);
      } else {
        ctx.moveTo(x, baseY - h);
        ctx.lineTo(x - h * 0.28, baseY);
        ctx.lineTo(x + h * 0.28, baseY);
        ctx.closePath();
      }
      ctx.fill();
      return;
    }
    const foliageBottom = baseY - h * shape.trunkFrac;
    const topY = baseY - h;
    const span = foliageBottom - topY;

    // Trunk: tapered (wider at the base), lit from the left and shaded right so
    // it reads as round, with a couple of faint bark streaks.
    const baseW = Math.max(2, h * 0.055);
    const topW = baseW * 0.6;
    const tg = ctx.createLinearGradient(x - baseW, 0, x + baseW, 0);
    tg.addColorStop(0, css(mix(trunk, [255, 244, 224], 0.22)));
    tg.addColorStop(0.5, css(trunk));
    tg.addColorStop(1, css(mix(trunk, [0, 0, 0], 0.38)));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(x - baseW / 2, baseY);
    ctx.lineTo(x - topW / 2, foliageBottom);
    ctx.lineTo(x + topW / 2, foliageBottom);
    ctx.lineTo(x + baseW / 2, baseY);
    ctx.closePath();
    ctx.fill();
    if (baseW > 6) {
      ctx.strokeStyle = css(mix(trunk, [0, 0, 0], 0.4), 0.5);
      ctx.lineWidth = Math.max(1, baseW * 0.08);
      ctx.lineCap = "round";
      for (const o of [-0.18, 0.12]) {
        ctx.beginPath();
        ctx.moveTo(x + baseW * o, baseY - baseW * 0.4);
        ctx.lineTo(x + baseW * o * 0.7, foliageBottom + baseW * 0.4);
        ctx.stroke();
      }
    }

    if (shape.round) {
      // Broadleaf: a soft clump of blobs, lit from the upper-left. The lowest
      // blob sits at the trunk top so the crown always meets its trunk rather
      // than stopping short and leaving a bare, detached-looking column.
      const r = h * 0.2 * shape.widthMul;
      const rg = ctx.createRadialGradient(
        x - r * 0.4,
        topY + span * 0.3,
        r * 0.2,
        x,
        topY + span * 0.5,
        r * 1.7,
      );
      rg.addColorStop(0, css(mix(foliage, [255, 255, 235], 0.2)));
      rg.addColorStop(1, css(mix(foliage, [0, 0, 0], 0.14)));
      ctx.fillStyle = rg;
      const blobs = [
        [0, span * 0.18, r],
        [-r * 0.7, span * 0.42, r * 0.85],
        [r * 0.7, span * 0.42, r * 0.85],
        [-r * 0.4, span * 0.68, r * 0.85],
        [r * 0.4, span * 0.68, r * 0.85],
        [0, span * 0.52, r * 1.05],
        [0, span * 0.9, r * 0.95],
      ] as const;
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.ellipse(x + bx, topY + by, br, br * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Fir: drooping tiers, with the crown lit lighter at the top.
    const cg = ctx.createLinearGradient(0, topY, 0, foliageBottom);
    cg.addColorStop(0, css(mix(foliage, [255, 255, 235], 0.16)));
    cg.addColorStop(1, css(mix(foliage, [0, 0, 0], 0.12)));
    ctx.fillStyle = cg;
    const halfBase = h * 0.24 * shape.widthMul;
    for (let t = 0; t < shape.tiers; t++) {
      const f = t / (shape.tiers - 1);
      const tt = topY + f * span * 0.78;
      const tb = tt + span * 0.28;
      const w = halfBase * (0.18 + f * 0.82);
      ctx.beginPath();
      ctx.moveTo(x, tt);
      ctx.quadraticCurveTo(x - w * 0.5, tb - span * 0.05, x - w, tb);
      ctx.quadraticCurveTo(x - w * 0.3, tb + span * 0.02, x, tb);
      ctx.quadraticCurveTo(x + w * 0.3, tb + span * 0.02, x + w, tb);
      ctx.quadraticCurveTo(x + w * 0.5, tb - span * 0.05, x, tt);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Draw the trees and ground tufts together, sorted far-to-near, so nearer
   * scenery correctly covers farther scenery (a near trunk hides a tuft behind
   * it, and vice versa) rather than tufts always painting over every trunk.
   */
  function drawScene(frame: ToyFrame, at: Atmosphere): void {
    const { ctx } = frame;
    const f = focal();
    const cx = width / 2;
    const hz = horizon();
    const sp = spread();
    const speed = frame.reducedMotion ? 0 : frame.levers.animationSpeed;
    const props: { d: number; render: () => void }[] = [];
    // How dark the scene is, read from the foliage itself (pine goes near-black
    // by dusk). Trunks mute toward silhouette by the same amount, so a lit brown
    // column never floats in front of a black crown.
    const dusk = 1 - Math.min(1, (at.pine[0] + at.pine[1] + at.pine[2]) / 204);

    // Trees.
    for (
      let iz = Math.ceil((camDepth + CAM_FAR) / CELL);
      iz >= Math.floor((camDepth + CAM_NEAR) / CELL);
      iz--
    ) {
      const rowDepth = Math.max(CAM_NEAR, iz * CELL - camDepth);
      const halfWorld = rowDepth / 1.2 + CELL * 2;
      for (
        let ix = Math.floor((camX - halfWorld) / CELL);
        ix <= Math.ceil((camX + halfWorld) / CELL);
        ix++
      ) {
        if (hh(ix, iz, 0) > TREE_DENSITY) continue; // stable per-cell existence
        const wx = ix * CELL + (hh(ix, iz, 1) - 0.5) * CELL * 0.7;
        const wz = iz * CELL + (hh(ix, iz, 2) - 0.5) * CELL * 0.6;
        const d = wz - camDepth;
        if (d < CAM_NEAR || d > CAM_FAR) continue;
        const s = perspectiveScale(d, f);
        const sx = cx + (wx - camX) * s;
        const h = TREE_H * (0.5 + hh(ix, iz, 3) * 1.1) * s;
        if (sx < -h || sx > width + h) continue;
        const shape: TreeShape = {
          round: hh(ix, iz, 4) < 0.22,
          tiers: 5 + Math.floor(hh(ix, iz, 5) * 3),
          widthMul: 0.8 + hh(ix, iz, 6) * 0.6,
          trunkFrac: 0.28 + hh(ix, iz, 7) * 0.16,
        };
        const fog = depthHaze(d);
        const foliage = mix(at.pine, at.hillFar, fog * 0.85);
        // Trunks mute toward silhouette as the scene darkens so they recede
        // with their crowns rather than floating as lit columns once the
        // foliage has gone black; the additive lantern relights the near ones
        // warmly (FR-12, D-9).
        const litTrunk = mix(
          mix([94, 64, 46], [78, 70, 64], hh(ix, iz, 16)),
          at.hillFar,
          fog * 0.7,
        );
        const trunk = mix(litTrunk, [10, 11, 20], dusk * 0.9);
        // Only trees near your line of travel dissolve as you pass; the sides
        // sweep by solidly (culled by the screen-x test above).
        const depthFade = Math.min(1, (d - CAM_NEAR) / 0.7);
        const alpha = 1 - (1 - depthFade) * (1 - Math.min(1, Math.abs(sx - cx) / (width * 0.28)));
        const by = groundYAtDepth(d, hz, sp);
        props.push({
          d,
          render: () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            drawTree(ctx, sx, by, h, foliage, trunk, shape);
            ctx.restore();
          },
        });
      }
    }

    // Ground tufts.
    for (
      let iz = Math.ceil((camDepth + UNDER_FAR) / UNDER_CELL);
      iz >= Math.floor((camDepth + CAM_NEAR) / UNDER_CELL);
      iz--
    ) {
      const rowDepth = Math.max(CAM_NEAR, iz * UNDER_CELL - camDepth);
      const halfWorld = rowDepth / 1.2 + UNDER_CELL * 2;
      for (
        let ix = Math.floor((camX - halfWorld) / UNDER_CELL);
        ix <= Math.ceil((camX + halfWorld) / UNDER_CELL);
        ix++
      ) {
        if (hh(ix, iz, 8) > UNDER_DENSITY) continue;
        const wx = ix * UNDER_CELL + (hh(ix, iz, 9) - 0.5) * UNDER_CELL * 0.8;
        const wz = iz * UNDER_CELL + (hh(ix, iz, 10) - 0.5) * UNDER_CELL * 0.8;
        const d = wz - camDepth;
        if (d < CAM_NEAR || d > UNDER_FAR) continue;
        const s = perspectiveScale(d, f);
        const sx = cx + (wx - camX) * s;
        const bh = Math.min(height * 0.12, 0.05 * s * (0.6 + hh(ix, iz, 11) * 0.8));
        if (sx < -bh || sx > width + bh) continue;
        const by = groundYAtDepth(d, hz, sp);
        const col = css(mix(mix(at.ground, [12, 26, 14], 0.5), at.hillFar, depthHaze(d) * 0.7));
        const alpha = Math.min(1, (d - CAM_NEAR) / 0.5);
        const sway = frame.reducedMotion
          ? 0
          : Math.sin(time * 0.002 + ix * 1.3 + iz) * bh * 0.2 * speed;
        props.push({
          d,
          render: () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            drawTuft(ctx, sx, by, bh, col, sway);
            ctx.restore();
          },
        });
      }
    }

    props.sort((a, b) => b.d - a.d);
    for (const p of props) p.render();
  }

  function drawGround(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    const g = ctx.createLinearGradient(0, horizon(), 0, height);
    g.addColorStop(0, css(mix(at.ground, at.hillNear, 0.3)));
    g.addColorStop(1, css(mix(at.ground, [0, 0, 0], 0.25)));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon(), width, height - horizon() + edgeOver());
  }

  /** Mottled patches and scattered leaf litter on the floor, so the ground is
   * textured rather than a flat wash and the near foreground isn't bare. */
  function drawFloor(frame: ToyFrame, at: Atmosphere): void {
    const { ctx } = frame;
    const f = focal();
    const cx = width / 2;
    const hz = horizon();
    const sp = spread();
    // Clip everything on the floor to the ground area (below the horizon). Near
    // patches project very large — a mottle at the near plane has a radius of
    // order the screen width — and without this a big ground ellipse balloons up
    // past the horizon and floods the sky with a ground colour (green by day).
    const clipBottom = height + edgeOver();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, hz);
    ctx.lineTo(width, hz);
    ctx.lineTo(width, clipBottom);
    ctx.lineTo(0, clipBottom);
    ctx.closePath();
    ctx.clip();
    // Soft mottling.
    const MCELL = 2;
    const MFAR = 11;
    for (
      let iz = Math.ceil((camDepth + MFAR) / MCELL);
      iz >= Math.floor((camDepth + CAM_NEAR) / MCELL);
      iz--
    ) {
      const rowDepth = Math.max(CAM_NEAR, iz * MCELL - camDepth);
      const halfWorld = rowDepth / 1.2 + MCELL * 2;
      for (
        let ix = Math.floor((camX - halfWorld) / MCELL);
        ix <= Math.ceil((camX + halfWorld) / MCELL);
        ix++
      ) {
        if (hh(ix, iz, 20) > 0.6) continue;
        const wx = ix * MCELL + (hh(ix, iz, 21) - 0.5) * MCELL;
        const wz = iz * MCELL + (hh(ix, iz, 22) - 0.5) * MCELL;
        const d = wz - camDepth;
        if (d < CAM_NEAR || d > MFAR) continue;
        const s = perspectiveScale(d, f);
        const px = cx + (wx - camX) * s;
        const rx = 0.5 * s * (0.6 + hh(ix, iz, 23) * 0.8);
        if (px < -rx || px > width + rx) continue;
        const dark = hh(ix, iz, 24) < 0.5;
        ctx.fillStyle = css(mix(at.ground, dark ? [0, 0, 0] : at.hillNear, 0.16));
        ctx.beginPath();
        ctx.ellipse(px, groundYAtDepth(d, hz, sp), rx, rx * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Leaf litter flecks near the walker.
    const LCELL = 0.5;
    const LFAR = 6;
    for (
      let iz = Math.ceil((camDepth + LFAR) / LCELL);
      iz >= Math.floor((camDepth + CAM_NEAR) / LCELL);
      iz--
    ) {
      const rowDepth = Math.max(CAM_NEAR, iz * LCELL - camDepth);
      const halfWorld = rowDepth / 1.2 + LCELL * 2;
      for (
        let ix = Math.floor((camX - halfWorld) / LCELL);
        ix <= Math.ceil((camX + halfWorld) / LCELL);
        ix++
      ) {
        if (hh(ix, iz, 25) > 0.5) continue;
        const wx = ix * LCELL + (hh(ix, iz, 26) - 0.5) * LCELL;
        const wz = iz * LCELL + (hh(ix, iz, 27) - 0.5) * LCELL;
        const d = wz - camDepth;
        if (d < CAM_NEAR || d > LFAR) continue;
        const s = perspectiveScale(d, f);
        const px = cx + (wx - camX) * s;
        const fr = Math.min(height * 0.02, 0.02 * s * (0.6 + hh(ix, iz, 28) * 0.8));
        if (px < -fr || px > width + fr) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (d - CAM_NEAR) / 0.5);
        ctx.fillStyle = css(mix(at.ground, [96, 74, 44], 0.5 - depthHaze(d) * 0.3));
        ctx.translate(px, groundYAtDepth(d, hz, sp));
        ctx.rotate(hh(ix, iz, 29) * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, fr, fr * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawGrass(ctx: CanvasRenderingContext2D, at: Atmosphere, speed: number): void {
    const off = camX * panRef() * 1.4;
    const spacing = 20;
    const start = Math.floor((off - spacing) / spacing);
    const end = Math.ceil((off + width + spacing) / spacing);
    ctx.strokeStyle = css(mix(at.ground, [8, 12, 8], 0.4));
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = start; i <= end; i++) {
      const sx = i * spacing + hash(i) * spacing - off;
      const bh = 16 + hash(i * 3.7) * 30;
      const y0 = height - hash(i * 1.9) * 30;
      const sway = Math.sin(time * 0.002 + i) * 7 * speed;
      ctx.beginPath();
      ctx.moveTo(sx, y0);
      ctx.quadraticCurveTo(sx + sway * 0.5, y0 - bh * 0.6, sx + sway, y0 - bh);
      ctx.stroke();
    }
  }

  // ---- creatures ----------------------------------------------------------
  function spawnBird(x: number, y: number): void {
    if (birds.length >= MAX_BIRDS) return;
    birds.push({
      x,
      y,
      vx: (x > width / 2 ? -1 : 1) * (30 + Math.random() * 30),
      vy: -40 - Math.random() * 30,
      phase: Math.random() * 6,
      life: 1,
    });
  }
  function addFirefly(x: number, y: number): void {
    if (fireflies.length >= MAX_FIREFLIES) return;
    fireflies.push({ x, y, vx: 0, vy: 0, phase: Math.random() * 6 });
  }

  function tapAt(x: number, y: number, at: Atmosphere): void {
    focusX = x;
    focusY = y;
    if (at.starAlpha > 0.4) {
      for (let i = 0; i < 5; i++)
        addFirefly(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
    } else {
      spawnBird(x, y);
    }
  }

  function drawBirds(ctx: CanvasRenderingContext2D, at: Atmosphere): void {
    ctx.strokeStyle = css(at.pine);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const b of birds) {
      const w = 7 + Math.sin(time * 0.02 + b.phase) * 4;
      ctx.beginPath();
      ctx.moveTo(b.x - w, b.y);
      ctx.quadraticCurveTo(b.x, b.y - 6, b.x, b.y);
      ctx.quadraticCurveTo(b.x, b.y - 6, b.x + w, b.y);
      ctx.stroke();
    }
  }

  /**
   * A soft, warm lantern glow around the walker that fades in as it gets dark,
   * lifting the nearby trunks and ground out of the black so night stays
   * legible. Additive and soft-edged, capped by the parent brightness ceiling,
   * and off by day (NFR-5, FR-12).
   */
  function drawLantern(frame: ToyFrame, at: Atmosphere): void {
    const strength = at.starAlpha * frame.levers.brightness;
    if (strength < 0.02) return;
    const { ctx } = frame;
    // As if carried low in one hand: the source sits just below the view and
    // its light washes up into the scene, with a faint sway and flicker so it
    // feels held and alive rather than a spotlight planted in front.
    const still = frame.reducedMotion;
    const flicker = still ? 1 : 1 + 0.05 * Math.sin(time * 0.005) + 0.03 * Math.sin(time * 0.017);
    const sway = still ? 0 : Math.sin(time * 0.0011) * width * 0.025;
    // Held in one hand: the source sits off to one side (right), low and below
    // the view, so the light falls diagonally rather than straight ahead.
    const cx = width * 0.66 + sway;
    const cy = height * 1.05;
    const r = Math.min(width, height) * 1.15 * flicker;
    const a = 0.42 * strength * flicker;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, css([255, 222, 156], a));
    g.addColorStop(0.45, css([255, 206, 140], a * 0.4));
    g.addColorStop(1, css([255, 200, 135], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawFireflies(ctx: CanvasRenderingContext2D): void {
    for (const fl of fireflies) {
      const glow = 0.5 + 0.5 * Math.sin(time * 0.004 + fl.phase);
      ctx.save();
      ctx.shadowColor = "rgba(255,226,140,0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = css([255, 230, 150], 0.5 + 0.5 * glow);
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Low ferns and grass tufts near the walker that stream past underfoot. */
  /** A single low grass/fern tuft: three curved blades. */
  function drawTuft(
    ctx: CanvasRenderingContext2D,
    sx: number,
    by: number,
    bh: number,
    col: string,
    sway: number,
  ): void {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, bh * 0.14);
    ctx.lineCap = "round";
    for (let k = -1; k <= 1; k++) {
      const bx = sx + k * bh * 0.22;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + sway * 0.5 + k * bh * 0.1,
        by - bh * 0.6,
        bx + sway + k * bh * 0.25,
        by - bh,
      );
      ctx.stroke();
    }
  }

  /** Soft warm patches of light on the ground, as if sun filters through the
   * canopy. Day only, drifting past as you move. */
  function drawDapple(frame: ToyFrame): void {
    const day = Math.max(0, Math.min(1, frame.timeOfDay * 1.3 - 0.25));
    if (day < 0.05) return;
    const { ctx } = frame;
    const f = focal();
    const cx = width / 2;
    const hz = horizon();
    const sp = spread();
    const izMax = Math.ceil((camDepth + DAPPLE_FAR) / DAPPLE_CELL);
    const izMin = Math.floor((camDepth + CAM_NEAR) / DAPPLE_CELL);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let iz = izMax; iz >= izMin; iz--) {
      const rowDepth = Math.max(CAM_NEAR, iz * DAPPLE_CELL - camDepth);
      const halfWorld = rowDepth / 1.2 + DAPPLE_CELL * 2;
      const ixMin = Math.floor((camX - halfWorld) / DAPPLE_CELL);
      const ixMax = Math.ceil((camX + halfWorld) / DAPPLE_CELL);
      for (let ix = ixMin; ix <= ixMax; ix++) {
        if (hh(ix, iz, 12) > 0.45) continue;
        const wx = ix * DAPPLE_CELL + (hh(ix, iz, 13) - 0.5) * DAPPLE_CELL;
        const wz = iz * DAPPLE_CELL + (hh(ix, iz, 14) - 0.5) * DAPPLE_CELL;
        const d = wz - camDepth;
        if (d < CAM_NEAR || d > DAPPLE_FAR) continue;
        const s = perspectiveScale(d, f);
        const sx = cx + (wx - camX) * s;
        const rx = 0.5 * s * (0.5 + hh(ix, iz, 15) * 0.7);
        if (sx < -rx || sx > width + rx) continue;
        const by = groundYAtDepth(d, hz, sp);
        const a = 0.1 * day * Math.min(1, (d - CAM_NEAR) / 0.6);
        const g = ctx.createRadialGradient(sx, by, 0, sx, by, rx);
        g.addColorStop(0, css([255, 240, 190], a));
        g.addColorStop(1, css([255, 240, 190], 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx, by, rx, rx * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Motes drifting in the air: pale dust by day, faint glows at night. */
  function drawMotes(frame: ToyFrame, at: Atmosphere): void {
    const { ctx } = frame;
    const night = at.starAlpha > 0.5;
    for (const m of motes) {
      const r = 1 + m.z * 2.2;
      if (night) {
        const glow = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.003 + m.phase));
        ctx.save();
        ctx.shadowColor = "rgba(255,226,140,0.8)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = css([255, 228, 150], 0.5 * glow * m.z);
        ctx.beginPath();
        ctx.arc(m.x, m.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = css([255, 255, 250], 0.18 * m.z);
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A soft mist band along the tree line, so far trees sit behind a veil and
   * the layers separate with depth. */
  function drawMist(frame: ToyFrame, at: Atmosphere): void {
    const { ctx } = frame;
    const y = horizon() - height * 0.01;
    const band = height * 0.14;
    const alpha = 0.12 + 0.06 * (1 - at.starAlpha);
    const tint = mix(at.hillFar, [255, 255, 255], 0.35);
    const g = ctx.createLinearGradient(0, y - band, 0, y + band);
    g.addColorStop(0, css(tint, 0));
    g.addColorStop(0.5, css(tint, alpha));
    g.addColorStop(1, css(tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - band, width, band * 2);
  }

  /** Faint diagonal shafts of daylight slanting between the trees. Day only. */
  function drawShafts(frame: ToyFrame): void {
    const day = Math.max(0, Math.min(1, frame.timeOfDay * 1.3 - 0.3));
    if (day < 0.05) return;
    const { ctx } = frame;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const off = camX * 30 + time * 0.004;
    const w = width * 0.06;
    const slant = height * 0.4;
    for (let i = 0; i < 4; i++) {
      const span = width + 300;
      const bx = (((((i * width) / 3 - off) % span) + span) % span) - 150;
      const grd = ctx.createLinearGradient(bx, 0, bx - slant, horizon());
      grd.addColorStop(0, css([255, 244, 210], 0.05 * day));
      grd.addColorStop(1, css([255, 244, 210], 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(bx - w, 0);
      ctx.lineTo(bx + w, 0);
      ctx.lineTo(bx + w - slant, horizon());
      ctx.lineTo(bx - w - slant, horizon());
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A gentle vignette to frame the view and settle the edges. */
  function drawVignette(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(
      width / 2,
      height * 0.5,
      Math.min(width, height) * 0.32,
      width / 2,
      height * 0.5,
      Math.max(width, height) * 0.78,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // ---- update -------------------------------------------------------------
  function update(frame: ToyFrame): void {
    const speed = frame.reducedMotion ? 0 : frame.levers.animationSpeed;
    const dts = frame.dt / 1000;
    // Gentle self-propelled amble forward, slowing to nothing as it winds down.
    camDepth += AUTO_WALK * speed * dts;
    // Inertia from the last drag.
    if (!pressed) {
      camX += velX;
      camDepth += velDepth;
      velX *= 0.9;
      velDepth *= 0.9;
      if (Math.abs(velX) < 0.0001) velX = 0;
      if (Math.abs(velDepth) < 0.0001) velDepth = 0;
    }
    for (const b of birds) {
      b.x += b.vx * dts * (0.4 + speed);
      b.y += b.vy * dts * (0.4 + speed);
      b.vy += 6 * dts;
      b.life -= dts * 0.15;
    }
    birds = birds.filter((b) => b.life > 0 && b.y > -40 && b.x > -60 && b.x < width + 60);
    for (const fl of fireflies) {
      fl.vx += (focusX - fl.x) * 0.4 * dts * speed + (Math.random() - 0.5) * 40 * dts * speed;
      fl.vy += (focusY - fl.y) * 0.4 * dts * speed + (Math.random() - 0.5) * 40 * dts * speed;
      fl.vx *= 0.92;
      fl.vy *= 0.92;
      fl.x += fl.vx * dts;
      fl.y += fl.vy * dts;
    }
    // Drifting air: slow diagonal drift plus a gentle bob, nearer motes (higher
    // z) moving faster; shifted by panning for a touch of parallax. Wraps.
    const airSpeed = 0.4 + speed * 0.6;
    for (const m of motes) {
      m.x -= (6 + m.z * 10) * dts * airSpeed + velX * m.z * 40;
      m.y += Math.sin(time * 0.0008 + m.phase) * dts * 6 * airSpeed;
      if (m.x < -10) m.x = width + 10;
      else if (m.x > width + 10) m.x = -10;
      if (m.y < -10) m.y = height * 0.85;
      else if (m.y > height * 0.9) m.y = 0;
    }
  }

  return {
    id: "forest",
    init(w, h) {
      width = w;
      height = h;
      time = 0;
      camX = 0;
      camDepth = 0;
      velX = 0;
      velDepth = 0;
      birds = [];
      fireflies = [];
      motes = [];
      for (let i = 0; i < MOTE_COUNT; i++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.85,
          z: 0.3 + Math.random() * 0.7,
          phase: Math.random() * 6,
        });
      }
      focusX = w / 2;
      focusY = h * 0.4;
    },
    resize(w, h) {
      width = w;
      height = h;
    },
    pointer(pointer: ToyPointer) {
      if (pointer.type === "down") {
        pressed = true;
        moved = false;
        downX = pointer.x;
        downY = pointer.y;
        lastX = pointer.x;
        lastY = pointer.y;
        velX = 0;
        velDepth = 0;
      } else if (pointer.type === "move" && pressed) {
        const dx = pointer.x - lastX;
        const dy = pointer.y - lastY;
        velX = -dx / panRef();
        velDepth = -dy * WALK_PER_PX;
        camX += velX;
        camDepth += velDepth;
        lastX = pointer.x;
        lastY = pointer.y;
        if (Math.abs(pointer.x - downX) + Math.abs(pointer.y - downY) > DRAG_THRESHOLD)
          moved = true;
      } else if (pointer.type === "up") {
        if (pressed && !moved) tapAt(downX, downY, atmosphere(lastTimeOfDay));
        pressed = false;
      }
    },
    draw(frame: ToyFrame) {
      width = frame.width;
      height = frame.height;
      time += frame.dt;
      lastTimeOfDay = frame.timeOfDay;
      const at = atmosphere(frame.timeOfDay);
      const speed = frame.reducedMotion ? 0 : frame.levers.animationSpeed;
      update(frame);
      const { ctx } = frame;

      // A soft walking bob while there is motion; never under reduced motion.
      const bob = frame.reducedMotion ? 0 : Math.sin(camDepth * 3) * height * 0.006 * speed;
      ctx.save();
      ctx.translate(0, bob);

      drawSky(ctx, at);
      drawStars(ctx, at);
      drawCelestial(ctx, at);
      drawHills(ctx, at);
      drawGround(ctx, at);
      drawFloor(frame, at);
      drawDapple(frame);
      drawMist(frame, at);
      drawScene(frame, at);
      drawShafts(frame);
      drawGrass(ctx, at, speed);
      drawLantern(frame, at);
      drawMotes(frame, at);
      drawBirds(ctx, at);
      if (at.starAlpha > 0.3) drawFireflies(ctx);

      ctx.restore();

      drawVignette(ctx);

      ctx.fillStyle = css([255, 255, 255], 0.18 + 0.12 * frame.budget);
      ctx.font = `${Math.round(Math.min(width, height) * 0.02)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("S L O W T I D E", width / 2, height * 0.04);

      const veil = (1 - frame.levers.brightness) * 0.5;
      if (veil > 0.01) {
        ctx.fillStyle = css([10, 12, 24], veil);
        ctx.fillRect(0, 0, width, height);
      }
    },
  };
}
