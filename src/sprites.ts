// ── Procedural RCT-style pixel sprites, pre-rendered to offscreen canvases ──
import { TILE_W, TILE_H, SPECIES, SHOPS, BARRIERS, TRANSPORT, siteDef, SpeciesDef, ShopDef, BarrierDef, TransportDef, SiteId } from './data';

const cache = new Map<string, HTMLCanvasElement>();

export function sprite(key: string): HTMLCanvasElement {
  const c = cache.get(key);
  if (!c) throw new Error('missing sprite ' + key);
  return c;
}

function mk(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  return c;
}

// chunky "pixel" helper — 2px blocks give the RCT feel
const P = 2;
function px(g: CanvasRenderingContext2D, x: number, y: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x * P, y * P, P, P);
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const gg = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${gg},${b})`;
}

// ── terrain diamonds ────────────────────────────────────────────────────────
// tile canvas is TILE_W x TILE_H; diamond corners: (32,0) (64,16) (32,32) (0,16)
function diamondPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  g.moveTo(TILE_W / 2, 0);
  g.lineTo(TILE_W, TILE_H / 2);
  g.lineTo(TILE_W / 2, TILE_H);
  g.lineTo(0, TILE_H / 2);
  g.closePath();
}

function terrainTile(base: string, speckle: string, speckle2: string, seed: number): HTMLCanvasElement {
  return mk(TILE_W, TILE_H, g => {
    diamondPath(g);
    g.fillStyle = base;
    g.fill();
    g.save();
    diamondPath(g);
    g.clip();
    // deterministic speckle dither
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rnd() * (TILE_W / P));
      const y = Math.floor(rnd() * (TILE_H / P));
      px(g, x, y, rnd() > 0.5 ? speckle : speckle2);
    }
    g.restore();
    // crisp dark outline like RCT tile grid
    diamondPath(g);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    g.stroke();
  });
}

function waterTile(frame: number, base = '#3d7dbb', depth = 3): HTMLCanvasElement {
  // shallower water is lighter and greener, which is most of what makes a
  // coastline look like a coastline rather than a blue mask
  const tint = depth === 1 ? 1.55 : depth === 2 ? 1.24 : 1;
  const col = shadeOf(base, tint);
  return mk(TILE_W, TILE_H, g => {
    diamondPath(g);
    g.fillStyle = col;
    g.fill();
    g.save();
    diamondPath(g);
    g.clip();
    // broad slow swell
    g.fillStyle = shadeOf(col, 1.1);
    for (let i = 0; i < 4; i++) {
      const y = 5 + i * 7 + Math.sin((i + frame * 0.9) * 1.7) * 2;
      g.fillRect(6 + ((i * 11 + frame * 5) % 22), y, 22, 2);
    }
    // fine glitter, denser in the shallows
    g.fillStyle = 'rgba(255,255,255,' + (depth === 1 ? 0.42 : 0.24) + ')';
    let sd = 7 + frame * 31 + depth * 13;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < (depth === 1 ? 16 : 9); i++) {
      g.fillRect(4 + rnd() * 56, 3 + rnd() * 26, 2, 1);
    }
    if (depth === 1) {
      // sand showing through right at the edge
      g.fillStyle = 'rgba(226, 205, 152, 0.30)';
      g.fillRect(0, TILE_H / 2 - 2, TILE_W, 5);
    }
    g.restore();
    diamondPath(g);
    g.strokeStyle = 'rgba(0,0,0,0.14)';
    g.stroke();
  });
}

function pathTile(): HTMLCanvasElement {
  return mk(TILE_W, TILE_H, g => {
    diamondPath(g);
    g.fillStyle = '#b9a27c';
    g.fill();
    g.save();
    diamondPath(g);
    g.clip();
    // paver grid
    g.strokeStyle = '#9c8663';
    g.lineWidth = 1;
    for (let i = -2; i < 6; i++) {
      g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 32, 32); g.stroke();
      g.beginPath(); g.moveTo(i * 16 + 32, 0); g.lineTo(i * 16, 32); g.stroke();
    }
    g.restore();
    diamondPath(g);
    g.strokeStyle = '#7c6a4d';
    g.stroke();
  });
}

// ── barriers: mounted on a tile EDGE, one sprite per view-space edge ───────
// A barrier's side is stored in world space and mapped to a view edge only at
// draw time, so these four cover every camera rotation.
const WALL_OY = 30;
const WOOD = '#8a5a2b', WOOD_DARK = '#5f3d1c', WOOD_LIGHT = '#a97a45';

/** Endpoints of each view-space edge, in tile-local pixels. */
function edgeEnds(viewDir: number): [number, number, number, number] {
  const top: [number, number] = [TILE_W / 2, 0];
  const right: [number, number] = [TILE_W, TILE_H / 2];
  const bottom: [number, number] = [TILE_W / 2, TILE_H];
  const left: [number, number] = [0, TILE_H / 2];
  const pairs: [[number, number], [number, number]][] = [
    [top, right], [right, bottom], [bottom, left], [left, top],
  ];
  const [a, b] = pairs[viewDir];
  return [a[0], a[1] + WALL_OY, b[0], b[1] + WALL_OY];
}

/** The upright face of a barrier: the edge line extruded upward by `h`. */
function facePath(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, h: number) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x2, y2 - h);
  g.lineTo(x1, y1 - h);
  g.closePath();
}

function postAt(g: CanvasRenderingContext2D, x: number, y: number, h: number, c: string, cl: string) {
  g.fillStyle = c;
  g.fillRect(x - 2, y - h, 4, h);
  g.fillStyle = cl;
  g.fillRect(x - 2, y - h - 2, 4, 3);
}

function barrierSprite(def: BarrierDef, viewDir: number): HTMLCanvasElement {
  return mk(TILE_W + 1, TILE_H + WALL_OY, g => {
    const [x1, y1, x2, y2] = edgeEnds(viewDir);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    if (def.id === 'timber') {
      for (const lift of [7, 15]) {
        g.strokeStyle = WOOD; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x1, y1 - lift); g.lineTo(x2, y2 - lift); g.stroke();
        g.strokeStyle = WOOD_DARK; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x1, y1 - lift + 2); g.lineTo(x2, y2 - lift + 2); g.stroke();
      }
      postAt(g, x1, y1, 20, WOOD_DARK, WOOD_LIGHT);
      postAt(g, x2, y2, 20, WOOD_DARK, WOOD_LIGHT);

    } else if (def.id === 'hedge') {
      // clumps of foliage along the edge rather than a flat slab
      for (let t = 0; t <= 1.001; t += 0.25) {
        const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
        ell(g, cx, cy - 10, 8, 9, '#3f7534');
        ell(g, cx - 2, cy - 13, 5, 5, '#57994a');
      }
      g.fillStyle = '#2f5a27';
      for (let t = 0.1; t < 1; t += 0.2) {
        const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
        g.fillRect(cx - 1, cy - 5, 2, 4);
      }

    } else if (def.id === 'mesh') {
      facePath(g, x1, y1, x2, y2, 24);
      g.save(); g.clip();
      g.strokeStyle = 'rgba(190,200,205,0.85)';
      g.lineWidth = 1;
      for (let i = -TILE_W; i < TILE_W * 2; i += 5) {
        g.beginPath(); g.moveTo(i, my - 34); g.lineTo(i + 34, my + 6); g.stroke();
        g.beginPath(); g.moveTo(i + 34, my - 34); g.lineTo(i, my + 6); g.stroke();
      }
      g.restore();
      postAt(g, x1, y1, 26, '#6d7276', '#9aa0a4');
      postAt(g, x2, y2, 26, '#6d7276', '#9aa0a4');
      g.strokeStyle = '#8d9296'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x1, y1 - 24); g.lineTo(x2, y2 - 24); g.stroke();

    } else if (def.id === 'glass') {
      facePath(g, x1, y1, x2, y2, 22);
      g.fillStyle = 'rgba(168, 214, 230, 0.42)';
      g.fill();
      g.save();
      facePath(g, x1, y1, x2, y2, 22);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.6)';   // reflection streaks
      g.lineWidth = 2;
      for (let i = -20; i < TILE_W + 20; i += 14) {
        g.beginPath(); g.moveTo(i, my + 4); g.lineTo(i + 12, my - 26); g.stroke();
      }
      g.restore();
      g.strokeStyle = '#5f7f8c'; g.lineWidth = 1.5;   // frame
      g.beginPath(); g.moveTo(x1, y1 - 22); g.lineTo(x2, y2 - 22); g.stroke();
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      postAt(g, x1, y1, 23, '#5f7f8c', '#8fb2bd');
      postAt(g, x2, y2, 23, '#5f7f8c', '#8fb2bd');

    } else {
      // stone: a solid block wall, coursed
      facePath(g, x1, y1, x2, y2, 20);
      g.fillStyle = '#948d80';
      g.fill();
      g.save();
      facePath(g, x1, y1, x2, y2, 20);
      g.clip();
      g.strokeStyle = '#7a7367'; g.lineWidth = 1;
      for (const lift of [7, 14]) {
        g.beginPath(); g.moveTo(x1, y1 - lift); g.lineTo(x2, y2 - lift); g.stroke();
      }
      for (let t = 0.12; t < 1; t += 0.25) {          // vertical joints, offset per course
        const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 7); g.stroke();
        g.beginPath(); g.moveTo(cx + 8, cy - 7); g.lineTo(cx + 8, cy - 14); g.stroke();
      }
      g.restore();
      g.fillStyle = '#a8a294';                        // capping
      g.beginPath();
      g.moveTo(x1, y1 - 20); g.lineTo(x2, y2 - 20); g.lineTo(x2, y2 - 23); g.lineTo(x1, y1 - 23);
      g.closePath(); g.fill();
    }
  });
}

/** A keeper gate in the same material: two piers, a braced door ajar, and a sign. */
function gateSprite(def: BarrierDef, viewDir: number): HTMLCanvasElement {
  return mk(TILE_W + 1, TILE_H + WALL_OY, g => {
    const [x1, y1, x2, y2] = edgeEnds(viewDir);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const pier = def.id === 'stone' ? '#7a7367' : def.id === 'timber' || def.id === 'hedge' ? WOOD_DARK : '#5f7f8c';
    const pierTop = def.id === 'stone' ? '#a8a294' : def.id === 'timber' || def.id === 'hedge' ? WOOD_LIGHT : '#8fb2bd';

    // heavy piers either side of the opening
    for (const [px2, py] of [[x1, y1], [x2, y2]] as [number, number][]) {
      g.fillStyle = pier;
      g.fillRect(px2 - 3, py - 26, 6, 26);
      g.fillStyle = pierTop;
      g.fillRect(px2 - 4, py - 29, 8, 4);
    }

    // door leaf, swung part-open toward the viewer
    const dx = (x2 - x1) * 0.42, dy = (y2 - y1) * 0.42;
    g.fillStyle = '#7d5228';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 + dx, y1 + dy + 4);
    g.lineTo(x1 + dx, y1 + dy - 14);
    g.lineTo(x1, y1 - 18);
    g.closePath();
    g.fill();
    g.strokeStyle = '#4d3116'; g.lineWidth = 1;
    g.stroke();
    g.beginPath();                                   // diagonal brace
    g.moveTo(x1 + 1, y1 - 1); g.lineTo(x1 + dx - 1, y1 + dy - 12); g.stroke();
    g.fillStyle = '#c9a227';                         // latch
    g.fillRect(x1 + dx - 3, y1 + dy - 6, 2, 3);

    // sign board on the near pier
    g.fillStyle = '#2e5d34';
    g.fillRect(mx - 15, my - 40, 30, 12);
    g.strokeStyle = '#3a2512'; g.lineWidth = 1;
    g.strokeRect(mx - 15, my - 40, 30, 12);
    g.fillStyle = '#ffd75e';
    g.font = 'bold 7px monospace';
    g.textAlign = 'center';
    g.fillText('KEEPER', mx, my - 31);
    g.fillStyle = '#7a5230';                         // sign post
    g.fillRect(mx - 1, my - 29, 2, 6);
  });
}

// ── scenery ────────────────────────────────────────────────────────────────
function treeSprite(): HTMLCanvasElement {
  return mk(48, 64, g => {
    g.fillStyle = '#6b4a2b';
    g.fillRect(22, 40, 6, 22);
    g.fillStyle = '#59391f';
    g.fillRect(25, 40, 3, 22);
    const blobs: [number, number, number, string][] = [
      [24, 22, 16, '#3e7a3a'], [14, 30, 11, '#356b32'], [34, 30, 11, '#468a42'],
      [24, 14, 10, '#4f9a4a'], [18, 20, 8, '#468a42'],
    ];
    blobs.forEach(([x, y, r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(24, 22, 17, 0, 7); g.stroke();
  });
}

function bushSprite(): HTMLCanvasElement {
  return mk(36, 28, g => {
    const blobs: [number, number, number, string][] = [
      [18, 18, 10, '#4c8a3f'], [10, 20, 7, '#3f7534'], [26, 20, 7, '#57994a'],
    ];
    blobs.forEach(([x, y, r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    // wattle dots
    g.fillStyle = '#ffd75e';
    [[8, 16], [16, 11], [24, 15], [20, 20], [12, 22]].forEach(([x, y]) => g.fillRect(x, y, 2, 2));
  });
}

function rockSprite(): HTMLCanvasElement {
  return mk(36, 26, g => {
    g.fillStyle = '#8d8d85';
    g.beginPath();
    g.moveTo(4, 22); g.lineTo(10, 8); g.lineTo(20, 4); g.lineTo(30, 12); g.lineTo(32, 22);
    g.closePath(); g.fill();
    g.fillStyle = '#a5a59c';
    g.beginPath(); g.moveTo(10, 8); g.lineTo(20, 4); g.lineTo(24, 10); g.lineTo(14, 14); g.closePath(); g.fill();
    g.strokeStyle = '#5f5f58';
    g.beginPath();
    g.moveTo(4, 22); g.lineTo(10, 8); g.lineTo(20, 4); g.lineTo(30, 12); g.lineTo(32, 22);
    g.stroke();
  });
}

function flowerSprite(): HTMLCanvasElement {
  return mk(40, 18, g => {
    g.fillStyle = '#3f7534';
    g.fillRect(4, 12, 32, 5);
    const cols = ['#e74c3c', '#f1c40f', '#e67e22', '#e84393'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(5 + i * 4, 8 + (i % 2) * 3, 3, 3);
    }
  });
}


// ── enrichment: the things that actually keep an animal interested ─────────
function climbSprite(): HTMLCanvasElement {
  return mk(44, 50, g => {
    const post = (x: number) => { g.fillStyle = '#7a5230'; g.fillRect(x, 14, 4, 32); g.fillStyle = '#54371f'; g.fillRect(x + 3, 14, 1, 32); };
    post(8); post(32);
    g.fillStyle = '#8a5a2b';                    // platforms
    g.fillRect(4, 12, 36, 4);
    g.fillRect(10, 28, 24, 3);
    g.strokeStyle = '#c9a227'; g.lineWidth = 1.5;   // rope
    g.beginPath(); g.moveTo(12, 16); g.quadraticCurveTo(22, 30, 32, 16); g.stroke();
    g.beginPath(); g.moveTo(14, 31); g.lineTo(14, 44); g.stroke();
    g.fillStyle = '#5f3d1c'; g.fillRect(10, 44, 8, 3);   // swing seat
  });
}

function logsSprite(): HTMLCanvasElement {
  return mk(38, 22, g => {
    const log = (x: number, y: number, w: number) => {
      g.fillStyle = '#7a5230'; g.fillRect(x, y, w, 6);
      g.fillStyle = '#8f6538'; g.fillRect(x, y, w, 2);
      g.fillStyle = '#c9a06a'; g.beginPath(); g.ellipse(x + w, y + 3, 2, 3, 0, 0, 7); g.fill();
      g.strokeStyle = '#6b4a2b'; g.beginPath(); g.ellipse(x + w, y + 3, 1, 1.5, 0, 0, 7); g.stroke();
    };
    log(3, 14, 30); log(7, 8, 24); log(12, 2, 16);
  });
}

function hammockSprite(): HTMLCanvasElement {
  return mk(42, 34, g => {
    g.fillStyle = '#6b4a2b'; g.fillRect(4, 8, 3, 24); g.fillRect(35, 8, 3, 24);
    g.fillStyle = '#c98a3b';                     // slung canvas
    g.beginPath();
    g.moveTo(6, 12); g.quadraticCurveTo(21, 30, 36, 12);
    g.quadraticCurveTo(21, 24, 6, 12);
    g.fill();
    g.strokeStyle = '#8a5a24'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(6, 12); g.quadraticCurveTo(21, 30, 36, 12); g.stroke();
  });
}

function shelterSprite(): HTMLCanvasElement {
  return mk(46, 36, g => {
    g.fillStyle = '#6b6156';                     // rock-faced den
    g.beginPath();
    g.moveTo(3, 34); g.lineTo(7, 14); g.lineTo(22, 6); g.lineTo(40, 15); g.lineTo(43, 34);
    g.closePath(); g.fill();
    g.fillStyle = '#847a6d';
    g.beginPath(); g.moveTo(7, 14); g.lineTo(22, 6); g.lineTo(30, 12); g.lineTo(14, 20); g.closePath(); g.fill();
    g.fillStyle = '#1d1a16';                     // dark entrance
    g.beginPath(); g.ellipse(23, 30, 9, 8, 0, Math.PI, 0, true); g.fill();
    g.fillRect(14, 30, 18, 5);
    g.strokeStyle = '#4a443c'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(3, 34); g.lineTo(7, 14); g.lineTo(22, 6); g.lineTo(40, 15); g.lineTo(43, 34);
    g.stroke();
  });
}

function puzzleSprite(): HTMLCanvasElement {
  return mk(30, 34, g => {
    g.fillStyle = '#5d5a56'; g.fillRect(13, 8, 3, 24);      // pole
    g.fillStyle = '#8a6a3a';                                 // hanging feeder ball
    g.beginPath(); g.arc(15, 16, 8, 0, 7); g.fill();
    g.fillStyle = '#5f4622';
    for (const [dx, dy] of [[-3, -2], [3, -3], [0, 3], [-4, 3], [4, 2]]) {
      g.beginPath(); g.arc(15 + dx, 16 + dy, 1.6, 0, 7); g.fill();
    }
    g.fillStyle = '#9acd32';                                 // greens poking out
    g.fillRect(12, 8, 2, 4); g.fillRect(17, 9, 2, 3);
    g.strokeStyle = '#3d3a36'; g.lineWidth = 1;
    g.beginPath(); g.arc(15, 16, 8, 0, 7); g.stroke();
  });
}

function poolSprite(): HTMLCanvasElement {
  return mk(46, 24, g => {
    g.fillStyle = '#8d8d85';                                 // stone rim
    g.beginPath(); g.ellipse(23, 14, 22, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#3d7dbb';
    g.beginPath(); g.ellipse(23, 14, 18, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#5b98d1';
    for (let i = 0; i < 4; i++) g.fillRect(11 + i * 6, 11 + (i % 2) * 4, 8, 1.5);
    g.strokeStyle = '#6b6b63'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(23, 14, 22, 10, 0, 0, 7); g.stroke();
  });
}


// ── natural features the site is born with ─────────────────────────────────
function gumTallSprite(seed: number): HTMLCanvasElement {
  return mk(52, 78, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const lean = (rnd() - 0.5) * 6;
    // pale ribbon-bark trunk, forking near the top the way a gum does
    g.strokeStyle = '#cdc6b4'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(26, 76); g.quadraticCurveTo(26 + lean, 50, 26 + lean * 2, 34); g.stroke();
    g.strokeStyle = '#a89f8c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(27, 76); g.quadraticCurveTo(27 + lean, 50, 27 + lean * 2, 36); g.stroke();
    g.strokeStyle = '#cdc6b4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(26 + lean * 2, 40); g.lineTo(16 + lean, 28); g.stroke();
    g.beginPath(); g.moveTo(26 + lean * 2, 38); g.lineTo(37 + lean, 26); g.stroke();
    // sparse blue-green canopy in clumps, not one solid ball
    const clumps: [number, number, number][] = [
      [26 + lean * 2, 22, 15], [14 + lean, 26, 11], [38 + lean, 24, 12],
      [22 + lean, 12, 10], [33 + lean, 14, 9],
    ];
    for (const [cx, cy, r] of clumps) {
      g.fillStyle = rnd() > 0.5 ? '#5b7f52' : '#6b8f5c';
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    }
    for (const [cx, cy, r] of clumps) {
      g.fillStyle = 'rgba(140,170,120,0.5)';
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.35, r * 0.5, 0, 7); g.fill();
    }
  });
}

function scrubSprite(seed: number): HTMLCanvasElement {
  return mk(34, 26, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 4; i++) {
      const x = 6 + rnd() * 22, y = 14 + rnd() * 8, r = 5 + rnd() * 5;
      g.fillStyle = ['#4c7a45', '#5c8a50', '#41693c'][Math.floor(rnd() * 3)];
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.strokeStyle = '#6b8f5c'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const x = 8 + rnd() * 18;
      g.beginPath(); g.moveTo(x, 22); g.lineTo(x + (rnd() - 0.5) * 6, 8 + rnd() * 6); g.stroke();
    }
  });
}

function sandstoneSprite(seed: number): HTMLCanvasElement {
  return mk(46, 30, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // the warm banded rock the whole harbour is cut from
    const h = 14 + rnd() * 8;
    g.fillStyle = '#c9ab7a';
    g.beginPath();
    g.moveTo(3, 27); g.lineTo(7, 27 - h); g.lineTo(20, 27 - h - 4);
    g.lineTo(36, 27 - h + 2); g.lineTo(42, 27); g.closePath(); g.fill();
    g.fillStyle = '#ddc296';
    g.beginPath();
    g.moveTo(7, 27 - h); g.lineTo(20, 27 - h - 4); g.lineTo(28, 27 - h); g.lineTo(14, 27 - h + 4);
    g.closePath(); g.fill();
    g.strokeStyle = '#a88a5c'; g.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(4, 27 - (h / 3) * i);
      g.lineTo(41, 27 - (h / 3) * i + 2);
      g.stroke();
    }
    g.fillStyle = '#8f7449';
    g.fillRect(3, 26, 39, 2);
  });
}

function banksiaSprite(seed: number): HTMLCanvasElement {
  return mk(28, 30, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    g.strokeStyle = '#7a6a52'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(14, 28); g.lineTo(13, 16); g.stroke();
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 6, y = 10 + rnd() * 5;
      g.fillStyle = '#4e6b46';
      g.beginPath(); g.ellipse(x + 2, y, 6, 5, 0, 0, 7); g.fill();
    }
    g.fillStyle = '#c9a05a';                       // flower spikes
    for (let i = 0; i < 2; i++) g.fillRect(8 + i * 9, 6 + rnd() * 4, 3, 7);
  });
}

function tuftSprite(seed: number): HTMLCanvasElement {
  return mk(26, 16, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    g.strokeStyle = '#9c9155'; g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const x = 5 + rnd() * 16;
      g.beginPath(); g.moveTo(x, 14); g.lineTo(x + (rnd() - 0.5) * 9, 3 + rnd() * 5); g.stroke();
    }
    g.strokeStyle = '#b5a86a'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const x = 7 + rnd() * 12;
      g.beginPath(); g.moveTo(x, 14); g.lineTo(x + (rnd() - 0.5) * 7, 5); g.stroke();
    }
  });
}

function deadTreeSprite(seed: number): HTMLCanvasElement {
  return mk(40, 52, g => {
    let sd = seed;
    const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    g.strokeStyle = '#b6a893'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(20, 50); g.lineTo(19, 22); g.stroke();
    g.lineWidth = 2.5;
    for (const [ex, ey] of [[7, 12], [32, 14], [24, 6], [12, 20]] as [number, number][]) {
      g.beginPath(); g.moveTo(19, 24 + rnd() * 6); g.lineTo(ex, ey); g.stroke();
    }
    g.strokeStyle = '#948671'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(21, 48); g.lineTo(20, 24); g.stroke();
  });
}

function ferrySprite(): HTMLCanvasElement {
  return mk(46, 30, g => {
    g.fillStyle = '#1d4a33';                       // green-and-cream harbour ferry
    g.beginPath();
    g.moveTo(4, 20); g.lineTo(42, 20); g.lineTo(38, 26); g.lineTo(8, 26);
    g.closePath(); g.fill();
    g.fillStyle = '#efe9d8';
    g.fillRect(6, 14, 34, 6);
    g.fillStyle = '#2b6cb0';
    for (let i = 0; i < 6; i++) g.fillRect(9 + i * 5, 16, 3, 3);
    g.fillStyle = '#efe9d8';
    g.fillRect(16, 7, 14, 7);
    g.fillStyle = '#1d4a33';
    g.fillRect(21, 2, 4, 6);
    g.fillStyle = '#c9a227';
    g.fillRect(4, 19, 38, 1);
    g.fillStyle = 'rgba(255,255,255,0.55)';        // wake
    g.fillRect(0, 25, 6, 2);
  });
}

// ── guest amenities and mess ───────────────────────────────────────────────
function benchSprite(): HTMLCanvasElement {
  return mk(30, 20, g => {
    g.fillStyle = '#5f3d1c';
    g.fillRect(4, 12, 3, 7); g.fillRect(23, 12, 3, 7);
    g.fillStyle = '#8a5a2b';
    g.fillRect(2, 10, 26, 3);                    // seat
    g.fillRect(2, 4, 26, 3);                     // backrest
    g.fillStyle = '#a97a45';
    g.fillRect(2, 10, 26, 1);
    g.fillStyle = '#5f3d1c';
    g.fillRect(4, 4, 3, 8); g.fillRect(23, 4, 3, 8);
  });
}

function binSprite(): HTMLCanvasElement {
  return mk(18, 22, g => {
    g.fillStyle = '#3f6b45';
    g.beginPath();
    g.moveTo(4, 20); g.lineTo(3, 6); g.lineTo(15, 6); g.lineTo(14, 20);
    g.closePath(); g.fill();
    g.fillStyle = '#2e5d34';
    g.fillRect(2, 3, 14, 4);
    g.fillStyle = '#1f3f26';
    g.fillRect(6, 4, 6, 2);                      // opening
    g.strokeStyle = '#2a4c30'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(6, 8); g.lineTo(6, 19); g.stroke();
    g.beginPath(); g.moveTo(11, 8); g.lineTo(11, 19); g.stroke();
  });
}

function lampSprite(): HTMLCanvasElement {
  return mk(16, 40, g => {
    g.fillStyle = '#3b3a36';
    g.fillRect(6, 8, 3, 30);
    g.fillRect(3, 37, 9, 3);
    g.fillStyle = '#2b2a27';
    g.beginPath(); g.moveTo(2, 8); g.lineTo(13, 8); g.lineTo(10, 1); g.lineTo(5, 1); g.closePath(); g.fill();
    g.fillStyle = '#ffe9a8';                     // lit globe
    g.fillRect(5, 5, 6, 3);
  });
}

function signSprite(): HTMLCanvasElement {
  return mk(30, 34, g => {
    g.fillStyle = '#5f3d1c';
    g.fillRect(6, 20, 3, 13); g.fillRect(21, 20, 3, 13);
    g.fillStyle = '#e8dcc0';                      // angled interpretive panel
    poly(g, [[3, 20], [27, 20], [25, 4], [5, 4]], '#e8dcc0');
    g.strokeStyle = '#5f3d1c'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(3, 20); g.lineTo(27, 20); g.lineTo(25, 4); g.lineTo(5, 4); g.closePath(); g.stroke();
    g.fillStyle = '#2e5d34';                      // header band
    g.fillRect(6, 5, 18, 4);
    g.fillStyle = '#7aa86a';                      // little species picture
    g.fillRect(7, 11, 8, 7);
    g.fillStyle = '#3f7534'; g.fillRect(7, 15, 8, 3);
    g.fillStyle = '#8a8578';                      // lines of text
    for (let i = 0; i < 4; i++) g.fillRect(17, 11 + i * 2, 7, 1);
  });
}

function podiumSprite(): HTMLCanvasElement {
  return mk(30, 34, g => {
    g.fillStyle = '#7a5230';                      // lectern
    poly(g, [[8, 32], [22, 32], [20, 14], [10, 14]], '#7a5230');
    g.fillStyle = '#8f6538';
    poly(g, [[7, 15], [23, 15], [24, 10], [6, 10]], '#8f6538');
    g.strokeStyle = '#54371f'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(7, 15); g.lineTo(23, 15); g.stroke();
    g.fillStyle = '#2e5d34';                      // Taronga green plate
    g.fillRect(11, 18, 8, 5);
    g.fillStyle = '#3b3a36';                      // microphone
    g.fillRect(19, 4, 1.5, 7);
    g.beginPath(); g.arc(20, 4, 2.2, 0, 7); g.fill();
  });
}

function feederSprite(): HTMLCanvasElement {
  return mk(34, 30, g => {
    g.fillStyle = '#6d7276';                        // steel legs
    g.fillRect(6, 18, 3, 11); g.fillRect(25, 18, 3, 11);
    g.fillStyle = '#9aa0a4';                        // hopper
    poly(g, [[4, 8], [30, 8], [26, 22], [8, 22]], '#9aa0a4');
    g.fillStyle = '#7d8286';
    poly(g, [[8, 22], [26, 22], [24, 26], [10, 26]], '#7d8286');
    g.fillStyle = '#c9a227';                        // feed showing at the lip
    g.fillRect(9, 20, 16, 3);
    g.strokeStyle = '#5b6064'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(4, 8); g.lineTo(30, 8); g.stroke();
    g.fillStyle = '#8a6a3a';
    for (const x of [12, 17, 22]) g.fillRect(x, 5, 2, 4);
  });
}

function browseSprite(): HTMLCanvasElement {
  return mk(30, 34, g => {
    g.fillStyle = '#5f3d1c';                        // A-frame rack
    g.fillRect(6, 10, 3, 22); g.fillRect(21, 10, 3, 22);
    g.fillStyle = '#8a5a2b';
    g.fillRect(4, 8, 22, 3);
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(7, 20); g.lineTo(23, 20); g.stroke();
    // hanging browse
    for (const [x, len] of [[9, 14], [14, 18], [19, 12]] as [number, number][]) {
      g.fillStyle = '#3f7534';
      g.fillRect(x, 11, 3, len);
      g.fillStyle = '#57994a';
      g.fillRect(x - 2, 11 + len - 5, 7, 5);
    }
  });
}

function watererSprite(): HTMLCanvasElement {
  return mk(32, 20, g => {
    g.fillStyle = '#8d8d85';                        // concrete trough
    poly(g, [[3, 10], [29, 10], [26, 18], [6, 18]], '#8d8d85');
    g.fillStyle = '#6f6f68';
    g.fillRect(6, 16, 20, 2);
    g.fillStyle = '#3d7dbb';                        // water
    g.beginPath(); g.ellipse(16, 11, 11, 3.2, 0, 0, 7); g.fill();
    g.fillStyle = '#5b98d1';
    g.fillRect(9, 10, 7, 1.5); g.fillRect(19, 12, 5, 1.5);
    g.strokeStyle = '#6b6b63'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(16, 11, 11, 3.2, 0, 0, 7); g.stroke();
    g.fillStyle = '#9aa0a4';                        // standpipe
    g.fillRect(27, 2, 2, 9);
    g.fillRect(23, 2, 6, 2);
  });
}

function litterSprite(): HTMLCanvasElement {
  return mk(24, 12, g => {
    const bits: [number, number, string][] = [
      [3, 7, '#d8d2c0'], [9, 5, '#c0392b'], [14, 8, '#e8dcc0'],
      [18, 6, '#7f8c8d'], [7, 9, '#c9a227'],
    ];
    for (const [x, y, c] of bits) {
      g.fillStyle = c;
      g.fillRect(x, y, 3, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x, y + 2, 3, 1);
    }
  });
}

// ── shops: little iso huts ─────────────────────────────────────────────────
function shopSprite(def: ShopDef): HTMLCanvasElement {
  return mk(TILE_W, TILE_H + 40, g => {
    const oy = 40;
    const wallL = '#d8c9a8', wallR = '#b3a483';
    // walls: two visible faces of an iso box
    g.fillStyle = wallL;
    g.beginPath(); g.moveTo(8, oy + 8); g.lineTo(32, oy + 20); g.lineTo(32, oy - 8); g.lineTo(8, oy - 20); g.closePath(); g.fill();
    g.fillStyle = wallR;
    g.beginPath(); g.moveTo(32, oy + 20); g.lineTo(56, oy + 8); g.lineTo(56, oy - 20); g.lineTo(32, oy - 8); g.closePath(); g.fill();
    // striped awning roof in shop colour
    const c1 = def.colour, c2 = '#f4f0e4';
    g.beginPath(); g.moveTo(4, oy - 18); g.lineTo(32, oy - 32); g.lineTo(60, oy - 18); g.lineTo(32, oy - 4); g.closePath();
    g.save(); g.clip();
    for (let i = -4; i < 10; i++) {
      g.fillStyle = i % 2 ? c1 : c2;
      g.beginPath();
      g.moveTo(i * 8, oy - 34); g.lineTo(i * 8 + 8, oy - 34); g.lineTo(i * 8 + 36, oy + 2); g.lineTo(i * 8 + 28, oy + 2);
      g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = shade(def.colour, 0.6);
    g.beginPath(); g.moveTo(4, oy - 18); g.lineTo(32, oy - 32); g.lineTo(60, oy - 18); g.lineTo(32, oy - 4); g.closePath(); g.stroke();
    // serving window
    g.fillStyle = '#4a3826';
    g.fillRect(14, oy - 8, 14, 10);
    g.fillStyle = def.colour;
    g.fillRect(14, oy - 10, 14, 3);
    // sign emoji
    g.font = '12px serif';
    g.textAlign = 'center';
    g.fillText(def.emoji, 44, oy - 2);
  });
}

// ── animals ────────────────────────────────────────────────────────────────
// Four body plans, parameterised per species, so a croc and a kangaroo have
// genuinely different silhouettes rather than the same blob with flair on top.
// Everything is drawn facing right; render.ts mirrors for the other direction.

/** Redraw `draw` with a 1px dark outline, the way RCT sprites read at any zoom. */
function outlined(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const pad = 1;
  const W = w + pad * 2, H = h + pad * 2;
  const inner = mk(W, H, g => { g.translate(pad, pad); draw(g); });
  // silhouette of the sprite, flooded with the outline colour
  const halo = mk(W, H, g => {
    g.drawImage(inner, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#1d1409';
    g.fillRect(0, 0, W, H);
  });
  return mk(W, H, g => {
    for (let dx = -pad; dx <= pad; dx++) {
      for (let dy = -pad; dy <= pad; dy++) if (dx || dy) g.drawImage(halo, dx, dy);
    }
    g.drawImage(inner, 0, 0);
  });
}

function ell(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: string, rot = 0) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.6, rx), Math.max(0.6, ry), rot, 0, 7);
  g.fill();
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][], c: string) {
  g.fillStyle = c;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
}

function eye(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#12100c';
  g.fillRect(x, y, 2, 2);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(x, y, 1, 1);
}

function ears(g: CanvasRenderingContext2D, hx: number, hy: number, hr: number, kind: string | undefined, body: string, inner: string) {
  if (!kind) return;
  if (kind === 'big') {                       // koala — oversized round ears
    for (const dx of [-hr * 0.95, hr * 0.55]) {
      ell(g, hx + dx, hy - hr * 0.75, hr * 0.62, hr * 0.62, body);
      ell(g, hx + dx, hy - hr * 0.75, hr * 0.34, hr * 0.34, inner);
    }
  } else if (kind === 'tall') {               // roo / dingo — upright pointed ears
    for (const dx of [-hr * 0.5, hr * 0.35]) {
      poly(g, [[hx + dx - 1.4, hy - hr * 0.5], [hx + dx + 0.4, hy - hr * 2.3], [hx + dx + 1.8, hy - hr * 0.45]], body);
    }
  } else {                                    // wombat — small rounded
    for (const dx of [-hr * 0.55, hr * 0.4]) ell(g, hx + dx, hy - hr * 0.85, hr * 0.4, hr * 0.36, body);
  }
}

function tailOf(g: CanvasRenderingContext2D, kind: string | undefined, bx: number, by: number, L: number, H: number, body: string, accent: string, ringed = false) {
  if (kind === 'brush') {                     // dingo, cats, red panda — fluffy, held low
    const tipX = bx - L * 0.24, tipY = by + H * 0.12;
    g.strokeStyle = body; g.lineWidth = Math.max(2, H * 0.16); g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx - L * 0.16, by - H * 0.2, tipX, tipY); g.stroke();
    if (ringed) {                             // red panda's banded tail
      g.strokeStyle = accent; g.lineWidth = Math.max(1.6, H * 0.13);
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const px2 = bx + (tipX - bx) * t, py = by + (tipY - by) * t - H * 0.1 * Math.sin(t * Math.PI);
        g.beginPath(); g.moveTo(px2 - 1, py); g.lineTo(px2 + 1, py); g.stroke();
      }
    }
  } else if (kind === 'stub') {
    ell(g, bx - 1, by, 2, 1.6, accent);
  }
}


/** Coat markings, clipped to whatever body path is already on the context. */
function markings(g: CanvasRenderingContext2D, d: SpeciesDef, cx: number, cy: number, rx: number, ry: number) {
  if (!d.pattern || d.pattern === 'ringtail') return;
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, 7);
  g.clip();
  if (d.pattern === 'stripes') {
    g.strokeStyle = d.accent;
    g.lineWidth = 2;
    for (let i = -6; i < 7; i++) {
      const x = cx + i * (rx / 3.4);
      g.beginPath();
      g.moveTo(x, cy - ry);
      g.quadraticCurveTo(x + 2, cy, x - 1, cy + ry);
      g.stroke();
    }
  } else if (d.pattern === 'spots') {
    g.fillStyle = d.accent;
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rx * 0.6, cy + Math.sin(a * 1.7) * ry * 0.6, 1.6, 1.4, 0, 0, 7);
      g.fill();
    }
  } else {                                   // giraffe patchwork
    g.fillStyle = d.accent;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.1;
      const px2 = cx + Math.cos(a) * rx * 0.62, py = cy + Math.sin(a * 1.4) * ry * 0.62;
      poly(g, [[px2 - 2.5, py - 2], [px2 + 2.5, py - 2.5], [px2 + 2, py + 2.5], [px2 - 2.5, py + 2]], d.accent);
    }
  }
  g.restore();
}

/** Wombats, koalas, dingoes, big cats, giraffes — four legs under a barrel body. */
function drawQuadruped(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const legLen = H * (d.legs ?? 0.34);
  const bodyRy = ((H - legLen) / 2) * (d.girth ?? 0.95);   // giraffes use a small girth
  const bodyCy = H - legLen - bodyRy;
  const bodyRx = L * 0.32;
  const bodyCx = L * 0.38;
  const hr = H * (d.head ?? 0.27);
  const snout = d.snout ?? 0.5;
  const neckLen = d.neck ?? 1;
  const hx = Math.min(L - hr * (1 + snout * 0.7), bodyCx + bodyRx + hr * 0.55 + (neckLen - 1) * H * 0.06);
  const hy = neckLen > 1 ? H * 0.10 + hr * 0.5 : bodyCy - bodyRy * 0.55;
  const legW = Math.max(2, L * 0.09);
  const swing = frame ? 1 : -1;
  const hipX = bodyCx - bodyRx * 0.62, shoulderX = bodyCx + bodyRx * 0.68;

  // far legs first, in the darker tone, so the barrel reads as being in front
  for (const [lx, sw] of [[hipX - 1, swing], [shoulderX - 1, -swing]] as [number, number][]) {
    g.fillStyle = d.accent;
    g.fillRect(lx - legW / 2, bodyCy, legW, H - bodyCy - Math.max(0, sw));
  }
  tailOf(g, d.tail, bodyCx - bodyRx * 0.95, bodyCy, L, H, d.body, d.accent, d.pattern === 'ringtail');

  // neck bridging body to head, drawn before both so it tucks under
  g.strokeStyle = d.body;
  g.lineWidth = neckLen > 1 ? hr * 1.35 : hr * 1.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(shoulderX, bodyCy - bodyRy * 0.2);
  g.lineTo(hx - hr * 0.2, hy + hr * 0.5);
  g.stroke();
  if (neckLen > 1) {                          // giraffe: patches and a mane run up the neck
    g.strokeStyle = d.accent;
    g.lineWidth = 1.6;
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      g.beginPath();
      g.moveTo(shoulderX + (hx - shoulderX) * t - 1, bodyCy - bodyRy * 0.2 + (hy - bodyCy) * t);
      g.lineTo(shoulderX + (hx - shoulderX) * t + 2, bodyCy - bodyRy * 0.2 + (hy - bodyCy) * t - 2);
      g.stroke();
    }
  }

  ell(g, bodyCx, bodyCy, bodyRx, bodyRy, d.body);
  ell(g, bodyCx - bodyRx * 0.05, bodyCy + bodyRy * 0.45, bodyRx * 0.8, bodyRy * 0.42, d.belly);
  markings(g, d, bodyCx, bodyCy, bodyRx, bodyRy);
  if (d.feature === 'spikes') {
    g.strokeStyle = d.accent;
    g.lineWidth = 1.5;
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      const sx = bodyCx + Math.cos(a) * bodyRx * 0.92, sy = bodyCy + Math.sin(a) * bodyRy * 0.92;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a) * 4, sy + Math.sin(a) * 4);
      g.stroke();
    }
  }

  // near legs, in the body tone with a dark foot
  for (const [lx, sw] of [[hipX + 2, -swing], [shoulderX + 2, swing]] as [number, number][]) {
    g.fillStyle = d.body;
    g.fillRect(lx - legW / 2, bodyCy, legW, H - bodyCy - Math.max(0, sw));
    g.fillStyle = d.accent;
    g.fillRect(lx - legW / 2, H - 2 - Math.max(0, sw), legW, 2);
  }

  if (d.feature === 'trunk') {                // ear first, so the head sits over it
    ell(g, hx - hr * 0.85, hy + hr * 0.15, hr * 0.85, hr * 1.1, d.accent);
  }
  if (d.feature === 'mane') {                 // shaggy ruff drawn behind the head
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      ell(g, hx + Math.cos(a) * hr * 0.95, hy + Math.sin(a) * hr * 0.95, hr * 0.5, hr * 0.5, d.accent);
    }
  }
  ears(g, hx, hy, hr, d.ears, d.body, d.accent);
  ell(g, hx, hy, hr, hr * 0.94, d.body);
  if (d.feature === 'horns') {                // giraffe ossicones
    for (const ox of [-hr * 0.5, hr * 0.4]) {
      g.fillStyle = d.accent;
      g.fillRect(hx + ox, hy - hr * 1.9, 1.6, hr * 1.1);
      ell(g, hx + ox + 0.8, hy - hr * 1.9, 1.6, 1.4, '#3a2a18');
    }
  }
  // tapered muzzle rather than a blob, so dogs read as dogs
  const sl = hr * snout;
  poly(g, [
    [hx + hr * 0.2, hy - hr * 0.35],
    [hx + hr * 0.75 + sl, hy + hr * 0.05],
    [hx + hr * 0.75 + sl, hy + hr * 0.6],
    [hx + hr * 0.1, hy + hr * 0.85],
  ], d.belly);
  g.fillStyle = '#12100c';
  g.fillRect(hx + hr * 0.7 + sl - 1, hy + hr * 0.05, 2, 2);
  eye(g, hx + hr * 0.05, hy - hr * 0.35);
  if (d.feature === 'trunk') {
    // tapered trunk: a few shrinking segments read better than one fat stroke
    g.lineCap = 'round';
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const at = (t: number): [number, number] => {
        const bx = hx + hr * 0.85, by = hy + hr * 0.45;
        const cx2 = hx + hr * 1.9, cy2 = hy + hr * 1.9;
        const ex2 = hx + hr * 1.15, ey2 = H - 2;
        return [
          (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx2 + t * t * ex2,
          (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy2 + t * t * ey2,
        ];
      };
      g.strokeStyle = i > 3 ? d.accent : d.body;
      g.lineWidth = hr * (0.62 - t0 * 0.38);
      const [ax, ay] = at(t0), [bx2, by2] = at(t1);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx2, by2); g.stroke();
    }
    g.fillStyle = '#efe9d2';                  // tusks
    g.fillRect(hx + hr * 0.7, hy + hr * 0.75, hr * 0.7, 1.6);
  }
}

/** Kangaroo — haunches, big feet, thick tail, upright torso. */
function drawHopper(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const lift = frame ? 1.5 : 0;               // mid-hop bob
  const footY = H - 1;
  const haunchCx = L * 0.42, haunchCy = H * 0.60 - lift;
  const hr = H * 0.13;
  const hx = L * 0.82, hy = H * 0.17 - lift;

  // tail first, so it reads as coming out from behind the haunches
  g.strokeStyle = d.accent;
  g.lineWidth = H * 0.13;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(haunchCx - L * 0.10, haunchCy + H * 0.10);
  g.quadraticCurveTo(-L * 0.02, H * 0.80 - lift, -L * 0.03, footY - 1);
  g.stroke();

  // long flat foot, then the shin folding up to the haunch
  poly(g, [[L * 0.26, footY], [L * 0.66, footY], [L * 0.64, footY - 3], [L * 0.28, footY - 3]], d.accent);
  g.strokeStyle = d.body;
  g.lineWidth = H * 0.13;
  g.beginPath();
  g.moveTo(L * 0.33, footY - 2 - lift * 0.4);
  g.lineTo(haunchCx + L * 0.04, haunchCy + H * 0.07);
  g.stroke();

  ell(g, haunchCx, haunchCy, L * 0.22, H * 0.19, d.body);          // haunches

  // slim torso leaning up and forward to the chest
  poly(g, [
    [haunchCx - L * 0.02, haunchCy - H * 0.15],
    [hx - hr * 1.5, hy + hr * 1.6],
    [hx - hr * 0.1, hy + hr * 2.6],
    [haunchCx + L * 0.15, haunchCy + H * 0.06],
  ], d.body);
  ell(g, haunchCx + L * 0.12, haunchCy - H * 0.02, L * 0.10, H * 0.09, d.belly);

  // neck, then a small head carried high
  g.strokeStyle = d.body;
  g.lineWidth = hr * 1.3;
  g.beginPath();
  g.moveTo(hx - hr * 1.4, hy + hr * 2.2);
  g.lineTo(hx - hr * 0.2, hy + hr * 0.7);
  g.stroke();

  // little forepaws tucked at the chest
  g.strokeStyle = d.accent;
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(hx - hr * 1.3, hy + hr * 2.5);
  g.lineTo(hx - hr * 0.2, hy + hr * 3.2 + lift * 0.5);
  g.stroke();

  ears(g, hx, hy, hr, d.ears, d.body, d.accent);
  ell(g, hx, hy, hr * 1.05, hr * 0.95, d.body);
  poly(g, [                                   // long roo muzzle
    [hx + hr * 0.1, hy - hr * 0.4],
    [hx + hr * 1.5, hy + hr * 0.15],
    [hx + hr * 1.5, hy + hr * 0.7],
    [hx, hy + hr * 0.85],
  ], d.belly);
  g.fillStyle = '#12100c';
  g.fillRect(hx + hr * 1.3, hy + hr * 0.15, 2, 2);
  eye(g, hx - hr * 0.05, hy - hr * 0.4);
}

/** Emu and cassowary — tall legs, deep body, long neck. */
function drawRatite(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const legLen = H * 0.42;
  const bodyCy = H - legLen - H * 0.16;
  const bodyRx = L * 0.36, bodyRy = H * 0.19;
  const bodyCx = L * 0.42;
  const swing = frame ? 2 : -2;
  const isCassowary = d.id === 'cassowary';

  // legs, back one darker
  for (const [lx, sw, col] of [
    [bodyCx - 1, -swing, d.accent], [bodyCx + 2.5, swing, isCassowary ? '#8a6a3a' : '#6f6252'],
  ] as [number, number, string][]) {
    g.strokeStyle = col;
    g.lineWidth = Math.max(2, L * 0.09);
    g.beginPath();
    g.moveTo(lx, bodyCy + bodyRy * 0.7);
    g.lineTo(lx + sw * 0.4, H - legLen * 0.45);
    g.lineTo(lx + sw, H - 1);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(lx + sw, H - 1); g.lineTo(lx + sw + 3, H - 1); g.stroke();
  }

  ell(g, bodyCx, bodyCy, bodyRx, bodyRy, d.body);
  ell(g, bodyCx - bodyRx * 0.15, bodyCy + bodyRy * 0.35, bodyRx * 0.7, bodyRy * 0.5, d.belly);
  // shaggy plumage
  g.strokeStyle = d.accent;
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const px2 = bodyCx - bodyRx * 0.7 + i * bodyRx * 0.34;
    g.beginPath();
    g.moveTo(px2, bodyCy - bodyRy * 0.5);
    g.lineTo(px2 - 2, bodyCy + bodyRy * 0.6);
    g.stroke();
  }

  const hx = L * 0.80, hy = H * 0.10;
  g.strokeStyle = isCassowary ? d.accent : d.body;      // neck
  g.lineWidth = Math.max(2.5, L * 0.11);
  g.beginPath();
  g.moveTo(bodyCx + bodyRx * 0.55, bodyCy - bodyRy * 0.55);
  g.quadraticCurveTo(hx - 1, bodyCy - bodyRy * 1.4, hx, hy + 3);
  g.stroke();

  ell(g, hx, hy + 1, L * 0.11, H * 0.06, isCassowary ? '#1c1d22' : d.body);
  if (isCassowary) poly(g, [[hx - 2, hy - 1], [hx, hy - 6], [hx + 2.5, hy - 1]], '#b8843a');  // casque
  poly(g, [[hx + L * 0.08, hy], [hx + L * 0.22, hy + 1.8], [hx + L * 0.08, hy + 3]], '#c9a227');
  eye(g, hx - 0.5, hy - 1);
}

/** Croc and platypus — long, low, splayed. */
function drawSprawler(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const spine = H * 0.42;
  const swing = frame ? 1 : -1;
  const isCroc = d.id === 'croc';

  if (isCroc) {
    // splayed legs
    g.strokeStyle = d.accent;
    g.lineWidth = 2.5;
    for (const [lx, sw] of [[L * 0.30, swing], [L * 0.62, -swing]] as [number, number][]) {
      g.beginPath(); g.moveTo(lx, spine + 2); g.lineTo(lx - 3 + sw, H - 1); g.stroke();
      g.beginPath(); g.moveTo(lx + 4, spine + 2); g.lineTo(lx + 6 - sw, H - 1); g.stroke();
    }
    // body: tail tip → back → snout → belly
    poly(g, [
      [0, H - 2], [L * 0.14, spine - 1], [L * 0.45, spine - 3], [L * 0.70, spine - 2.5],
      [L * 0.80, spine - 3.5], [L, spine - 1.5], [L, spine + 1.5], [L * 0.80, spine + 2],
      [L * 0.68, spine + 3.5], [L * 0.30, spine + 4], [L * 0.12, spine + 2.5],
    ], d.body);
    poly(g, [[L * 0.30, spine + 4], [L * 0.68, spine + 3.5], [L * 0.66, spine + 2], [L * 0.32, spine + 2.5]], d.belly);
    // dorsal scutes
    g.fillStyle = d.accent;
    for (let i = 0; i < 8; i++) {
      const px2 = L * 0.12 + i * L * 0.075;
      g.fillRect(px2, spine - 4 + Math.sin(i) * 0.4, 2, 2);
    }
    // jaw line + eye ridge
    g.strokeStyle = '#2c3d1f';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(L * 0.80, spine + 0.5); g.lineTo(L - 1, spine + 0.8); g.stroke();
    ell(g, L * 0.78, spine - 3.5, 2.2, 1.8, d.body);
    eye(g, L * 0.77, spine - 4.5);
    g.fillStyle = '#efe9d2';                              // teeth
    for (let i = 0; i < 4; i++) g.fillRect(L * 0.84 + i * 3, spine + 0.6, 1, 1.5);
  } else {
    // platypus: unmistakable flat bill and paddle tail
    poly(g, [                                            // paddle tail
      [0, spine], [L * 0.20, spine - 2.5], [L * 0.20, spine + 4], [0, spine + 3.5],
    ], d.accent);
    ell(g, L * 0.48, spine + 0.5, L * 0.30, H * 0.36, d.body);
    ell(g, L * 0.48, spine + 2.2, L * 0.24, H * 0.18, d.belly);
    g.strokeStyle = d.accent;                            // webbed feet
    g.lineWidth = 2.5;
    for (const [lx, sw] of [[L * 0.34, swing], [L * 0.62, -swing]] as [number, number][]) {
      g.beginPath(); g.moveTo(lx, spine + 2); g.lineTo(lx + sw, H - 1); g.stroke();
      g.beginPath(); g.moveTo(lx + sw - 2, H - 1); g.lineTo(lx + sw + 2, H - 1); g.stroke();
    }
    ell(g, L * 0.74, spine - 0.5, L * 0.14, H * 0.28, d.body);    // head
    poly(g, [                                            // duck bill
      [L * 0.80, spine - 2], [L, spine - 2.5], [L, spine + 1.5], [L * 0.80, spine + 2],
    ], d.accent);
    g.strokeStyle = '#8a5a24';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(L * 0.82, spine - 0.3); g.lineTo(L - 1, spine - 0.6); g.stroke();
    eye(g, L * 0.72, spine - 3);
  }
}


/** Chimps and gorillas — knuckle-walkers with heavy shoulders and a low head. */
function drawApe(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const swing = frame ? 1 : -1;
  const hipX = L * 0.26, shX = L * 0.66;
  const backY = H * 0.34;
  const armLen = H * 0.52;

  // far arm and leg
  g.strokeStyle = d.accent;
  g.lineWidth = Math.max(3, L * 0.13);
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(shX - 2, backY + 3); g.lineTo(shX + 1 + swing, H - 2); g.stroke();
  g.beginPath(); g.moveTo(hipX - 1, backY + H * 0.2); g.lineTo(hipX - 3 - swing, H - 2); g.stroke();

  // hunched torso: high shoulders sloping down to the hips
  poly(g, [
    [hipX - L * 0.14, backY + H * 0.10],
    [hipX + L * 0.04, backY - H * 0.04],
    [shX + L * 0.10, backY - H * 0.10],
    [shX + L * 0.16, backY + H * 0.22],
    [hipX - L * 0.06, backY + H * 0.30],
  ], d.body);
  ell(g, (hipX + shX) / 2, backY + H * 0.16, L * 0.16, H * 0.10, d.belly);

  // near arm, long enough to reach the ground
  g.strokeStyle = d.body;
  g.lineWidth = Math.max(3, L * 0.14);
  g.beginPath();
  g.moveTo(shX + 2, backY - H * 0.02);
  g.lineTo(shX + 5 - swing, backY + armLen * 0.6);
  g.lineTo(shX + 3 - swing * 2, H - 2);
  g.stroke();
  // near leg, tucked and bent
  g.beginPath();
  g.moveTo(hipX + 2, backY + H * 0.22);
  g.lineTo(hipX + 1 + swing, H - 2);
  g.stroke();

  const hr = H * 0.17;
  const hx = shX + L * 0.14, hy = backY - H * 0.13;
  ell(g, hx, hy, hr, hr * 1.05, d.body);           // head
  poly(g, [[hx - hr * 0.2, hy - hr], [hx + hr * 0.9, hy - hr * 0.3], [hx + hr * 0.9, hy + hr * 0.7], [hx - hr * 0.3, hy + hr]], d.belly);
  for (const ox of [-hr * 1.05, hr * 0.75]) ell(g, hx + ox, hy - hr * 0.1, hr * 0.42, hr * 0.5, d.body);  // ears
  if (d.id === 'gorilla') poly(g, [[hx - hr * 0.5, hy - hr], [hx + hr * 0.3, hy - hr * 1.7], [hx + hr * 0.7, hy - hr * 0.7]], d.body);  // sagittal crest
  g.fillStyle = '#12100c';
  g.fillRect(hx + hr * 0.55, hy + hr * 0.1, 2, 2);
  eye(g, hx + hr * 0.05, hy - hr * 0.35);
}

/** Sea lion — sleek torpedo, fore-flippers propping the chest up. */
function drawPinniped(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const swing = frame ? 1 : -1;
  const spine = H * 0.58;

  poly(g, [                                        // tail flippers
    [0, spine + 2], [L * 0.13, spine - 1], [L * 0.15, spine + 5], [0, spine + 6],
  ], d.accent);
  // body tapering from a raised chest down to the tail
  poly(g, [
    [L * 0.10, spine + 4], [L * 0.30, spine - 1], [L * 0.58, spine - 5],
    [L * 0.76, spine - 9], [L * 0.86, spine - 8], [L * 0.88, spine - 2],
    [L * 0.66, spine + 3], [L * 0.36, spine + 6],
  ], d.body);
  ell(g, L * 0.46, spine + 2.5, L * 0.20, H * 0.16, d.belly);
  // pale chest running up into the neck, so the head separates from the body
  poly(g, [
    [L * 0.62, spine + 2], [L * 0.80, spine - 7], [L * 0.88, spine - 5], [L * 0.72, spine + 3],
  ], d.belly);
  g.fillStyle = d.accent;                          // fore-flipper
  poly(g, [[L * 0.60, spine - 3], [L * 0.72, spine + 1], [L * 0.60 + swing, H - 1], [L * 0.52, spine + 2]], d.accent);

  const hr = H * 0.21;
  const hx = L * 0.87, hy = spine - 9;
  ell(g, hx, hy, hr, hr * 0.9, d.body);            // head
  poly(g, [[hx + hr * 0.2, hy - hr * 0.4], [hx + hr * 1.6, hy + hr * 0.1], [hx + hr * 1.5, hy + hr * 0.7], [hx, hy + hr * 0.8]], d.body);
  g.fillStyle = '#12100c';
  g.fillRect(hx + hr * 1.35, hy + hr * 0.15, 2, 2);
  g.strokeStyle = '#efe9d2'; g.lineWidth = 0.8;    // whiskers
  for (const dy of [-1, 0.5, 2]) {
    g.beginPath(); g.moveTo(hx + hr * 1.3, hy + hr * 0.4); g.lineTo(hx + hr * 2.2, hy + hr * 0.4 + dy); g.stroke();
  }
  eye(g, hx + hr * 0.15, hy - hr * 0.35);
}

/** Little penguin — upright, flippers at its sides, waddling. */
function drawPenguin(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const lean = frame ? 1 : -1;
  const bodyCx = L * 0.46, bodyCy = H * 0.55;
  const bodyRx = L * 0.36, bodyRy = H * 0.34;

  g.fillStyle = '#d9a13a';                         // feet
  g.fillRect(bodyCx - 4 + lean, H - 2, 5, 2);
  g.fillRect(bodyCx + 1 + lean, H - 2, 5, 2);
  ell(g, bodyCx, bodyCy, bodyRx, bodyRy, d.body);  // back
  ell(g, bodyCx + bodyRx * 0.25, bodyCy + bodyRy * 0.12, bodyRx * 0.62, bodyRy * 0.78, d.belly);
  poly(g, [                                        // flipper
    [bodyCx - bodyRx * 0.5, bodyCy - bodyRy * 0.4],
    [bodyCx - bodyRx * 1.05, bodyCy + bodyRy * 0.5],
    [bodyCx - bodyRx * 0.35, bodyCy + bodyRy * 0.55],
  ], d.accent);

  const hr = L * 0.30;
  const hx = bodyCx + L * 0.10, hy = H * 0.19;
  ell(g, hx, hy, hr, hr * 0.95, d.body);
  ell(g, hx + hr * 0.45, hy + hr * 0.3, hr * 0.55, hr * 0.5, d.belly);   // pale cheek
  poly(g, [[hx + hr * 0.6, hy], [hx + hr * 1.7, hy + hr * 0.35], [hx + hr * 0.6, hy + hr * 0.6]], '#3d3630');
  eye(g, hx + hr * 0.2, hy - hr * 0.25);
}

/** Meerkat — standing on its hind legs on sentry duty. */
function drawUpright(g: CanvasRenderingContext2D, d: SpeciesDef, frame: number) {
  const L = d.artL, H = d.artH;
  const sway = frame ? 0.6 : -0.6;
  const bodyCx = L * 0.44 + sway, bodyCy = H * 0.58;

  g.strokeStyle = d.accent;                        // tail propped behind
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(bodyCx - L * 0.18, bodyCy + H * 0.12);
  g.quadraticCurveTo(-L * 0.05, H * 0.86, L * 0.02, H - 1);
  g.stroke();
  g.fillStyle = d.accent;                          // feet
  g.fillRect(bodyCx - 3, H - 2, 6, 2);
  poly(g, [                                        // upright torso, narrow at the shoulders
    [bodyCx - L * 0.20, H - 2], [bodyCx + L * 0.20, H - 2],
    [bodyCx + L * 0.16, bodyCy - H * 0.16], [bodyCx - L * 0.14, bodyCy - H * 0.16],
  ], d.body);
  ell(g, bodyCx + L * 0.02, bodyCy + H * 0.06, L * 0.16, H * 0.16, d.belly);
  g.strokeStyle = d.body; g.lineWidth = 2;         // little forepaws held together
  g.beginPath();
  g.moveTo(bodyCx + L * 0.10, bodyCy - H * 0.08);
  g.lineTo(bodyCx + L * 0.22, bodyCy + H * 0.04);
  g.stroke();

  const hr = L * 0.30;
  const hx = bodyCx + L * 0.08, hy = H * 0.22;
  for (const ox of [-hr * 0.85, hr * 0.6]) ell(g, hx + ox, hy - hr * 0.5, hr * 0.42, hr * 0.36, d.body);
  ell(g, hx, hy, hr, hr * 0.9, d.body);
  poly(g, [[hx + hr * 0.3, hy - hr * 0.3], [hx + hr * 1.4, hy + hr * 0.2], [hx + hr * 0.3, hy + hr * 0.7]], d.belly);
  g.fillStyle = '#12100c';
  g.fillRect(hx + hr * 1.15, hy + hr * 0.15, 2, 2);
  ell(g, hx + hr * 0.2, hy - hr * 0.25, hr * 0.34, hr * 0.3, '#2a2119');   // dark eye mask
  eye(g, hx + hr * 0.1, hy - hr * 0.3);
}

function animalSprite(def: SpeciesDef, frame: number, young = false): HTMLCanvasElement {
  // juveniles are smaller with proportionally larger heads, which reads as "baby"
  if (young) {
    def = { ...def,
      artL: Math.round(def.artL * 0.58), artH: Math.round(def.artH * 0.6),
      head: (def.head ?? 0.27) * 1.3, neck: def.neck ? def.neck * 0.7 : undefined };
  }
  return outlined(def.artL + 2, def.artH + 1, g => {
    switch (def.art) {
      case 'hopper': return drawHopper(g, def, frame);
      case 'ratite': return drawRatite(g, def, frame);
      case 'sprawler': return drawSprawler(g, def, frame);
      case 'ape': return drawApe(g, def, frame);
      case 'pinniped': return drawPinniped(g, def, frame);
      case 'penguin': return drawPenguin(g, def, frame);
      case 'upright': return drawUpright(g, def, frame);
      default: return drawQuadruped(g, def, frame);
    }
  });
}

// ── people: guests + keeper, 2 walk frames ─────────────────────────────────
function personSprite(shirt: string, pants: string, skin: string, frame: number, hat?: string): HTMLCanvasElement {
  return mk(14, 26, g => {
    const legUp = frame === 1;
    g.fillStyle = pants;                        // legs
    g.fillRect(4, 17, 3, legUp ? 7 : 9);
    g.fillRect(8, 17, 3, legUp ? 9 : 7);
    g.fillStyle = shirt;                        // torso
    g.fillRect(3, 9, 9, 9);
    g.fillStyle = shade(shirt, 0.7);
    g.fillRect(9, 9, 3, 9);
    g.fillStyle = skin;                         // arms
    g.fillRect(1, 10, 2, 6);
    g.fillRect(12, 10, 2, 6);
    g.fillStyle = skin;                         // head
    g.fillRect(4, 2, 7, 7);
    g.fillStyle = '#111';                       // eyes
    g.fillRect(6, 4, 1, 2);
    g.fillRect(9, 4, 1, 2);
    if (hat) {
      g.fillStyle = hat;
      g.fillRect(3, 0, 9, 3);
      g.fillRect(2, 2, 11, 2);
    }
  });
}

// ── guest transport ───────────────────────────────────────────────────────
function stationSprite(def: TransportDef): HTMLCanvasElement {
  const H = def.elevated ? 62 : 42;
  return mk(TILE_W, TILE_H + H, g => {
    const oy = H;
    const deck = def.elevated ? oy - 26 : oy - 4;
    if (def.elevated) {
      g.fillStyle = '#8a8f94';                     // pylons up to the platform
      g.fillRect(20, deck, 6, oy - deck);
      g.fillRect(TILE_W - 26, deck, 6, oy - deck);
      g.fillStyle = '#6d7276';
      g.fillRect(24, deck, 2, oy - deck);
    }
    g.fillStyle = '#b8bdc2';                       // platform deck
    poly(g, [[6, deck], [TILE_W - 6, deck], [TILE_W - 12, deck + 8], [12, deck + 8]], '#b8bdc2');
    g.fillStyle = '#8a8f94';
    g.fillRect(12, deck + 7, TILE_W - 24, 2);
    // canopy in the ride's colour
    g.fillStyle = def.colour;
    poly(g, [[4, deck - 20], [TILE_W - 4, deck - 20], [TILE_W - 10, deck - 15], [10, deck - 15]], def.colour);
    g.fillStyle = shade(def.colour, 0.7);
    g.fillRect(10, deck - 16, TILE_W - 20, 2);
    g.fillStyle = '#6d7276';                       // canopy posts
    g.fillRect(12, deck - 15, 3, 15);
    g.fillRect(TILE_W - 15, deck - 15, 3, 15);
    // small sign
    g.fillStyle = '#2e5d34';
    g.fillRect(TILE_W / 2 - 11, deck - 30, 22, 9);
    g.fillStyle = '#ffd75e';
    g.font = 'bold 8px monospace';
    g.textAlign = 'center';
    g.fillText(def.emoji === '🚂' ? 'TRAIN' : def.emoji === '🚝' ? 'RAIL' : def.emoji === '🚠' ? 'CABLE' : 'SAFARI',
      TILE_W / 2, deck - 23);
  });
}

function vehicleSprite(def: TransportDef): HTMLCanvasElement {
  return mk(40, 30, g => {
    const c = def.colour, dark = shade(def.colour, 0.65);
    if (def.id === 'cablecar') {
      g.strokeStyle = '#5b6064'; g.lineWidth = 2;   // hanger arm
      g.beginPath(); g.moveTo(20, 0); g.lineTo(20, 9); g.stroke();
      g.fillStyle = c;
      poly(g, [[8, 9], [32, 9], [30, 26], [10, 26]], c);
      g.fillStyle = '#bfe3f2';                      // glass
      g.fillRect(12, 13, 16, 8);
      g.fillStyle = dark; g.fillRect(8, 9, 24, 2);
    } else if (def.id === 'safari') {
      g.fillStyle = '#3b3a36';                      // wheels
      g.fillRect(9, 22, 6, 5); g.fillRect(26, 22, 6, 5);
      g.fillStyle = c;
      poly(g, [[6, 12], [34, 12], [34, 23], [6, 23]], c);
      g.fillStyle = dark; g.fillRect(6, 20, 28, 3);
      g.fillStyle = '#6b4a2b';                      // canvas roof
      poly(g, [[8, 6], [32, 6], [34, 12], [6, 12]], '#6b4a2b');
      g.fillStyle = '#c9b28a';                      // passengers
      for (const x of [12, 19, 26]) g.fillRect(x, 13, 4, 5);
    } else {
      // monorail / train carriage
      g.fillStyle = c;
      poly(g, [[5, 10], [35, 10], [35, 24], [5, 24]], c);
      g.fillStyle = dark;
      g.fillRect(5, 21, 30, 3);
      g.fillStyle = '#bfe3f2';                      // windows
      for (const x of [9, 17, 25]) g.fillRect(x, 13, 6, 6);
      if (def.id === 'train') {
        g.fillStyle = '#3b3a36';
        g.fillRect(8, 24, 5, 4); g.fillRect(27, 24, 5, 4);
        g.fillStyle = dark; g.fillRect(30, 4, 5, 7);   // funnel
      } else {
        g.fillStyle = shade(def.colour, 1.15);
        g.fillRect(5, 10, 30, 2);
      }
    }
  });
}

// ── the heritage road entrance ────────────────────────────────────────────
// Modelled on Taronga's 1916 gatehouse: cream rendered walls, terracotta hipped
// roofs, a green faience frieze, arched carriageways and the copper dome.
function heritageGateSprite(): HTMLCanvasElement {
  const W = 208, H = 156;
  return mk(W, H, g => {
    const ground = H - 4;
    const CREAM = '#e7ddc4', CREAM_HI = '#f4ecd9', CREAM_SH = '#cabf9f';
    const TILE = '#bf5330', TILE_HI = '#d46b40', TILE_SH = '#984024';
    const GREEN = '#4a7c59', GREEN_HI = '#6fa87c';
    const DARK = '#372f26', TRIM = '#d9cfb4';

    const hipRoof = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = TILE;
      g.beginPath();
      g.moveTo(x, y + h); g.lineTo(x + w, y + h);
      g.lineTo(x + w - h * 0.9, y); g.lineTo(x + h * 0.9, y);
      g.closePath(); g.fill();
      g.fillStyle = TILE_HI;
      g.fillRect(x + h * 0.9, y, w - h * 1.8, 2);
      g.strokeStyle = TILE_SH; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        g.beginPath();
        g.moveTo(x + w * t, y + h);
        g.lineTo(x + h * 0.9 + (w - h * 1.8) * t, y);
        g.stroke();
      }
      g.fillStyle = TILE_SH;
      g.fillRect(x - 2, y + h, w + 4, 3);            // eaves
    };

    const archway = (cx: number, top: number, w: number, h: number) => {
      g.fillStyle = TRIM;                            // rendered surround
      g.beginPath();
      g.moveTo(cx - w / 2 - 4, ground);
      g.lineTo(cx - w / 2 - 4, top + w / 2);
      g.arc(cx, top + w / 2, w / 2 + 4, Math.PI, 0);
      g.lineTo(cx + w / 2 + 4, ground);
      g.closePath(); g.fill();
      g.fillStyle = DARK;                            // the opening itself
      g.beginPath();
      g.moveTo(cx - w / 2, ground);
      g.lineTo(cx - w / 2, top + w / 2);
      g.arc(cx, top + w / 2, w / 2, Math.PI, 0);
      g.lineTo(cx + w / 2, ground);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)';        // daylight through the far side
      g.fillRect(cx - w / 2 + 2, ground - h * 0.45, w - 4, h * 0.45);
      g.fillStyle = CREAM_SH;                        // keystone
      g.fillRect(cx - 3, top + 1, 6, 7);
    };

    // ── left wing ──
    g.fillStyle = CREAM; g.fillRect(6, 104, 56, ground - 104);
    g.fillStyle = CREAM_HI; g.fillRect(6, 104, 56, 2);
    hipRoof(4, 92, 60, 13);
    g.fillStyle = TRIM;                              // arched window
    g.beginPath(); g.arc(26, 122, 8, Math.PI, 0); g.fill();
    g.fillRect(18, 122, 16, 20);
    g.fillStyle = '#5b7fa0';
    g.beginPath(); g.arc(26, 123, 6, Math.PI, 0); g.fill();
    g.fillRect(20, 123, 12, 17);
    g.strokeStyle = TRIM; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(26, 118); g.lineTo(26, 140); g.stroke();

    // ── central block ──
    g.fillStyle = CREAM; g.fillRect(60, 60, 84, ground - 60);
    g.fillStyle = CREAM_HI; g.fillRect(60, 60, 84, 3);
    g.fillStyle = CREAM_SH; g.fillRect(136, 60, 8, ground - 60);
    // parapet with corner piers
    g.fillStyle = TRIM; g.fillRect(58, 56, 88, 6);
    for (const px of [58, 138]) { g.fillStyle = CREAM; g.fillRect(px, 44, 8, 18); g.fillStyle = TRIM; g.fillRect(px - 1, 42, 10, 4); }
    // green faience frieze
    g.fillStyle = GREEN; g.fillRect(64, 86, 76, 12);
    g.fillStyle = GREEN_HI;
    for (let i = 0; i < 9; i++) g.fillRect(68 + i * 8, 89, 4, 6);
    g.fillStyle = '#ffd75e';
    g.font = 'bold 7px monospace'; g.textAlign = 'center';
    g.fillText('TARONGA', 102, 96);
    // main carriageway
    archway(102, 104, 30, 44);
    g.fillStyle = TRIM;                              // steps
    g.fillRect(84, ground - 6, 36, 3);
    g.fillRect(80, ground - 3, 44, 3);
    // flanking arched windows
    for (const wx of [72, 132]) {
      g.fillStyle = TRIM;
      g.beginPath(); g.arc(wx, 112, 6, Math.PI, 0); g.fill();
      g.fillRect(wx - 6, 112, 12, 16);
      g.fillStyle = '#5b7fa0';
      g.beginPath(); g.arc(wx, 113, 4.5, Math.PI, 0); g.fill();
      g.fillRect(wx - 4.5, 113, 9, 13);
    }
    // roundel medallions either side of the drum
    for (const rx of [76, 128]) {
      g.fillStyle = TRIM; g.beginPath(); g.arc(rx, 72, 7, 0, 7); g.fill();
      g.fillStyle = GREEN; g.beginPath(); g.arc(rx, 72, 4, 0, 7); g.fill();
    }

    // ── octagonal drum and dome ──
    g.fillStyle = CREAM; g.fillRect(80, 26, 44, 32);
    g.fillStyle = CREAM_HI; g.fillRect(80, 26, 44, 2);
    g.fillStyle = CREAM_SH; g.fillRect(116, 26, 8, 32);
    g.fillStyle = TRIM; g.fillRect(78, 22, 48, 5);
    for (const wx of [90, 102, 114]) {               // drum windows
      g.fillStyle = '#5b7fa0';
      g.beginPath(); g.arc(wx, 40, 3.5, Math.PI, 0); g.fill();
      g.fillRect(wx - 3.5, 40, 7, 10);
      g.strokeStyle = TRIM; g.lineWidth = 1;
      g.strokeRect(wx - 3.5, 34, 7, 16);
    }
    g.fillStyle = GREEN;                             // patina ring under the dome
    g.fillRect(76, 18, 52, 5);
    g.fillStyle = GREEN_HI; g.fillRect(76, 18, 52, 2);
    g.fillStyle = '#6b3f33';                         // the dome
    g.beginPath(); g.ellipse(102, 19, 26, 16, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#8a5646';
    g.beginPath(); g.ellipse(96, 19, 14, 12, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#4a7c59';
    g.beginPath(); g.ellipse(102, 19, 26, 16, 0, Math.PI * 1.02, Math.PI * 1.12); g.fill();
    g.fillStyle = '#c9a227';                         // finial
    g.fillRect(101, 0, 2, 6);
    g.beginPath(); g.arc(102, 1, 2.5, 0, 7); g.fill();

    // ── right pavilion with its own carriageway ──
    g.fillStyle = CREAM; g.fillRect(146, 100, 54, ground - 100);
    g.fillStyle = CREAM_HI; g.fillRect(146, 100, 54, 2);
    hipRoof(144, 88, 58, 13);
    g.fillStyle = TRIM;                              // scrolled pediment
    g.beginPath();
    g.moveTo(150, 100); g.quadraticCurveTo(173, 78, 196, 100);
    g.closePath(); g.fill();
    g.fillStyle = GREEN;
    g.beginPath(); g.arc(173, 94, 6, Math.PI, 0); g.fill();
    archway(173, 108, 26, 40);

    // flagpole
    g.fillStyle = '#cfc7b4'; g.fillRect(202, 30, 2, 66);
    g.fillStyle = '#e8e2d0'; g.fillRect(199, 28, 8, 3);
  });
}

// ── entrance arch ──────────────────────────────────────────────────────────
function entranceSprite(): HTMLCanvasElement {
  return mk(TILE_W, TILE_H + 56, g => {
    const oy = 56;
    const wood = '#7a5230', dark = '#54371f';
    g.fillStyle = wood;                          // pillars
    g.fillRect(2, oy - 30, 10, TILE_H + 28);
    g.fillRect(TILE_W - 12, oy - 30, 10, TILE_H + 28);
    g.fillStyle = dark;
    g.fillRect(9, oy - 30, 3, TILE_H + 28);
    g.fillRect(TILE_W - 5, oy - 30, 3, TILE_H + 28);
    g.fillStyle = '#2e5d34';                     // banner
    g.fillRect(0, oy - 46, TILE_W, 20);
    g.strokeStyle = dark;
    g.strokeRect(0, oy - 46, TILE_W, 20);
    g.fillStyle = '#ffd75e';
    g.font = 'bold 9px monospace';
    g.textAlign = 'center';
    g.fillText('TARONGA', TILE_W / 2, oy - 37);
    g.fillText('TYCOON', TILE_W / 2, oy - 28);
  });
}

// food trough placed by keepers
function troughSprite(): HTMLCanvasElement {
  return mk(28, 16, g => {
    g.fillStyle = '#6b4a2b';
    g.fillRect(2, 6, 24, 8);
    g.fillStyle = '#54371f';
    g.fillRect(2, 6, 24, 3);
    g.fillStyle = '#9acd32';
    g.fillRect(5, 4, 18, 4);
  });
}

export const GUEST_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#2ecc71'];
export const GUEST_SKINS = ['#f0c8a0', '#d9a06b', '#a5683c', '#7c4a26'];

function shadeOf(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

/**
 * Repaint the ground tiles for a site. Dubbo's red earth is the same tile
 * generator with a different palette rather than a second set of sprites.
 */
export function setSitePalette(site: SiteId) {
  const p = siteDef(site).palette;
  cache.set('grass', terrainTile(p.grass, shadeOf(p.grass, 0.9), shadeOf(p.grass, 1.12), 7));
  cache.set('sand', terrainTile(p.sand, shadeOf(p.sand, 0.9), shadeOf(p.sand, 1.1), 13));
  cache.set('dirt', terrainTile(p.dirt, shadeOf(p.dirt, 0.88), shadeOf(p.dirt, 1.14), 21));
  for (let d = 1; d <= 3; d++) {
    for (let f = 0; f < 3; f++) cache.set(`water${d}_${f}`, waterTile(f, p.water, d));
  }
}

export function buildSprites() {
  setSitePalette('taronga');
  cache.set('path', pathTile());
  for (const b of BARRIERS) {
    for (let d = 0; d < 4; d++) {
      cache.set(`wall_${b.id}_${d}`, barrierSprite(b, d));
      cache.set(`gate_${b.id}_${d}`, gateSprite(b, d));
    }
  }
  cache.set('tree', treeSprite());
  cache.set('bush', bushSprite());
  cache.set('rock', rockSprite());
  cache.set('flowers', flowerSprite());
  cache.set('climb', climbSprite());
  cache.set('logs', logsSprite());
  cache.set('hammock', hammockSprite());
  cache.set('shelter', shelterSprite());
  cache.set('puzzle', puzzleSprite());
  cache.set('pool', poolSprite());
  cache.set('bench', benchSprite());
  cache.set('bin', binSprite());
  cache.set('lamp', lampSprite());
  cache.set('sign', signSprite());
  cache.set('podium', podiumSprite());
  cache.set('feeder', feederSprite());
  cache.set('browse', browseSprite());
  cache.set('waterer', watererSprite());
  cache.set('litter', litterSprite());
  for (let i = 0; i < 3; i++) {
    cache.set('nat_gum_' + i, gumTallSprite(11 + i * 7));
    cache.set('nat_scrub_' + i, scrubSprite(23 + i * 5));
    cache.set('nat_sandstone_' + i, sandstoneSprite(31 + i * 9));
    cache.set('nat_banksia_' + i, banksiaSprite(43 + i * 3));
    cache.set('nat_grasstuft_' + i, tuftSprite(53 + i * 11));
    cache.set('nat_deadtree_' + i, deadTreeSprite(67 + i * 13));
  }
  cache.set('ferry', ferrySprite());
  cache.set('entrance', entranceSprite());
  cache.set('entrance_gate', heritageGateSprite());
  cache.set('trough', troughSprite());
  for (const s of SHOPS) cache.set('shop_' + s.id, shopSprite(s));
  for (const t of TRANSPORT) {
    cache.set('station_' + t.id, stationSprite(t));
    cache.set('vehicle_' + t.id, vehicleSprite(t));
  }
  for (const sp of SPECIES) {
    cache.set(`animal_${sp.id}_0`, animalSprite(sp, 0));
    cache.set(`animal_${sp.id}_1`, animalSprite(sp, 1));
    cache.set(`animal_${sp.id}_0_y`, animalSprite(sp, 0, true));
    cache.set(`animal_${sp.id}_1_y`, animalSprite(sp, 1, true));
  }
  // pre-render guest variants (shirt x skin x frame) and keeper
  for (let sh = 0; sh < GUEST_SHIRTS.length; sh++) {
    for (let sk = 0; sk < GUEST_SKINS.length; sk++) {
      cache.set(`guest_${sh}_${sk}_0`, personSprite(GUEST_SHIRTS[sh], '#34495e', GUEST_SKINS[sk], 0));
      cache.set(`guest_${sh}_${sk}_1`, personSprite(GUEST_SHIRTS[sh], '#34495e', GUEST_SKINS[sk], 1));
    }
  }
  cache.set('keeper_0', personSprite('#2e5d34', '#6b4a2b', '#e8b88a', 0, '#c9a227'));
  cache.set('keeper_1', personSprite('#2e5d34', '#6b4a2b', '#e8b88a', 1, '#c9a227'));
  cache.set('caretaker_0', personSprite('#e07b39', '#4a4f57', '#d9a06b', 0, '#f0f0f0'));
  cache.set('caretaker_1', personSprite('#e07b39', '#4a4f57', '#d9a06b', 1, '#f0f0f0'));
  cache.set('vet_0', personSprite('#f2f2f2', '#3f5a8a', '#f0c8a0', 0, '#2b6cb0'));
  cache.set('vet_1', personSprite('#f2f2f2', '#3f5a8a', '#f0c8a0', 1, '#2b6cb0'));
  cache.set('educator_0', personSprite('#8e44ad', '#2f2f38', '#c98a5a', 0, '#ffd75e'));
  cache.set('educator_1', personSprite('#8e44ad', '#2f2f38', '#c98a5a', 1, '#ffd75e'));
}
