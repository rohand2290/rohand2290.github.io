/** Rosé Pine (main) — https://rosepinetheme.com/palette */
export const rosePine = {
  base: '#191724', surface: '#1f1d2e', overlay: '#26233a',
  muted: '#6e6a86', subtle: '#908caa', text: '#e0def4',
  love: '#eb6f92', gold: '#f6c177', rose: '#ebbcba',
  pine: '#31748f', foam: '#9ccfd8', iris: '#c4a7e7',
  highlightLow: '#21202e', highlightMed: '#403d52', highlightHigh: '#524f67',
} as const;

const rp = rosePine;

export const palette = {
  skyStorm: rp.highlightMed, cloudNear: rp.highlightHigh, cloudFar: rp.overlay,
  rain: rp.subtle, flash: rp.text,
  grassWet: rp.foam, grassSpeck: rp.pine,
  dirtLit: rp.overlay, dirtShadow: rp.surface,
  bark: rp.base, ropePlank: rp.rose, brick: rp.love,
  puddle: rp.pine, warmLight: rp.gold, crtScreen: rp.foam,
  // interface
  paper: rp.rose, ink: rp.base, plate: rp.overlay,
  noteFrame: rp.highlightMed, buttonPrimary: rp.gold,
};

/** Prop colors that sit between palette tokens. */
export const propColors = {
  roof: rp.highlightMed,
  // Royce Hall on Campus: love brick, gold (terracotta) tile roofs, a pale arcaded base, dark openings.
  roycWall: rp.love,
  roycRoof: rp.gold,
  roycBase: rp.text,
  roycShadow: rp.overlay,
  // The Lab factory: iris walls, love smokestacks with pale collars, dark roofs and doors.
  labWall: rp.iris,
  labRoof: rp.highlightMed,
  labTrim: rp.text,
  labStack: rp.love,
  labDoor: rp.subtle,
  cabinet: rp.highlightMed,
  // Bare trees, sign posts and graph-node pedestals.
  trunk: rp.iris,
  // Arcade cabinet (iris upright with gold edge trim, so it stands off the grass).
  cabinetSide: rp.iris,
  cabinetFront: rp.rose,
  cabinetTrim: rp.gold,
  cabinetBezel: rp.base,
  cabinetButton: rp.love,
  cabinetStick: rp.base,
  lighthouseWhite: rp.text,
  lighthouseBand: rp.love,
  lighthouseRoof: rp.love,
  lighthouseFrame: rp.highlightMed,
  lighthouseStone: rp.muted,
  lighthouseRock: rp.highlightHigh,
  helixBlue: rp.pine,
  // Rope bridges: rose boards and posts, pale rope rails and lashings.
  bridgePost: rp.rose,
  bridgeRope: rp.subtle,
  // Seagulls round the lighthouse.
  gullBody: rp.text,
  gullTip: rp.base,
  gullBeak: rp.gold,
  // Puddle fish: a gold clownfish with pale bands.
  fishBody: rp.gold,
  fishStripe: rp.text,
  fishEye: rp.base,
  // The ginger cat on the Royce Hall steps.
  catFur: rp.gold,
  catCream: rp.rose,
  catEye: rp.base,
  catNose: rp.love,
  smoke: rp.subtle,
  chimney: rp.highlightHigh,
  stone: rp.muted,
};

/** Right-face multiplier: dirtShadow / dirtLit (surface / overlay), so every voxel shades exactly like the island cliffs. */
export const SHADOW_FACTOR = (0x1f + 0x1d + 0x2e) / (0x26 + 0x23 + 0x3a);
