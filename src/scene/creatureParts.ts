import { Group, Mesh, MeshBasicMaterial } from 'three';
import { shadedCube, withFlash } from './voxels';

/** Shared bits for the little animated creatures (gulls, fish, the cat): one shaded cube, one material per color. */

const cube = shadedCube();
const materials = new Map<string, MeshBasicMaterial>();

function mat(color: string) {
  let m = materials.get(color);
  if (!m) {
    m = withFlash(new MeshBasicMaterial({ vertexColors: true, color }), 0.45);
    materials.set(color, m);
  }
  return m;
}

/** Adds a box of the given color, centered at (x, y, z) in `parent`'s frame. */
export function part(parent: Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): Mesh {
  const m = new Mesh(cube, mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

/** A pivot group at (x, y, z) inside `parent`, for parts that swing (wings, tails, heads). */
export function pivot(parent: Group, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
