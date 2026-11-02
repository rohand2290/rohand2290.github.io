import { Vector3 } from 'three';
import { palette, propColors } from '../../palette';
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

function brickBuilding(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const w = 3, h = 2.6, d = 3;
  solid.standing(p.x, p.y, p.z, w, h, d, palette.brick);
  solid.standing(p.x, p.y + h, p.z, w + 0.1, 0.35, d + 0.1, propColors.roof);
  // Windows on the lit (+z) face and the shadow (+x) face.
  for (const ox of [-0.75, 0.55]) emissive.box(p.x + ox, p.y + 1.45, p.z + d / 2 + 0.03, 0.45, 0.6, 0.06, palette.warmLight);
  for (const oz of [-0.6, 0.6]) emissive.box(p.x + w / 2 + 0.03, p.y + 1.45, p.z + oz, 0.06, 0.6, 0.45, palette.warmLight);
  // Chimney toward the back corner of the roof.
  const cx = p.x - 0.8, cz = p.z - 0.7;
  solid.standing(cx, p.y + h + 0.35, cz, 0.5, 1.1, 0.5, propColors.chimney);
  lights.addSmokeSource(new Vector3(cx, p.y + h + 1.6, cz));
  lights.addGlow(ctx.islandId, new Vector3(p.x, p.y + 1.4, p.z), 10, palette.warmLight, 0.42, { ground: p.y, halo: 0.2 });
}

function labBuilding(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const s = 2.6;
  solid.standing(p.x, p.y, p.z, s, s, s, propColors.labWall);
  emissive.box(p.x - 0.55, p.y + 1.5, p.z + s / 2 + 0.03, 0.5, 0.6, 0.06, palette.warmLight);
  lights.addGlow(ctx.islandId, new Vector3(p.x - 0.4, p.y + 1.4, p.z + 0.4), 8.5, palette.warmLight, 0.38, { ground: p.y, halo: 0.18 });
}

function tree(ctx: PropContext, p: Vector3, spec: PropSpec) {
  const { solid } = ctx;
  const s = Number(spec.scale ?? 1);
  const at = (h: number, side = 0) =>
    new Vector3(p.x, p.y + h * s, p.z).addScaledVector(LEFT, side * s);
  // 1-voxel trunk, two forked branches and a small twig. No leaves.
  solid.beam(at(0), at(3.3), 0.2 * s, palette.bark);
  solid.beam(at(1.8), at(3.0, 0.85), 0.14 * s, palette.bark);
  solid.beam(at(2.1), at(3.2, -0.8), 0.14 * s, palette.bark);
  solid.beam(at(2.55, 0.42), at(3.05, 0.55).addScaledVector(TOWARD, -0.25 * s), 0.1 * s, palette.bark);
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
    solid.plank(pa, pb, 0.16, 0.12, '#6b5236');
  }
  for (const n of nodes) {
    solid.standing(n.pos.x, p.y, n.pos.z, n.s * 0.55, 0.2, n.s * 0.55, palette.bark);
    emissive.box(n.pos.x, p.y + 0.2 + n.s / 2, n.pos.z, n.s, n.s, n.s, palette.warmLight);
    lights.addGlow(ctx.islandId, n.pos.clone().setY(p.y + 0.6), 2.4 * n.s + 1, palette.warmLight, 0.22, { overlay: true });
  }
  lights.addGlow(ctx.islandId, new Vector3(p.x - 1, p.y, p.z), 15, palette.warmLight, 0.4, { ground: p.y, halo: 0 });
}

function arcadeCabinet(ctx: PropContext, p: Vector3, spec: PropSpec) {
  const { solid, emissive, lights } = ctx;
  const h = Number(spec.h ?? 3);
  const w = h > 3 ? 1.5 : 1.25;
  const d = h > 3 ? 1.4 : 1.15;
  const color = spec.screen === 'crt' ? palette.crtScreen : palette.warmLight;
  solid.standing(p.x, p.y, p.z, w, h, d, propColors.cabinet);
  solid.standing(p.x, p.y + h, p.z, w + 0.05, 0.12, d + 0.05, '#2f2b35');
  const sy = p.y + h - 1.05;
  const idx = emissive.box(p.x - 0.1, sy, p.z + d / 2 + 0.03, w * 0.55, h > 3 ? 0.85 : 0.55, 0.06, color);
  lights.addScreen(idx, color);
  lights.addGlow(ctx.islandId, new Vector3(p.x, sy, p.z + d / 2 + 0.6), 6, color, 0.32, { ground: p.y, halo: 0.12 });
}

function lighthouse(ctx: PropContext, p: Vector3) {
  const { solid, emissive, lights } = ctx;
  const white = propColors.lighthouseWhite;
  solid.standing(p.x, p.y, p.z, 1.7, 2.6, 1.7, white);
  solid.standing(p.x, p.y + 2.6, p.z, 1.6, 0.9, 1.6, palette.brick);
  solid.standing(p.x, p.y + 3.5, p.z, 1.5, 1.9, 1.5, white);
  emissive.standing(p.x, p.y + 5.4, p.z, 1.2, 0.85, 1.2, palette.warmLight);
  solid.standing(p.x, p.y + 6.25, p.z, 1.55, 0.35, 1.55, propColors.lighthouseRoof);
  solid.standing(p.x, p.y + 6.6, p.z, 1.0, 0.35, 1.0, propColors.lighthouseRoof);
  solid.standing(p.x, p.y + 6.95, p.z, 0.45, 0.35, 0.45, propColors.lighthouseRoof);
  const lamp = new Vector3(p.x, p.y + 5.85, p.z);
  lights.addBeam(lamp);
  lights.addGlow(ctx.islandId, lamp, 6, palette.warmLight, 0.4, { overlay: true });
}

/** Each island's signpost: a bark post with a paper board, written on in little ink strokes. */
function signpost(ctx: PropContext, p: Vector3) {
  const { solid } = ctx;
  solid.standing(p.x, p.y, p.z, 0.16, 1.15, 0.16, palette.bark);
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

