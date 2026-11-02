export const palette = {
  skyStorm: '#5b666c', cloudNear: '#737e83', cloudFar: '#687378',
  rain: '#d3dbde', flash: '#e9eef2',
  grassWet: '#7f9469', grassSpeck: '#93a77f',
  dirtLit: '#6e5140', dirtShadow: '#553e31',
  bark: '#3f3027', ropePlank: '#7a604b', brick: '#9a5a46',
  puddle: '#6f8a8e', warmLight: '#f6c86a', crtScreen: '#8fc7a4',
  // interface
  paper: '#f3ead8', ink: '#26221f', plate: '#2f2a26',
  noteFrame: '#5a3f36', buttonPrimary: '#e4c88f',
};

/** Prop colors that sit between palette tokens (sampled from the reference images). */
export const propColors = {
  roof: '#5b5552',
  labWall: '#cfcac3',
  cabinet: '#3a3540',
  lighthouseWhite: '#e3ded5',
  lighthouseRoof: '#3a3540',
  helixBlue: '#7fa3b0',
  smoke: '#9aa2a5',
  chimney: '#3f3631',
};

/** Right-face multiplier: dirtShadow / dirtLit, so every voxel shades exactly like the island cliffs. */
export const SHADOW_FACTOR = 0x55 / 0x6e;
