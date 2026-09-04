// ── Site shaping ───────────────────────────────────────────────────────────
// Each location gets its ground laid out, planted and shaded before the player
// touches it, so the two zoos feel like different places rather than the same
// green square. The shapes are stylised versions of the real sites: Taronga is
// a tight bushland headland with water on two sides, Western Plains is a big
// open run of red country.
import { GRID, SiteId, TerrainId } from './data';

interface Tileish { terrain: TerrainId }

/** Natural features a site is born with. Decoration only — never enrichment. */
export const DECOR = {
  none: 0,
  gum: 1,        // tall eucalypt
  scrub: 2,      // low bush
  sandstone: 3,  // the rock the whole harbour is made of
  banksia: 4,    // squat coastal shrub
  grasstuft: 5,  // dry tussock
  deadtree: 6,   // bleached stag, out west
} as const;

/** Deterministic value noise, so a site always generates the same way. */
function noise2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t * t * (3 - 2 * t);
  return lerp(
    lerp(noise2(x0, y0, seed), noise2(x0 + 1, y0, seed), tx),
    lerp(noise2(x0, y0 + 1, seed), noise2(x0 + 1, y0 + 1, seed), tx),
    ty,
  );
}

/** Two octaves, which is enough to stop the coastline looking like a circle. */
function fbm(x: number, y: number, scale: number, seed: number): number {
  return smooth(x, y, scale, seed) * 0.65 + smooth(x, y, scale / 2.4, seed + 9) * 0.35;
}

export function shapeSite(
  site: SiteId, tiles: Tileish[], decor: Uint8Array, depth: Uint8Array,
  playable: Uint8Array, offsite: Uint8Array,
) {
  const at = (x: number, y: number) => tiles[y * GRID + x];
  if (site === 'taronga') shapeTaronga(at, decor, playable, offsite);
  else shapeDubbo(at, decor, playable);
  computeDepth(at, depth);
  for (let i = 0; i < tiles.length; i++) {
    // Anything that started as water stays water — the harbour and the dams are
    // part of the place, not building stock to be reclaimed.
    if (tiles[i].terrain === 'water') playable[i] = 0;
    // Open water is somebody else's, but a pond or a dam is yours to fence
    // around, so only the deep stuff counts as off your site.
    if (depth[i] >= 3) offsite[i] = 1;
  }
}

/**
 * How far each water tile is from the nearest land, capped at 2. Shallow water
 * against the shore is most of what makes a coastline look like a coastline.
 */
function computeDepth(at: (x: number, y: number) => Tileish, depth: Uint8Array) {
  const isWater = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID && y < GRID && at(x, y).terrain === 'water';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (!isWater(x, y)) { depth[i] = 0; continue; }
      let near = false, mid = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!isWater(x + dx, y + dy)) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d <= 1) { near = true; break; }
            if (d <= 3) mid = true;
          }
        }
      }
      depth[i] = near ? 1 : mid ? 2 : 3;
    }
  }
}

/**
 * Taronga: a bushland headland dropping to the harbour, with a sandstone
 * shoreline, scattered gums and a far shore for the city to stand on.
 */
function shapeTaronga(
  at: (x: number, y: number) => Tileish, decor: Uint8Array,
  playable: Uint8Array, offsite: Uint8Array,
) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = at(x, y);
      const cx = 50, cy = 70;
      const dx = (x - cx) / 42, dy = (y - cy) / 46;
      let land = 1 - Math.hypot(dx * 1.15, dy);
      // two octaves of wobble, plus a couple of gullies cut into the slope
      land += (fbm(x, y, 11, 3) - 0.5) * 0.40;
      land -= Math.max(0, 0.22 - Math.abs(fbm(x, y, 19, 27) - 0.5) * 0.9) * 0.7;

      const harbour = (x - 26) * 0.55 + (46 - y) * 0.75;
      if (harbour > 6) land -= (harbour - 6) * 0.055;

      const i = y * GRID + x;
      playable[i] = 1;
      if (land < 0) {
        t.terrain = 'water';
        continue;
      }
      if (land < 0.07) {
        // sandstone shelf and pocket beaches at the waterline
        const rocky = fbm(x, y, 8, 55) > 0.46;
        t.terrain = rocky ? 'dirt' : 'sand';
        if (rocky && fbm(x, y, 3, 61) > 0.74) decor[i] = DECOR.sandstone;
        else if (fbm(x, y, 4, 63) > 0.72) decor[i] = DECOR.banksia;
        continue;
      }
      // bushland, with sandstone outcrops breaking through the slope
      const rock = fbm(x, y, 7, 11);
      t.terrain = rock > 0.70 ? 'dirt' : 'grass';

      const veg = fbm(x, y, 4, 17);
      const dense = fbm(x, y, 13, 23);            // where the bush thickens
      if (rock > 0.78 && veg > 0.62) decor[i] = DECOR.sandstone;
      else if (veg > 0.80 - dense * 0.18) decor[i] = DECOR.gum;
      else if (veg > 0.66 - dense * 0.14) decor[i] = DECOR.scrub;
      else if (veg < 0.10) decor[i] = DECOR.banksia;
    }
  }

  // The far shore across the harbour — the city side. It is scenery: the player
  // can look at it but never build on it, which is what keeps the skyline
  // feeling like a view rather than spare real estate.
  for (let x = 0; x < GRID; x++) {
    // a flat quay where the Opera House stands, so it sits square on the water
    const shore = x >= 42 && x <= 56 ? 11 : 9 + Math.round(fbm(x, 0, 20, 5) * 5);
    for (let y = 0; y < shore; y++) {
      const i = y * GRID + x;
      decor[i] = DECOR.none;
      playable[i] = 0;
      offsite[i] = 1;                        // the city belongs to somebody else
      // The bridge has to span something, but it also has to land on shore at
      // both ends, so the channel sits under the arch with headland either side.
      if (x >= 63 && x <= 80 && y >= 2) { at(x, y).terrain = 'water'; continue; }
      at(x, y).terrain = y >= shore - 1 ? 'sand'
        : fbm(x, y, 6, 41) > 0.62 ? 'dirt' : 'grass';
    }
  }

  // A wooded islet out in the middle of the harbour — the bushy headland that
  // sits between the zoo and the city in every photo taken from up here.
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const d = Math.hypot((x - 40) / 7.5, (y - 22) / 3.4) + (fbm(x, y, 5, 91) - 0.5) * 0.5;
      if (d > 1) continue;
      const i = y * GRID + x;
      at(x, y).terrain = d > 0.82 ? 'sand' : 'grass';
      decor[i] = d < 0.75 && fbm(x, y, 2.5, 93) > 0.35 ? DECOR.gum : DECOR.none;
      playable[i] = 0;                       // scenery, not building land
      offsite[i] = 1;
    }
  }
}

/**
 * Western Plains: a very large open run of red earth with scattered pasture,
 * dams and dead timber. Almost all of it is usable, which is the point.
 */
function shapeDubbo(at: (x: number, y: number) => Tileish, decor: Uint8Array, playable: Uint8Array) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = at(x, y);
      const i = y * GRID + x;
      playable[i] = 1;                        // the whole run is yours to build on
      const dx = (x - 48) / 47, dy = (y - 48) / 46;
      let land = 1 - Math.hypot(dx, dy * 1.05);
      land += (fbm(x, y, 14, 7) - 0.5) * 0.24;

      if (land < 0) {
        t.terrain = 'sand';
        if (fbm(x, y, 4, 71) > 0.82) decor[i] = DECOR.grasstuft;
        continue;
      }
      const n = fbm(x, y, 8, 21);
      const dam = fbm(x, y, 6, 33);
      if (dam > 0.87 && land > 0.25) { t.terrain = 'water'; continue; }
      if (n > 0.62) t.terrain = 'grass';
      else if (n > 0.32) t.terrain = 'dirt';
      else t.terrain = 'sand';

      const veg = fbm(x, y, 5, 19);
      if (veg > 0.88) decor[i] = DECOR.gum;
      else if (veg > 0.80) decor[i] = DECOR.deadtree;
      else if (veg > 0.66) decor[i] = DECOR.scrub;
      else if (veg < 0.16) decor[i] = DECOR.grasstuft;
    }
  }
}
