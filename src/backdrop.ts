// ── Landmarks ──────────────────────────────────────────────────────────────
// The skyline is placed *in the world*, across the water at the far edge of the
// map, rather than painted as a screen-space band. A band gets completely
// covered by the map's own tiles as soon as you look inland; putting the bridge
// and the Opera House on real tiles means they sit across the harbour from the
// zoo and turn with the camera, which is how they actually behave.
import { SiteId } from './data';

const cache = new Map<string, HTMLCanvasElement>();

function mk(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  return c;
}

/** Where a landmark sits: tile x, tile y, sprite key. */
export interface Landmark { x: number; y: number; key: string }

function harbourBridge(): HTMLCanvasElement {
  const W = 460, H = 190;
  return mk(W, H, g => {
    const deck = H - 34;
    const bx = 30, bw = W - 60;

    g.strokeStyle = '#6f7a86';                    // the arch, outer chord
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(bx, deck);
    g.quadraticCurveTo(bx + bw / 2, deck - 150, bx + bw, deck);
    g.stroke();
    g.strokeStyle = '#8d97a3';                    // inner chord catching the light
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(bx, deck);
    g.quadraticCurveTo(bx + bw / 2, deck - 140, bx + bw, deck);
    g.stroke();

    g.strokeStyle = 'rgba(96,106,118,0.9)';       // hangers down to the deck
    g.lineWidth = 2.5;
    for (let i = 1; i < 18; i++) {
      const t = i / 18;
      const ax = bx + bw * t;
      const ay = deck - 150 * 4 * t * (1 - t) * 0.96;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, deck); g.stroke();
    }

    g.fillStyle = '#5f6873';                      // roadway
    g.fillRect(0, deck, W, 11);
    g.fillStyle = '#77818c';
    g.fillRect(0, deck, W, 3);

    for (const px of [bx - 16, bx + 16, bx + bw - 30, bx + bw + 2]) {
      g.fillStyle = '#9a8f7d';                    // sandstone pylons
      g.fillRect(px, deck - 54, 17, 65);
      g.fillStyle = '#b3a894';
      g.fillRect(px, deck - 54, 6, 65);
      g.fillStyle = '#877d6c';
      g.fillRect(px - 2, deck - 58, 21, 5);
    }
    g.fillStyle = 'rgba(40,60,80,0.25)';          // shadow on the water
    g.fillRect(0, deck + 11, W, 5);
  });
}

function operaHouse(): HTMLCanvasElement {
  const W = 240, H = 120;
  return mk(W, H, g => {
    const base = H - 14;
    g.fillStyle = '#b9ae97';                      // podium
    g.fillRect(6, base, W - 12, 12);
    g.fillStyle = '#a2977f';
    g.fillRect(6, base + 8, W - 12, 4);

    const shells: [number, number, number][] = [
      [16, 46, 64], [58, 66, 78], [116, 52, 60], [162, 38, 46], [196, 26, 34],
    ];
    for (const [sx, sh, sw] of shells) {
      g.fillStyle = '#f2eee2';
      g.beginPath();
      g.moveTo(sx, base);
      g.quadraticCurveTo(sx + sw * 0.12, base - sh * 1.55, sx + sw, base);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(186,178,160,0.6)';      // shaded flank
      g.beginPath();
      g.moveTo(sx + sw * 0.58, base);
      g.quadraticCurveTo(sx + sw * 0.52, base - sh * 0.72, sx + sw, base);
      g.closePath();
      g.fill();
      g.strokeStyle = '#cdc5b1';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx, base);
      g.quadraticCurveTo(sx + sw * 0.12, base - sh * 1.55, sx + sw, base);
      g.stroke();
    }
  });
}

/**
 * A stretch of CBD. Blocks are drawn to butt up against each other so a run of
 * them reads as one continuous skyline rather than separate clumps, with the
 * towers stepping up toward the middle of the city the way Sydney's do.
 */
function cityBlock(seed: number, peak: number): HTMLCanvasElement {
  const W = 260, H = 250;
  return mk(W, H, g => {
    const base = H - 10;
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    // two ranks: a hazier back rank, then the front rank over it
    for (const rank of [0, 1]) {
      let x = -10;
      while (x < W + 6) {
        const w = 13 + Math.floor(rnd() * 26);
        // height swells toward `peak` (0..1 across the whole city)
        const lean = 1 - Math.abs((x / W) - peak) * 1.15;
        const h = (rank ? 34 : 26) + Math.floor(rnd() * 60) + Math.max(0, lean) * (rank ? 120 : 80);
        const cool = rnd();
        g.fillStyle = rank
          ? (cool > 0.62 ? '#8fa4bb' : cool > 0.3 ? '#7d93ac' : '#93a9bd')
          : '#9db2c6';
        g.fillRect(x, base - h, w, h);
        g.fillStyle = rank ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)';
        g.fillRect(x, base - h, Math.max(2, w * 0.28), h);
        g.fillStyle = 'rgba(70,92,118,0.30)';                 // shaded flank
        g.fillRect(x + w - Math.max(2, w * 0.2), base - h, Math.max(2, w * 0.2), h);
        if (rank) {
          if (rnd() > 0.66) {                                  // stepped crown
            g.fillStyle = '#8fa4bb';
            g.fillRect(x + w * 0.2, base - h - 8, w * 0.6, 8);
          }
          g.fillStyle = 'rgba(226,238,250,0.5)';               // glazing bands
          for (let wy = base - h + 7; wy < base - 6; wy += 9) {
            if (rnd() > 0.35) g.fillRect(x + 2, wy, w - 4, 2);
          }
        }
        x += w + (rank ? 2 : 5);
      }
    }
    // haze the base so the city sits back behind the water
    const haze = g.createLinearGradient(0, base - 60, 0, base);
    haze.addColorStop(0, 'rgba(200,222,240,0)');
    haze.addColorStop(1, 'rgba(200,222,240,0.45)');
    g.fillStyle = haze;
    g.fillRect(0, base - 60, W, 60);
    g.fillStyle = 'rgba(40,60,80,0.18)';
    g.fillRect(0, base, W, 10);
  });
}

/** Sydney Tower — the one silhouette that names the skyline. */
function sydneyTower(): HTMLCanvasElement {
  return mk(60, 280, g => {
    const base = 272;
    g.fillStyle = '#9db2c6';                                    // podium block
    g.fillRect(16, base - 78, 28, 78);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(16, base - 78, 8, 78);
    g.fillStyle = '#aebfd0';                                    // shaft
    g.fillRect(26, base - 216, 9, 140);
    g.fillStyle = '#c3d2e0';
    g.fillRect(26, base - 216, 3, 140);
    g.fillStyle = '#c9a227';                                    // golden turret
    g.beginPath();
    g.moveTo(15, base - 216); g.lineTo(45, base - 216);
    g.lineTo(41, base - 240); g.lineTo(19, base - 240);
    g.closePath(); g.fill();
    g.fillStyle = '#e8c65a';
    g.fillRect(19, base - 238, 22, 4);
    g.fillStyle = '#b08c1e';
    g.fillRect(15, base - 218, 30, 3);
    g.fillStyle = '#aebfd0';                                    // spire
    g.fillRect(29, base - 274, 3, 36);
    g.fillStyle = '#e8eef5';
    g.fillRect(29, base - 278, 3, 6);
  });
}

/** A moored yacht. Tiny, but they are all over the water in every photo. */
function yacht(seed: number): HTMLCanvasElement {
  return mk(26, 34, g => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const lean = rnd() > 0.5 ? 1 : -1;
    g.strokeStyle = '#cfd8de';                                  // mast
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(13, 28); g.lineTo(13 + lean, 6); g.stroke();
    g.fillStyle = rnd() > 0.4 ? '#f4f4ef' : '#e6ecd8';          // sail
    g.beginPath();
    g.moveTo(13 + lean, 7);
    g.lineTo(13 + lean * 10, 26);
    g.lineTo(13, 26);
    g.closePath(); g.fill();
    g.fillStyle = '#eef1f2';                                    // hull
    g.beginPath();
    g.moveTo(4, 27); g.lineTo(22, 27); g.lineTo(19, 31); g.lineTo(7, 31);
    g.closePath(); g.fill();
    g.fillStyle = '#38506a';
    g.fillRect(4, 27, 18, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(3, 31, 20, 1);
  });
}

function ranges(): HTMLCanvasElement {
  const W = 420, H = 120;
  return mk(W, H, g => {
    const base = H - 10;
    g.fillStyle = '#8d7b73';                      // far ridge
    g.beginPath();
    g.moveTo(0, base);
    for (let x = 0; x <= W; x += 26) g.lineTo(x, base - 46 - Math.sin(x * 0.017) * 22 - Math.sin(x * 0.006) * 14);
    g.lineTo(W, base);
    g.closePath();
    g.fill();
    g.fillStyle = '#a08877';                      // near ridge
    g.beginPath();
    g.moveTo(0, base);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, base - 22 - Math.sin(x * 0.021 + 1.6) * 13);
    g.lineTo(W, base);
    g.closePath();
    g.fill();
    g.fillStyle = '#6c7a48';                      // scrub along the base
    for (let x = 0; x < W; x += 9) {
      const h = 5 + ((x * 7919) % 10);
      g.fillRect(x, base - h, 6, h);
    }
    g.fillStyle = '#8f5330';
    g.fillRect(0, base, W, 10);
  });
}

function windmill(): HTMLCanvasElement {
  return mk(70, 130, g => {
    g.strokeStyle = '#5f5a52';                    // lattice tower
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(24, 128); g.lineTo(33, 46); g.stroke();
    g.beginPath(); g.moveTo(48, 128); g.lineTo(39, 46); g.stroke();
    g.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      g.beginPath();
      g.moveTo(24 + 9 * t, 128 - 82 * t);
      g.lineTo(48 - 9 * t, 128 - 82 * t);
      g.stroke();
    }
    g.fillStyle = '#9aa0a4';                      // fan
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(36, 34);
      g.rotate(a);
      g.fillRect(4, -2, 15, 4);
      g.restore();
    }
    g.fillStyle = '#5f5a52';
    g.beginPath(); g.arc(36, 34, 5, 0, 7); g.fill();
    g.fillRect(36, 30, 22, 3);
  });
}

export function buildLandmarks() {
  cache.set('lm_bridge', harbourBridge());
  cache.set('lm_opera', operaHouse());
  for (let i = 0; i < 6; i++) cache.set('lm_city_' + i, cityBlock(5 + i * 23, i / 5));
  cache.set('lm_tower', sydneyTower());
  for (let i = 0; i < 3; i++) cache.set('lm_yacht_' + i, yacht(11 + i * 7));
  cache.set('lm_ranges', ranges());
  cache.set('lm_windmill', windmill());
}

export function landmarkSprite(key: string): HTMLCanvasElement | null {
  return cache.get(key) ?? null;
}

/**
 * Where each site's landmarks sit. Sydney's are strung along the far shore of
 * the harbour; Dubbo gets ranges on the skyline and a windmill out in the paddock.
 */
export function landmarksFor(site: SiteId): Landmark[] {
  if (site === 'taronga') {
    // The city runs as one continuous band across the far shore, tallest in the
    // middle, with the tower, the Opera House and the bridge set into it.
    const out: Landmark[] = [];
    for (let i = 0; i < 6; i++) out.push({ x: 6 + i * 8, y: 5, key: 'lm_city_' + i });
    out.push({ x: 30, y: 4, key: 'lm_tower' });
    out.push({ x: 50, y: 10, key: 'lm_opera' });
    out.push({ x: 65, y: 4, key: 'lm_bridge' });
    for (let i = 0; i < 4; i++) out.push({ x: 12 + i * 6, y: 14 + (i % 2) * 2, key: 'lm_yacht_' + (i % 3) });
    for (let i = 0; i < 4; i++) out.push({ x: 56 + i * 7, y: 13 + (i % 2) * 3, key: 'lm_yacht_' + ((i + 1) % 3) });
    return out;
  }
  return [
    { x: 8,  y: 3,  key: 'lm_ranges' }, { x: 30, y: 2, key: 'lm_ranges' },
    { x: 52, y: 3,  key: 'lm_ranges' }, { x: 74, y: 4, key: 'lm_ranges' },
    { x: 90, y: 3,  key: 'lm_ranges' },
    { x: 16, y: 12, key: 'lm_windmill' }, { x: 76, y: 14, key: 'lm_windmill' },
  ];
}

/** Sky colours behind each site. */
export const SKY: Record<string, [string, string]> = {
  sydney: ['#6fa9d8', '#cfe4f2'],
  plains: ['#7fb0d4', '#f2dcb6'],
};
