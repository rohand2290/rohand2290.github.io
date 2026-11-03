import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { solarized, palette, SHADOW_FACTOR } from '../palette';
import { injectBob, withBob, worldUniforms } from '../scene/voxels';
import type { Pose } from './animation';

/**
 * The character: a little voxel person in a yellow raincoat with a brick-red umbrella.
 * Built from half-unit voxels: 1 world unit wide, about 2 tall, so it stands at door height
 * next to the buildings. Each limb hangs from its own pivot so the poses can swing it.
 */

export const characterColors = {
  coat: palette.warmLight,
  coatShade: solarized.rose,
  skin: palette.buttonPrimary,
  pants: palette.dirtShadow,
  boots: palette.bark,
  eyes: palette.ink,
  canopy: palette.brick,
  canopyRim: solarized.love,
  handle: palette.bark,
};

const materials = new Map<string, MeshBasicMaterial>();
const unitBox = new BoxGeometry(1, 1, 1);

/**
 * Flat colour, shaded by which way each face points in the world (top and +z lit, +x in shadow,
 * same factors as the island voxels), so the shading stays right as the character turns.
 * Lightning lifts it like every other world material.
 */
function charMaterial(color: string): MeshBasicMaterial {
  let m = materials.get(color);
  if (m) return m;
  m = new MeshBasicMaterial({ color });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = worldUniforms.uFlash;
    shader.uniforms.uFlashColor = worldUniforms.uFlashColor;
    injectBob(shader);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWN;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFlash;\nuniform vec3 uFlashColor;\nvarying vec3 vWN;\nvoid main() {')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
  vec3 wn = normalize(vWN);
  vec3 w2 = wn * wn;
  float shade = w2.y * (wn.y > 0.0 ? 1.0 : 0.6) + w2.z * (wn.z > 0.0 ? 1.0 : 0.7) + w2.x * (wn.x > 0.0 ? ${SHADOW_FACTOR.toFixed(4)} : 0.7);
  diffuseColor.rgb *= shade;`,
      )
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, clamp(uFlash * 0.45, 0.0, 1.0));',
      );
  };
  m.customProgramCacheKey = () => 'character';
  materials.set(color, m);
  return m;
}

/** A box of size (sx, sy, sz) centred at (x, y, z) inside `parent`. */
function box(parent: Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): Mesh {
  const mesh = new Mesh(unitBox, charMaterial(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function pivot(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const HIP = 0.5;
const SHOULDER = 0.66;
/** Forward raise of the umbrella arm while walking (radians). */
const UMBRELLA_RAISE = 0.85;

export class CharacterModel {
  /** Placed at the character's feet; set its position from the controller. */
  readonly root = new Group();
  /** Turns to face the walking direction. */
  readonly yaw: Group;
  private readonly body: Group;
  private readonly torso: Group;
  private readonly chest: Mesh;
  private readonly head: Group;
  private readonly legL: Group;
  private readonly legR: Group;
  private readonly armL: Group;
  private readonly armR: Group;
  private readonly umbrella: Group;
  private readonly canopy: Group;
  readonly shadow: Mesh;

  constructor() {
    const c = characterColors;
    this.yaw = pivot(this.root, 0, 0, 0);
    // Rolls side to side at the feet (balance) and bobs while walking.
    this.body = pivot(this.yaw, 0, 0, 0);

    // Legs hang from the hips: trousers, then boots.
    this.legL = pivot(this.body, 0.2, HIP, 0);
    this.legR = pivot(this.body, -0.2, HIP, 0);
    for (const leg of [this.legL, this.legR]) {
      box(leg, c.pants, 0, -0.17, 0, 0.32, 0.34, 0.34);
      box(leg, c.boots, 0, -0.42, 0.03, 0.36, 0.16, 0.42);
    }

    // Torso pivots at the hips so a flinch hunches it forward.
    this.torso = pivot(this.body, 0, HIP, 0);
    this.chest = box(this.torso, c.coat, 0, 0.36, 0, 0.88, 0.72, 0.6);
    box(this.torso, c.coatShade, 0, 0.06, 0, 0.94, 0.14, 0.66); // hem
    box(this.torso, c.coatShade, 0.0, 0.5, 0.305, 0.08, 0.08, 0.02); // toggles
    box(this.torso, c.coatShade, 0.0, 0.28, 0.305, 0.08, 0.08, 0.02);

    // Head with a yellow hood.
    this.head = pivot(this.torso, 0, 0.72, 0);
    box(this.head, c.skin, 0, 0.34, 0.02, 0.76, 0.66, 0.7);
    box(this.head, c.coat, 0, 0.72, -0.02, 0.86, 0.16, 0.82); // hood top
    box(this.head, c.coat, 0, 0.38, -0.36, 0.86, 0.66, 0.14); // hood back
    box(this.head, c.coat, 0.41, 0.4, -0.04, 0.08, 0.56, 0.72); // hood sides
    box(this.head, c.coat, -0.41, 0.4, -0.04, 0.08, 0.56, 0.72);
    box(this.head, c.eyes, 0.16, 0.36, 0.375, 0.1, 0.13, 0.03);
    box(this.head, c.eyes, -0.16, 0.36, 0.375, 0.1, 0.13, 0.03);

    // Arms hang from the shoulders, sleeves then hands. The right hand holds the umbrella.
    this.armL = pivot(this.torso, 0.54, SHOULDER, 0);
    this.armR = pivot(this.torso, -0.54, SHOULDER, 0);
    for (const arm of [this.armL, this.armR]) {
      box(arm, c.coat, 0, -0.24, 0, 0.22, 0.5, 0.24);
      box(arm, c.skin, 0, -0.55, 0, 0.2, 0.16, 0.2);
    }

    // Umbrella: pivots at the right hand; the canopy spins on the shaft for the idle twirl.
    this.umbrella = pivot(this.armR, 0, -0.55, 0);
    box(this.umbrella, c.handle, 0, 0.82, 0, 0.07, 1.64, 0.07);
    box(this.umbrella, c.handle, 0, -0.04, 0.07, 0.07, 0.07, 0.16); // crook
    this.canopy = pivot(this.umbrella, 0, 1.62, 0);
    box(this.canopy, c.canopyRim, 0, 0, 0, 1.56, 0.1, 1.56);
    box(this.canopy, c.canopy, 0, 0.1, 0, 1.36, 0.12, 1.36);
    box(this.canopy, c.canopy, 0, 0.22, 0, 0.9, 0.12, 0.9);
    box(this.canopy, c.canopy, 0, 0.32, 0, 0.42, 0.1, 0.42);
    box(this.canopy, c.handle, 0, 0.44, 0, 0.07, 0.16, 0.07); // tip

    // A soft contact shadow so the character sits on the grass.
    this.shadow = new Mesh(
      new CircleGeometry(0.46, 20),
      withBob(new MeshBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.22, depthWrite: false })),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.025;
    this.shadow.renderOrder = 2;
    this.root.add(this.shadow);
  }

  apply(p: Pose) {
    this.body.position.y = p.bob;
    this.body.rotation.z = p.roll;
    this.legL.rotation.x = -p.legL;
    this.legR.rotation.x = -p.legR;
    // On the rope the feet come in to one line.
    this.legL.position.x = 0.2 * (1 - 0.65 * p.stance);
    this.legR.position.x = -0.2 * (1 - 0.65 * p.stance);
    this.armL.rotation.x = -p.armL;
    this.torso.rotation.x = p.torsoPitch;
    this.chest.scale.y = 0.72 * p.breathe;
    this.chest.position.y = 0.36 * p.breathe;
    this.head.position.y = 0.72 * p.breathe;
    this.head.rotation.x = p.headPitch;

    // As the umbrella tilts out for balance, the right arm swings out sideways with it.
    const out = p.umbrellaTilt / (Math.PI / 2);
    this.armR.rotation.x = -(UMBRELLA_RAISE * (1 - out) + p.armR);
    this.armR.rotation.z = -1.15 * out;
    // Keep the shaft upright relative to the world (undo the arm's swing), then tilt it outward.
    // While walking, lean the shaft in and back a little so the canopy sits over the head.
    this.umbrella.rotation.x = -this.armR.rotation.x - 0.22 * (1 - out);
    this.umbrella.rotation.z = p.umbrellaTilt - this.armR.rotation.z - 0.3 * (1 - out);
    this.canopy.rotation.y = p.umbrellaSpin;
    // The left arm goes out the other way when balancing.
    this.armL.rotation.z = out * 1.1;
  }
}
