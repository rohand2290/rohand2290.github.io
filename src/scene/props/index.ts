import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { rosePine, palette, propColors } from '../../palette';
import type { PropSpec } from '../../content/types';
import { ISO_RIGHT } from '../camera';
import type { VoxelBatch } from '../voxels';
import type { LightRig } from '../../weather/lights';
import { GRAPH_NODES } from '../../world/navGrid';

export interface PropContext {
  solid: VoxelBatch;
  emissive: VoxelBatch;
  lights: LightRig;
  islandId: string;
  /** World position of the island's top center. */
  origin: Vector3;
}

type PropBuilder = (ctx: PropContext, p: Vector3, spec: PropSpec) => void;

const LEFT = ISO_RIGHT.clone().negate();
/** Horizontal direction pointing toward the viewer (into the screen's lower half). */
const TOWARD = new Vector3(1, 0, 1).normalize();

/**
 * Campus is Royce Hall: a long brick hall on a pale arcaded base, with two square bell towers
 * flanking a gabled entrance loggia (arches over arches, steps in front), a tall main hall behind,
 * arched windows along the wings, and a rounded apse closing the right end. The facade faces the
 * lit (+z) side. Footprint 5.9 × 2.6, centered on p (the nav grid relies on it).
 */
/** Where the cat sits on Royce Hall's middle step, relative to the building's position (x, y, z). */
export const ROYCE_CAT_SEAT: [number, number, number] = [-0.42, 0.12, 1.15];

function brickBuilding(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const { roycWall: brick, roycRoof: roof, roycBase: stoneBase, roycShadow: dark } = propColors;
  const y0 = p.y;
  const X = (x: number) => p.x + x;
  const Z = (z: number) => p.z + z;

  /** An arched opening on a +z face: a tall rectangle with a narrower block on top. */
  const archZ = (x: number, y: number, z: number, w: number, h: number, c: string, batch = solid) => {
    batch.standing(x, y, z, w, h - w * 0.3, 0.03, c);
    batch.standing(x, y + h - w * 0.3, z, w * 0.6, w * 0.3, 0.03, c);
  };
  /** The same on a +x face. */
  const archX = (x: number, y: number, z: number, w: number, h: number, c: string, batch = solid) => {
    batch.standing(x, y, z, 0.03, h - w * 0.3, w, c);
    batch.standing(x, y + h - w * 0.3, z, 0.03, w * 0.3, w * 0.6, c);
  };
  /** A box between x0..x1 and z0..z1, from y to y + h (relative to p). */
  const block = (x0: number, x1: number, z0: number, z1: number, y: number, h: number, c: string) =>
    solid.standing(X((x0 + x1) / 2), y0 + y, Z((z0 + z1) / 2), x1 - x0, h, z1 - z0, c);
  /** A hipped roof of shrinking slabs over x0..x1, z0..z1. */
  const hipRoof = (x0: number, x1: number, z0: number, z1: number, y: number, steps: number, stepH: number) => {
    for (let k = 0; k < steps; k++) {
      const inset = k * (Math.min(x1 - x0, z1 - z0) / (2 * steps + 1)) - (k === 0 ? 0.08 : 0);
      block(x0 + inset, x1 - inset, z0 + inset, z1 - inset, y + k * stepH, stepH, roof);
    }
  };

  // Pale arcaded base under everything, with dark slot openings along both visible faces.
  const bx0 = -2.9, bx1 = 2.2, bz0 = -1.25, bz1 = 0.65, baseH = 0.55;
  block(bx0, bx1, bz0, bz1, 0, baseH, stoneBase);
  for (let x = bx0 + 0.2; x < bx1 - 0.1; x += 0.24) {
    if (Math.abs(x) < 1.2) continue; // the towers and loggia stand here
    archZ(X(x), y0 + 0.1, Z(bz1 + 0.015), 0.11, 0.34, dark);
  }
  solid.standing(X((bx0 + bx1) / 2), y0 + baseH, Z(bz1 - 0.02), bx1 - bx0 + 0.06, 0.06, 0.1, stoneBase);

  // Wings on the base, set back to leave a terrace. Two rows of arched windows, the upper ones lit.
  const wz0 = -1.15, wz1 = 0.35, wingH = 1.15, wy = baseH;
  for (const [x0, x1] of [[-2.9, -1.15], [1.15, 2.2]] as const) {
    block(x0, x1, wz0, wz1, wy, wingH, brick);
    block(x0 - 0.04, x1 + 0.04, wz0 - 0.04, wz1 + 0.04, wy + wingH, 0.08, brick); // cornice
    hipRoof(x0, x1, wz0, wz1, wy + wingH + 0.08, 3, 0.16);
    for (let x = x0 + 0.3; x < x1 - 0.15; x += 0.4) {
      archZ(X(x), y0 + wy + 0.55, Z(wz1 + 0.015), 0.2, 0.42, palette.warmLight, emissive);
      archZ(X(x), y0 + wy + 0.12, Z(wz1 + 0.015), 0.14, 0.22, dark);
    }
  }

  // Rounded apse on the right end: stacked octagons with a stepped roof and lit windows.
  const ax = 2.2, az = -0.4;
  octagon(solid, X(ax), y0, Z(az), 1.5, baseH, stoneBase);
  octagon(solid, X(ax), y0 + baseH, Z(az), 1.32, wingH, brick);
  for (const [k, w] of [[0, 1.42], [1, 1.1], [2, 0.75], [3, 0.4]] as const) {
    octagon(solid, X(ax), y0 + baseH + wingH + k * 0.16, Z(az), w, 0.16, roof);
  }
  archX(X(ax + 0.67), y0 + wy + 0.55, Z(az), 0.2, 0.42, palette.warmLight, emissive);
  archX(X(ax + 0.76), y0 + 0.1, Z(az), 0.11, 0.34, dark);

  // Main hall rising behind the towers.
  block(-1.15, 1.15, -1.2, 0.2, 0, 2.15, brick);
  hipRoof(-1.15, 1.15, -1.2, 0.2, 2.15, 4, 0.16);

  // Entrance loggia between the towers: ground arcade on pale columns, an upper loggia, a gable.
  const lx0 = -0.55, lx1 = 0.55, lz0 = -0.3, lz1 = 1.0;
  block(lx0, lx1, lz0, lz1 - 0.12, 0, 0.95, dark); // shadowed porch behind the arches
  for (const cx of [-0.5, -0.17, 0.17, 0.5]) block(cx - 0.05, cx + 0.05, lz1 - 0.14, lz1, 0, 0.72, stoneBase);
  block(lx0, lx1, lz1 - 0.14, lz1, 0.72, 0.23, brick); // arch heads
  block(lx0, lx1, lz0, lz1, 0.95, 1.0, brick);
  for (const cx of [-0.33, 0, 0.33]) archZ(X(cx), y0 + 1.08, Z(lz1 + 0.015), 0.22, 0.62, dark);
  block(lx0 - 0.03, lx1 + 0.03, lz0, lz1 + 0.03, 1.95, 0.06, brick);
  const gableSlices = 6;
  for (let k = 0; k < gableSlices; k++) {
    const half = (lx1 - lx0) / 2 + 0.04;
    const w = half * (1 - k / gableSlices) * 2;
    block(-w / 2, w / 2, lz0, lz1 + 0.04, 2.01 + k * 0.08, 0.08, k === 0 ? brick : roof);
  }
  // Steps down from the arcade.
  for (let k = 0; k < 3; k++) block(-0.7 + k * 0.03, 0.7 - k * 0.03, lz1, lz1 + 0.45 - k * 0.15, 0, 0.06 + k * 0.06, stoneBase);

  // Bell towers: banded shafts with arched belfry openings and pyramid roofs.
  const towerH = 3.3, tw = 0.62;
  for (const tx of [-0.86, 0.86]) {
    const tz = 0.62;
    block(tx - tw / 2, tx + tw / 2, tz - tw / 2, tz + tw / 2, 0, towerH, brick);
    for (const by of [0.95, 1.95, 2.55]) block(tx - tw / 2 - 0.03, tx + tw / 2 + 0.03, tz - tw / 2 - 0.03, tz + tw / 2 + 0.03, by, 0.05, brick);
    for (const ox of [-0.13, 0.13]) archZ(X(tx + ox), y0 + 2.68, Z(tz + tw / 2 + 0.015), 0.16, 0.46, dark);
    for (const oz of [-0.13, 0.13]) archX(X(tx + tw / 2 + 0.015), y0 + 2.68, Z(tz + oz), 0.16, 0.46, dark);
    archZ(X(tx), y0 + 1.25, Z(tz + tw / 2 + 0.015), 0.12, 0.3, palette.warmLight, emissive);
    block(tx - tw / 2 - 0.06, tx + tw / 2 + 0.06, tz - tw / 2 - 0.06, tz + tw / 2 + 0.06, towerH, 0.07, brick);
    for (const [k, w] of [[0, 0.8], [1, 0.6], [2, 0.42], [3, 0.24]] as const) {
      solid.standing(X(tx), y0 + towerH + 0.07 + k * 0.13, Z(tz), w, 0.13, w, roof);
    }
    solid.beam(new Vector3(X(tx), y0 + towerH + 0.59, Z(tz)), new Vector3(X(tx), y0 + towerH + 0.8, Z(tz)), 0.05, roof);
  }

  lights.addGlow(ctx.islandId, new Vector3(p.x, p.y + 1.2, p.z + 1.2), 10, palette.warmLight, 0.4, { ground: p.y, halo: 0.18 });
}

/**
 * The Lab is a little factory: a boiler tower with two striped smokestacks and a porch over its
 * door, joined to a long hall with a sawtooth roof, roll-up doors on the lit (+z) face, and lit
 * windows, a double door and a sign on the shadow (+x) face. The footprint stays 3.6 × 3.8,
 * centered on p (the nav grid and interactables rely on it).
 */
function labBuilding(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const { labWall: wall, labRoof: roof, labTrim: trim, labStack: stack, labDoor: door } = propColors;
  const frame = propColors.cabinet;
  const y0 = p.y;

  // Hall: x from -0.4 to 1.8, z from -1.8 to 1.8.
  const hx0 = p.x - 0.4, hx1 = p.x + 1.8, hz0 = p.z - 1.8, hz1 = p.z + 1.8;
  const hw = hx1 - hx0, hcx = (hx0 + hx1) / 2;
  const wallH = 1.3;
  solid.standing(hcx, y0, p.z, hw, wallH, hz1 - hz0, wall);

  // Sawtooth roof: three teeth, each rising toward the back (-z) then dropping straight down.
  const teeth = 3, toothL = (hz1 - hz0) / teeth, rise = 0.7, slices = 6;
  for (let t = 0; t < teeth; t++) {
    const front = hz1 - t * toothL;
    for (let k = 0; k < slices; k++) {
      const h = (rise * (k + 0.5)) / slices;
      const zc = front - (k + 0.5) * (toothL / slices);
      solid.standing(hcx, y0 + wallH, zc, hw, h, toothL / slices, wall);
    }
    const a = new Vector3(hcx, y0 + wallH + 0.05, front + 0.05);
    const b = new Vector3(hcx, y0 + wallH + rise + 0.05, front - toothL);
    solid.plank(a, b, hw + 0.12, 0.1, roof);
  }

  // Roll-up loading doors on the lit face, with slats and a dark sill.
  const zf = hz1 + 0.02;
  for (let i = 0; i < 3; i++) {
    const dx = hx0 + 0.42 + i * 0.68;
    solid.standing(dx, y0, zf, 0.58, 0.86, 0.04, frame);
    solid.standing(dx, y0 + 0.04, zf + 0.02, 0.5, 0.76, 0.04, door);
    for (let s = 1; s < 6; s++) solid.box(dx, y0 + 0.04 + s * 0.127, zf + 0.045, 0.5, 0.02, 0.01, propColors.stone);
  }
  solid.standing(hcx, y0, zf + 0.08, hw - 0.2, 0.05, 0.12, propColors.labTrim);

  // Shadow face: two lit gridded windows, a double door and a sign.
  const xs = hx1 + 0.02;
  for (const wz of [p.z + 1.05, p.z + 0.05]) {
    solid.box(xs, y0 + 0.72, wz, 0.04, 0.5, 0.82, frame);
    emissive.box(xs + 0.02, y0 + 0.72, wz, 0.04, 0.42, 0.74, palette.warmLight);
    for (const oz of [-0.185, 0, 0.185]) solid.box(xs + 0.045, y0 + 0.72, wz + oz, 0.01, 0.42, 0.03, frame);
    solid.box(xs + 0.045, y0 + 0.72, wz, 0.01, 0.03, 0.74, frame);
  }
  const dz = p.z - 0.85;
  solid.standing(xs, y0, dz, 0.04, 0.78, 0.5, frame);
  solid.standing(xs + 0.02, y0, dz, 0.04, 0.7, 0.42, door);
  solid.standing(xs + 0.045, y0, dz, 0.01, 0.7, 0.02, frame);
  solid.standing(hx1 + 0.12, y0, dz, 0.24, 0.05, 0.6, trim);
  const sz = p.z - 1.45, sy = y0 + 0.82;
  solid.box(xs, sy, sz, 0.04, 0.36, 0.5, trim);
  for (const [w, dy] of [[0.36, 0.06], [0.22, -0.07]] as const) {
    solid.box(xs + 0.03, sy + dy, sz + (0.36 - w) / 2, 0.01, 0.06, w, palette.ink);
  }

  // Boiler tower: x from -1.8 to -0.4, z from -0.3 to 1.3, with a pale roof slab.
  const tx0 = p.x - 1.8, tx1 = p.x - 0.4, tz0 = p.z - 0.3, tz1 = p.z + 1.3;
  const tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2;
  const towerH = 2.3;
  solid.standing(tcx, y0, tcz, tx1 - tx0, towerH, tz1 - tz0, wall);
  solid.standing(tcx, y0 + towerH, tcz, tx1 - tx0 + 0.14, 0.14, tz1 - tz0 + 0.14, trim);

  // Two louvred vents high on the lit face, and a door under a porch.
  for (const vx of [tcx - 0.33, tcx + 0.33]) {
    solid.box(vx, y0 + 1.75, tz1 + 0.02, 0.48, 0.44, 0.04, frame);
    for (let s = 0; s < 4; s++) solid.box(vx, y0 + 1.6 + s * 0.1, tz1 + 0.05, 0.4, 0.04, 0.02, propColors.stone);
  }
  solid.standing(tcx + 0.25, y0, tz1 + 0.02, 0.38, 0.76, 0.04, frame);
  solid.standing(tcx + 0.25, y0, tz1 + 0.04, 0.3, 0.7, 0.04, door);
  emissive.box(tcx + 0.25, y0 + 0.5, tz1 + 0.07, 0.14, 0.2, 0.02, palette.warmLight);
  const porchZ = tz1 + 0.55;
  solid.standing(tcx, y0, (tz1 + porchZ) / 2, tx1 - tx0, 0.06, porchZ - tz1, frame);
  solid.standing(tcx, y0 + 1.05, (tz1 + porchZ) / 2, tx1 - tx0, 0.08, porchZ - tz1, roof);
  for (const px of [tx0 + 0.05, tx1 - 0.05]) solid.standing(px, y0, porchZ - 0.05, 0.08, 1.05, 0.08, frame);

  // Smokestacks: pale collar, a slightly tapering shaft, pale cap. Smoke rises from each.
  const roofY = towerH + 0.14;
  for (const sx of [tcx - 0.35, tcx + 0.35]) {
    const at = (y: number, W: number, h: number, c: string) => octagon(solid, sx, y0 + y, tcz, W, h, c);
    at(roofY, 0.58, 0.22, trim);
    const shaft = 2.2, steps = 6;
    for (let k = 0; k < steps; k++) at(roofY + 0.22 + (k * shaft) / steps, 0.48 - k * 0.02, shaft / steps, stack);
    const capY = roofY + 0.22 + shaft;
    at(capY, 0.48, 0.28, trim);
    lights.addSmokeSource(new Vector3(sx, y0 + capY + 0.4, tcz));
  }

  lights.addGlow(ctx.islandId, new Vector3(hx1 + 0.6, y0 + 0.8, p.z + 0.5), 7, palette.warmLight, 0.32, { ground: p.y, halo: 0.14 });
  lights.addGlow(ctx.islandId, new Vector3(tcx + 0.25, y0 + 0.6, porchZ + 0.3), 3.5, palette.warmLight, 0.25, { ground: p.y, halo: 0.08 });
}

function tree(ctx: PropContext, p: Vector3, spec: PropSpec) {
  const { solid } = ctx;
  const s = Number(spec.scale ?? 1);
  const at = (h: number, side = 0) =>
    new Vector3(p.x, p.y + h * s, p.z).addScaledVector(LEFT, side * s);
  // 1-voxel trunk, two forked branches and a small twig. No leaves.
  solid.beam(at(0), at(3.3), 0.2 * s, propColors.trunk);
  solid.beam(at(1.8), at(3.0, 0.85), 0.14 * s, propColors.trunk);
  solid.beam(at(2.1), at(3.2, -0.8), 0.14 * s, propColors.trunk);
  solid.beam(at(2.55, 0.42), at(3.05, 0.55).addScaledVector(TOWARD, -0.25 * s), 0.1 * s, propColors.trunk);
}

function puddle(ctx: PropContext, p: Vector3, spec: PropSpec) {
  ctx.lights.addPuddle(p, Number(spec.r ?? 1));
}

function helix(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const levels = 11;
  for (let i = 0; i < levels; i++) {
    const a = i * 0.62;
    const y = p.y + 0.5 + i * 0.4;
    for (const [strand, phase] of [[0, 0], [1, Math.PI]] as const) {
      const pos = new Vector3(p.x, y, p.z)
        .addScaledVector(ISO_RIGHT, Math.sin(a + phase) * 0.62)
        .addScaledVector(TOWARD, Math.cos(a + phase) * 0.62);
      if (strand === 0) solid.box(pos.x, pos.y, pos.z, 0.3, 0.3, 0.3, propColors.helixBlue);
      else emissive.box(pos.x, pos.y, pos.z, 0.3, 0.3, 0.3, palette.warmLight);
    }
  }
  solid.standing(p.x, p.y, p.z, 0.9, 0.25, 0.9, propColors.roof);
  lights.addGlow(ctx.islandId, new Vector3(p.x, p.y + 2.4, p.z), 5, palette.warmLight, 0.14, { halo: 0.14 });
}

// Node positions are traced from the Grove in 01-storm-hero.png (shared with the nav grid).
const GRAPH_EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 3], [3, 4]];

function graphSculpture(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const nodes = GRAPH_NODES.map(([x, z, s]) => ({ pos: new Vector3(p.x + x, p.y, p.z + z), s }));
  for (const [a, b] of GRAPH_EDGES) {
    const pa = nodes[a].pos.clone().setY(p.y + 0.12);
    const pb = nodes[b].pos.clone().setY(p.y + 0.12);
    solid.plank(pa, pb, 0.16, 0.12, rosePine.rose);
  }
  for (const n of nodes) {
    solid.standing(n.pos.x, p.y, n.pos.z, n.s * 0.55, 0.2, n.s * 0.55, propColors.trunk);
    emissive.box(n.pos.x, p.y + 0.2 + n.s / 2, n.pos.z, n.s, n.s, n.s, palette.warmLight);
    lights.addGlow(ctx.islandId, n.pos.clone().setY(p.y + 0.6), 2.4 * n.s + 1, palette.warmLight, 0.22, { overlay: true });
  }
  lights.addGlow(ctx.islandId, new Vector3(p.x - 1, p.y, p.z), 15, palette.warmLight, 0.4, { ground: p.y, halo: 0 });
}

/**
 * A classic upright cabinet: a recessed base, a control deck that juts out with a joystick and
 * buttons, a screen sunk between the side panels and a hood above it. Side panels carry a pale
 * trim strip on their front edges. The footprint stays w × d (the nav grid relies on it).
 */
function arcadeCabinet(ctx: PropContext, p: Vector3, spec: PropSpec) {
  const { solid, emissive, lights } = ctx;
  const h = Number(spec.h ?? 3);
  const w = h > 3 ? 1.5 : 1.25;
  const d = h > 3 ? 1.4 : 1.15;
  const color = spec.screen === 'crt' ? palette.crtScreen : palette.warmLight;
  const { cabinetSide, cabinetFront, cabinetTrim, cabinetBezel, cabinetButton, cabinetStick } = propColors;

  const zb = p.z - d / 2; // back plane
  const zf = p.z + d / 2; // front plane (the +z face the camera sees)
  const t = 0.12; // side panel thickness
  const trim = 0.05;
  const y0 = p.y;
  const yDeck = y0 + h * 0.4; // bottom of the control deck
  const yDeckTop = y0 + h * 0.52; // top of the control deck
  const yHood = y0 + h * 0.86; // bottom of the hood

  /** A box spanning z from back plane to `front`, between y `a` and `b`. */
  const slab = (x: number, sx: number, a: number, b: number, front: number, c: string) =>
    solid.box(x, (a + b) / 2, (zb + front) / 2, sx, b - a, front - zb, c);
  /** Both side panels for one band, with trim on their front edges. */
  const sides = (a: number, b: number, front: number) => {
    for (const s of [-1, 1]) {
      const x = p.x + s * (w / 2 - t / 2);
      slab(x, t, a, b, front, cabinetSide);
      solid.box(x, (a + b) / 2, front + trim / 2, t, b - a, trim, cabinetTrim);
    }
  };

  // Base: set back under the deck, darker kick panel in front.
  const baseFront = zf - d * 0.2;
  sides(y0, yDeck, baseFront);
  slab(p.x, w - 2 * t, y0, yDeck, baseFront - 0.04, cabinetFront);

  // Control deck: full depth, sticking out past the base.
  sides(yDeck, yDeckTop, zf - trim);
  slab(p.x, w - 2 * t, yDeck, yDeckTop, zf - trim, cabinetSide);
  const cz = zf - d * 0.22;
  solid.beam(new Vector3(p.x - w * 0.22, yDeckTop, cz), new Vector3(p.x - w * 0.22, yDeckTop + 0.16, cz), 0.04, cabinetStick);
  solid.box(p.x - w * 0.22, yDeckTop + 0.17, cz, 0.09, 0.09, 0.09, cabinetStick);
  for (const [bx, bz] of [[0.08, 0.03], [0.18, -0.02], [0.28, 0.03]] as const) {
    solid.standing(p.x + w * bx, yDeckTop, cz + bz, 0.08, 0.03, 0.08, cabinetButton);
  }

  // Screen band: side panels reach forward, the screen sits deep between them.
  const screenFace = zf - d * 0.24;
  sides(yDeckTop, yHood, zf - d * 0.1);
  slab(p.x, w - 2 * t, yDeckTop, yHood, screenFace, cabinetFront);
  const sy = (yDeckTop + yHood) / 2;
  const sh = yHood - yDeckTop;
  solid.box(p.x, sy, screenFace + 0.015, w - 2 * t - 0.08, sh * 0.9, 0.03, cabinetBezel);
  const idx = emissive.box(p.x, sy, screenFace + 0.04, w * 0.6, sh * 0.74, 0.03, color);
  lights.addScreen(idx, color);

  // Hood over the screen.
  sides(yHood, y0 + h, zf - d * 0.14);
  slab(p.x, w - 2 * t, yHood, y0 + h, zf - d * 0.14, cabinetSide);

  lights.addGlow(ctx.islandId, new Vector3(p.x, sy, zf + 0.5), 6, color, 0.32, { ground: p.y, halo: 0.12 });
}

function octagon(batch: VoxelBatch, x: number, y: number, z: number, W: number, h: number, color: string) {
  batch.octagon(x, y, z, W, h, color);
}

/** A chunky low-poly rock: a turned, slightly tilted block with a smaller one on top. */
function rock(batch: VoxelBatch, x: number, y: number, z: number, s: number, turn: number, color: string) {
  const q = new Quaternion().setFromEuler(new Euler(0.12, turn, -0.1));
  batch.push(new Matrix4().compose(new Vector3(x, y + s * 0.3, z), q, new Vector3(s, s * 0.8, s * 0.85)), color);
  const q2 = new Quaternion().setFromEuler(new Euler(-0.1, turn + 0.5, 0.15));
  batch.push(new Matrix4().compose(new Vector3(x - s * 0.1, y + s * 0.75, z + s * 0.05), q2, new Vector3(s * 0.6, s * 0.5, s * 0.6)), color);
}

/**
 * Striped octagonal tower on a stone plinth: it narrows toward a waist, flares out under a red
 * gallery, then a framed glass lantern and a tall stepped red roof. Rocks huddle round the base.
 */
function lighthouse(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const { lighthouseWhite: white, lighthouseBand: red, lighthouseRoof: roof, lighthouseFrame: frame } = propColors;
  const { lighthouseStone: stone, lighthouseRock: rockColor } = propColors;
  const oct = (y: number, W: number, h: number, c: string, batch = solid) => octagon(batch, p.x, p.y + y, p.z, W, h, c);

  // Stone plinth.
  const plinth = 0.7;
  oct(0, 2.0, plinth, stone);

  // Tower: alternating white and red stripes, tapering to a waist, then flaring under the gallery.
  const stripes = 10, stripeH = 0.42;
  const width = (t: number) => (t < 0.75 ? 1.5 - 0.4 * (t / 0.75) : 1.1 + 0.45 * ((t - 0.75) / 0.25) ** 2);
  for (let i = 0; i < stripes; i++) {
    oct(plinth + i * stripeH, width((i + 0.5) / stripes), stripeH, i % 2 ? red : white);
  }
  const top = plinth + stripes * stripeH;

  // Door at the foot and a lit window partway up, both on the lit (+z) face.
  const w0 = width(0.05);
  solid.standing(p.x, p.y + plinth, p.z + w0 / 2 + 0.01, 0.36, 0.68, 0.04, frame);
  solid.standing(p.x, p.y + plinth, p.z + w0 / 2 + 0.03, 0.26, 0.58, 0.04, rosePine.base);
  const winY = p.y + plinth + 5.5 * stripeH;
  const wWin = width(0.55);
  solid.box(p.x, winY, p.z + wWin / 2 + 0.01, 0.3, 0.44, 0.04, frame);
  emissive.box(p.x, winY, p.z + wWin / 2 + 0.03, 0.2, 0.34, 0.04, palette.warmLight);

  // Gallery: white trim, then a wide red deck.
  oct(top, 1.58, 0.08, white);
  oct(top + 0.08, 1.78, 0.28, red);

  // Lantern room: frame ring, glowing glass, eight posts on the corners, top ring.
  const lanternBase = top + 0.36;
  oct(lanternBase, 1.02, 0.12, frame);
  const glassY = lanternBase + 0.12, glassH = 0.72;
  oct(glassY, 0.86, glassH, palette.warmLight, emissive);
  const postR = (0.9 / 2) / Math.cos(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const ang = Math.PI / 8 + (k * Math.PI) / 4;
    const px = p.x + Math.cos(ang) * postR, pz = p.z + Math.sin(ang) * postR;
    solid.beam(new Vector3(px, p.y + glassY, pz), new Vector3(px, p.y + glassY + glassH, pz), 0.07, frame);
  }
  oct(glassY + glassH, 1.02, 0.1, frame);

  // Roof: a wide red eave, then a tall stepped spire and a thin finial.
  let y = glassY + glassH + 0.1;
  oct(y, 1.42, 0.16, roof);
  y += 0.16;
  for (const w of [1.15, 0.9, 0.66, 0.44, 0.24]) {
    oct(y, w, 0.24, roof);
    y += 0.24;
  }
  solid.beam(new Vector3(p.x, p.y + y, p.z), new Vector3(p.x, p.y + y + 0.35, p.z), 0.06, frame);

  // Rocks clustered round the plinth (kept inside the nav footprint).
  for (const [ox, oz, s, turn, c] of [
    [-1.15, 0.55, 0.62, 0.4, stone],
    [-1.1, -0.45, 0.5, 1.1, rockColor],
    [0.35, 1.2, 0.48, 0.7, rockColor],
    [1.15, 0.6, 0.58, 0.2, stone],
    [1.2, -0.5, 0.42, 0.9, rockColor],
    [-0.3, -1.2, 0.55, 0.3, stone],
    [0.8, 1.15, 0.3, 1.4, stone],
  ] as const) {
    rock(solid, p.x + ox, p.y, p.z + oz, s, turn, c);
  }

  const lamp = new Vector3(p.x, p.y + glassY + glassH / 2, p.z);
  lights.addBeam(lamp);
  lights.addGlow(ctx.islandId, lamp, 6, palette.warmLight, 0.4, { overlay: true });
}

/** Each island's signpost: a mauve post with a paper board, written on in little ink strokes. */
function signpost(ctx: PropContext, p: Vector3) {
  const { solid } = ctx;
  solid.standing(p.x, p.y, p.z, 0.16, 1.15, 0.16, propColors.trunk);
  solid.box(p.x, p.y + 1.25, p.z + 0.02, 0.92, 0.5, 0.1, palette.noteFrame);
  solid.box(p.x, p.y + 1.25, p.z + 0.075, 0.8, 0.38, 0.02, palette.paper);
  for (const [w, dy] of [[0.56, 0.08], [0.42, -0.06]] as const) {
    solid.box(p.x - (0.56 - w) / 2, p.y + 1.25 + dy, p.z + 0.09, w, 0.05, 0.01, palette.ink);
  }
}

/** A small lab terminal: a dark console with a green screen and a warm status light. */
function terminal(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  solid.standing(p.x, p.y, p.z, 0.9, 1.25, 0.8, propColors.cabinet);
  solid.standing(p.x, p.y + 1.25, p.z - 0.1, 0.9, 0.35, 0.6, propColors.cabinet);
  const idx = emissive.box(p.x, p.y + 0.95, p.z + 0.41, 0.6, 0.38, 0.04, palette.crtScreen);
  lights.addScreen(idx, palette.crtScreen);
  emissive.box(p.x + 0.3, p.y + 1.45, p.z + 0.21, 0.1, 0.1, 0.03, palette.warmLight);
  lights.addGlow(ctx.islandId, new Vector3(p.x, p.y + 0.95, p.z + 0.8), 3.2, palette.crtScreen, 0.22, { ground: p.y, halo: 0.08 });
}

const builders: Record<string, PropBuilder> = {
  signpost,
  terminal,
  'brick-building': brickBuilding,
  'lab-building': labBuilding,
  tree,
  puddle,
  helix,
  'graph-sculpture': graphSculpture,
  'arcade-cabinet': arcadeCabinet,
  lighthouse,
};

export function buildProp(ctx: PropContext, spec: PropSpec) {
  const builder = builders[spec.type];
  if (!builder) {
    console.warn(`Unknown prop type "${spec.type}" on island "${ctx.islandId}"`);
    return;
  }
  const p = new Vector3(ctx.origin.x + spec.at[0], ctx.origin.y, ctx.origin.z + spec.at[1]);
  builder(ctx, p, spec);
}

