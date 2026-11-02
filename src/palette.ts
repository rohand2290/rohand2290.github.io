/**
 * Solarized Dark — https://ethanschoonover.com/solarized/
 * Keys keep the original role names (base/surface/overlay … love/gold/rose/pine/foam/iris)
 * so the rest of the app maps by role. Surface and the highlight steps are interpolated
 * between Solarized's base tones, since Solarized has no exact equivalents.
 */
export const solarized = {
  base: '#002b36' /* base03 */, surface: '#022d38', overlay: '#073642' /* base02 */,
  muted: '#586e75' /* base01 */, subtle: '#839496' /* base0 */, text: '#fdf6e3' /* base3 */,
  love: '#dc322f' /* red */, gold: '#b58900' /* yellow */, rose: '#eee8d5' /* base2 */,
  pine: '#268bd2' /* blue */, foam: '#2aa198' /* cyan */, iris: '#6c71c4' /* violet */, green: '#859900' /* green */,
  highlightLow: '#053340', highlightMed: '#224953', highlightHigh: '#3d5c65',
} as const;

const rp = solarized;

export const palette = {
  skyStorm: rp.highlightMed, cloudNear: rp.highlightHigh, cloudFar: rp.overlay,
  rain: rp.subtle, flash: rp.text,
  grassWet: rp.green, grassSpeck: rp.pine,
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
  // Royce Hall on Campus: red brick, yellow tile roofs, a pale arcaded base, dark openings.
  roycWall: rp.love,
  roycRoof: rp.gold,
  roycBase: rp.text,
  roycShadow: rp.overlay,
  // The Lab factory: violet walls, red smokestacks with pale collars, dark roofs and doors.
  labWall: rp.iris,
  labRoof: rp.highlightMed,
  labTrim: rp.text,
  labStack: rp.love,
  labDoor: rp.subtle,
  cabinet: rp.highlightMed,
  // Bare trees, sign posts and graph-node pedestals.
  trunk: rp.iris,
  // Arcade cabinet (violet upright with yellow edge trim, so it stands off the grass).
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
  // Rope bridges: cream boards and posts, pale rope rails and lashings.
  bridgePost: rp.rose,
  bridgeRope: rp.subtle,
  // Seagulls round the lighthouse.
  gullBody: rp.text,
  gullTip: rp.base,
  gullBeak: rp.gold,
  // Puddle fish: a yellow clownfish with pale bands.
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
export const SHADOW_FACTOR = (0x02 + 0x2d + 0x38) / (0x07 + 0x36 + 0x42);
