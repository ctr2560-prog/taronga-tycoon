// ── UI icons ───────────────────────────────────────────────────────────────
// Hand-drawn pixel icons instead of emoji: emoji render differently on every
// platform, sit on their own baseline, and clash with the pixel art. Each icon
// is a list of rectangles on a 16x16 grid, rasterised once at 2x into a data
// URL so it can be dropped straight into button markup.
import { sprite } from './sprites';

const C = {
  ink: '#2b2417', wood: '#7a5230', woodL: '#a97a45', woodD: '#4a2f18',
  green: '#2e5d34', greenL: '#4f9a4a', gold: '#c9a227', goldL: '#ffd75e',
  steel: '#6d7276', steelL: '#b8bdc2', paper: '#f4f0e4',
  red: '#b23c30', blue: '#2b6cb0', water: '#3d7dbb', sand: '#c7b48c',
  skin: '#e8b88a', dark: '#1d1409',
};

type Rect = [number, number, number, number, string];

const ICONS: Record<string, Rect[]> = {
  // ── build tools ──
  cursor: [
    [4, 2, 1, 11, C.ink], [5, 3, 1, 9, C.paper], [5, 12, 1, 1, C.ink],
    [6, 4, 1, 7, C.paper], [6, 11, 1, 1, C.ink], [7, 5, 1, 5, C.paper],
    [7, 10, 3, 1, C.ink], [8, 6, 1, 3, C.paper], [9, 7, 1, 2, C.ink],
    [7, 11, 1, 3, C.ink], [8, 11, 1, 3, C.ink],
  ],
  path: [
    [1, 6, 14, 6, C.sand], [1, 6, 14, 1, '#b9a27c'],
    [3, 7, 3, 2, '#a8956f'], [8, 7, 4, 2, '#a8956f'], [2, 10, 4, 2, '#a8956f'],
    [9, 10, 4, 2, '#a8956f'], [1, 11, 14, 1, '#7c6a4d'],
  ],
  fence: [
    [2, 4, 2, 10, C.woodD], [12, 4, 2, 10, C.woodD],
    [7, 5, 2, 9, C.woodD],
    [1, 6, 14, 2, C.wood], [1, 10, 14, 2, C.wood],
    [1, 6, 14, 1, C.woodL], [1, 10, 14, 1, C.woodL],
  ],
  gate: [
    [1, 3, 2, 11, C.woodD], [13, 3, 2, 11, C.woodD],
    [4, 6, 8, 8, C.wood], [4, 6, 8, 1, C.woodL],
    [4, 6, 8, 8, 'rgba(0,0,0,0)'],
    [5, 7, 6, 1, C.woodD], [5, 12, 6, 1, C.woodD],
    [3, 1, 10, 4, C.green], [4, 2, 8, 1, C.goldL], [4, 3, 8, 1, C.goldL],
  ],
  terrain: [
    [0, 11, 16, 4, C.greenL], [0, 11, 16, 1, '#69ae58'],
    [3, 5, 2, 6, '#8d8d85'], [5, 3, 2, 8, '#a5a59c'], [7, 4, 2, 7, '#8d8d85'],
    [9, 6, 2, 5, '#7a7a72'], [4, 2, 4, 2, '#a5a59c'],
    [11, 8, 4, 3, C.water], [11, 8, 4, 1, '#5b98d1'],
  ],
  enrich: [
    [2, 3, 2, 12, C.wood], [12, 3, 2, 12, C.wood],
    [1, 2, 14, 2, C.woodL], [4, 8, 8, 2, C.wood],
    [5, 4, 1, 4, C.gold], [7, 4, 1, 4, C.gold], [9, 4, 1, 4, C.gold],
    [6, 10, 1, 5, C.gold], [10, 10, 1, 5, C.gold],
  ],
  feeding: [
    [2, 8, 12, 5, C.steelL], [2, 8, 12, 1, '#d5dade'],
    [3, 13, 10, 2, C.steel],
    [4, 5, 8, 3, C.gold], [5, 4, 6, 1, C.goldL],
    [6, 2, 1, 2, C.greenL], [9, 1, 1, 3, C.greenL], [7, 3, 2, 1, C.greenL],
  ],
  scenery: [
    [7, 9, 2, 6, C.wood], [8, 9, 1, 6, C.woodD],
    [5, 3, 6, 6, C.greenL], [3, 5, 4, 4, '#3e7a3a'], [9, 5, 4, 4, '#468a42'],
    [6, 1, 4, 3, '#4f9a4a'], [4, 4, 2, 2, '#356b32'], [10, 4, 2, 2, '#356b32'],
  ],
  shop: [
    [2, 7, 12, 8, '#d8c9a8'], [2, 7, 12, 1, '#b3a483'],
    [1, 3, 14, 4, C.red],
    [3, 3, 2, 4, C.paper], [7, 3, 2, 4, C.paper], [11, 3, 2, 4, C.paper],
    [4, 9, 5, 4, '#4a3826'], [10, 9, 3, 3, C.gold],
  ],
  animal: [
    [5, 9, 6, 5, C.woodD], [4, 10, 1, 3, C.woodD], [11, 10, 1, 3, C.woodD],
    [3, 5, 3, 3, C.woodD], [7, 3, 3, 3, C.woodD], [11, 5, 3, 3, C.woodD],
    [5, 10, 2, 2, C.woodL], [9, 10, 2, 2, C.woodL],
  ],
  transport: [
    [2, 4, 12, 7, C.steelL], [2, 4, 12, 1, '#d5dade'],
    [3, 6, 3, 3, C.blue], [7, 6, 3, 3, C.blue], [11, 6, 2, 3, C.blue],
    [2, 11, 12, 2, C.steel],
    [3, 13, 3, 2, C.ink], [10, 13, 3, 2, C.ink],
  ],
  demolish: [
    [2, 2, 7, 4, C.steelL], [2, 2, 7, 1, '#d5dade'], [2, 5, 7, 1, C.steel],
    [8, 4, 2, 3, C.woodD],
    [9, 6, 2, 2, C.wood], [10, 8, 2, 2, C.wood], [11, 10, 2, 2, C.wood],
    [12, 12, 2, 3, C.woodD],
  ],

  // ── windows and controls ──
  goals: [
    [4, 4, 8, 8, C.red], [5, 5, 6, 6, C.paper], [6, 6, 4, 4, C.red],
    [7, 7, 2, 2, C.paper], [1, 1, 2, 2, C.ink], [2, 2, 4, 4, 'rgba(0,0,0,0)'],
    [1, 1, 1, 6, C.ink], [1, 1, 6, 1, C.ink],
  ],
  alerts: [
    [6, 1, 4, 2, C.gold], [4, 3, 8, 7, C.goldL], [3, 10, 10, 2, C.gold],
    [4, 3, 8, 1, '#ffe9a8'], [6, 12, 4, 2, C.gold], [7, 14, 2, 1, C.woodD],
  ],
  zoo: [
    [1, 5, 2, 10, C.wood], [13, 5, 2, 10, C.wood],
    [0, 2, 16, 4, C.green], [2, 3, 12, 1, C.goldL], [2, 4, 12, 1, C.goldL],
    [4, 8, 8, 7, C.greenL], [6, 10, 4, 5, C.wood],
  ],
  staff: [
    [5, 1, 6, 2, C.green], [4, 3, 8, 1, C.green],
    [5, 4, 6, 4, C.skin], [6, 5, 1, 1, C.ink], [9, 5, 1, 1, C.ink],
    [3, 8, 10, 7, C.green], [3, 8, 10, 1, '#4f8a56'],
    [6, 10, 4, 5, C.paper],
  ],
  finance: [
    [3, 11, 10, 3, C.gold], [3, 11, 10, 1, C.goldL],
    [4, 8, 8, 3, C.gold], [4, 8, 8, 1, C.goldL],
    [5, 5, 6, 3, C.gold], [5, 5, 6, 1, C.goldL],
    [7, 2, 2, 3, C.goldL], [6, 3, 4, 1, C.gold],
  ],
  guests: [
    [3, 2, 3, 3, C.skin], [2, 5, 5, 6, C.red], [3, 11, 1, 4, C.blue], [5, 11, 1, 4, C.blue],
    [10, 3, 3, 3, C.skin], [9, 6, 5, 5, C.green], [10, 11, 1, 4, C.ink], [12, 11, 1, 4, C.ink],
  ],
  log: [
    [2, 1, 12, 14, C.paper], [2, 1, 12, 1, '#d8d2c0'], [2, 14, 12, 1, '#b3a077'],
    [4, 4, 8, 1, C.steel], [4, 6, 8, 1, C.steel], [4, 8, 6, 1, C.steel],
    [4, 10, 8, 1, C.steel], [4, 12, 5, 1, C.steel],
  ],
  save: [
    [1, 1, 14, 14, C.steel], [1, 1, 14, 1, C.steelL],
    [4, 2, 8, 5, C.steelL], [9, 3, 2, 3, C.ink],
    [3, 9, 10, 6, C.paper], [4, 10, 8, 1, C.steel], [4, 12, 8, 1, C.steel],
  ],
  newgame: [
    [7, 2, 2, 12, C.green], [2, 7, 12, 2, C.green],
    [7, 2, 2, 1, C.greenL], [2, 7, 1, 2, C.greenL],
  ],
  soundOn: [
    [3, 6, 3, 4, C.ink], [6, 4, 2, 8, C.ink], [8, 2, 1, 12, C.ink],
    [11, 5, 1, 6, C.blue], [13, 3, 1, 10, C.blue],
  ],
  soundOff: [
    [3, 6, 3, 4, C.ink], [6, 4, 2, 8, C.ink], [8, 2, 1, 12, C.ink],
    [11, 5, 1, 1, C.red], [13, 7, 1, 1, C.red], [12, 6, 1, 1, C.red],
    [11, 9, 1, 1, C.red], [13, 5, 1, 1, C.red], [12, 8, 1, 1, C.red],
    [11, 7, 1, 1, C.red], [13, 9, 1, 1, C.red],
  ],
  help: [
    [5, 2, 6, 2, C.green], [4, 3, 2, 3, C.green], [10, 3, 2, 4, C.green],
    [8, 6, 3, 2, C.green], [7, 8, 2, 2, C.green], [7, 12, 2, 2, C.green],
  ],
  pause: [[4, 3, 3, 10, C.ink], [9, 3, 3, 10, C.ink]],
  play: [
    [4, 3, 2, 10, C.ink], [6, 4, 2, 8, C.ink], [8, 5, 2, 6, C.ink],
    [10, 6, 2, 4, C.ink], [12, 7, 1, 2, C.ink],
  ],
  play2: [
    [2, 4, 2, 8, C.ink], [4, 5, 2, 6, C.ink], [6, 6, 1, 4, C.ink],
    [9, 4, 2, 8, C.ink], [11, 5, 2, 6, C.ink], [13, 6, 1, 4, C.ink],
  ],
  play3: [
    [0, 5, 2, 6, C.ink], [2, 6, 1, 4, C.ink],
    [5, 5, 2, 6, C.ink], [7, 6, 1, 4, C.ink],
    [10, 5, 2, 6, C.ink], [12, 6, 1, 4, C.ink],
  ],
  rotL: [
    [3, 4, 2, 2, C.ink], [1, 6, 2, 2, C.ink], [5, 6, 2, 2, C.ink],
    [3, 3, 6, 2, C.ink], [9, 4, 2, 2, C.ink], [11, 6, 2, 4, C.ink],
    [9, 10, 2, 2, C.ink], [4, 11, 6, 2, C.ink],
  ],
  rotR: [
    [11, 4, 2, 2, C.ink], [13, 6, 2, 2, C.ink], [9, 6, 2, 2, C.ink],
    [7, 3, 6, 2, C.ink], [5, 4, 2, 2, C.ink], [3, 6, 2, 4, C.ink],
    [5, 10, 2, 2, C.ink], [6, 11, 6, 2, C.ink],
  ],
  musicOn: [
    [10, 1, 4, 2, C.ink], [12, 2, 2, 8, C.ink], [10, 3, 2, 7, C.ink],
    [4, 4, 2, 8, C.ink], [2, 10, 4, 4, C.ink], [8, 8, 4, 4, C.ink],
    [4, 4, 10, 2, C.ink],
  ],
  musicOff: [
    [4, 4, 2, 8, C.steel], [2, 10, 4, 4, C.steel], [8, 8, 4, 4, C.steel],
    [4, 4, 10, 2, C.steel], [10, 1, 4, 2, C.steel], [12, 2, 2, 8, C.steel],
    [2, 2, 2, 2, C.red], [4, 4, 2, 2, C.red], [6, 6, 2, 2, C.red],
    [8, 8, 2, 2, C.red], [10, 10, 2, 2, C.red], [12, 12, 2, 2, C.red],
  ],
  lock: [
    [5, 2, 6, 2, C.steel], [4, 3, 2, 4, C.steel], [10, 3, 2, 4, C.steel],
    [3, 7, 10, 8, C.gold], [3, 7, 10, 1, C.goldL],
    [7, 9, 2, 3, C.woodD], [7, 11, 2, 2, C.woodD],
  ],
  zoomIn: [[7, 3, 2, 10, C.ink], [3, 7, 10, 2, C.ink]],
  zoomOut: [[3, 7, 10, 2, C.ink]],
};

const cache = new Map<string, string>();

/** Data URL for a named icon, drawn at 2x so it stays crisp when scaled. */
export function icon(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const rects = ICONS[name];
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  if (rects) {
    for (const [x, y, w, h, col] of rects) {
      g.fillStyle = col;
      g.fillRect(x * 2, y * 2, w * 2, h * 2);
    }
  }
  const url = c.toDataURL();
  cache.set(name, url);
  return url;
}

/** An <img> tag for a named icon, ready to drop into button markup. */
export function iconTag(name: string, cls = 'ico'): string {
  return `<img class="${cls}" src="${icon(name)}" alt="">`;
}

/**
 * Turn one of the game's own sprites into a menu icon — so the animal on a
 * species card is the animal you actually get, not an approximation.
 */
export function spriteIcon(key: string, boxW = 34, boxH = 28): string {
  const cacheKey = `sprite:${key}:${boxW}x${boxH}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  let url = '';
  try {
    const src = sprite(key);
    const c = document.createElement('canvas');
    c.width = boxW * 2;
    c.height = boxH * 2;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const scale = Math.min((boxW * 2) / src.width, (boxH * 2) / src.height, 3);
    const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
    g.drawImage(src, Math.round((boxW * 2 - w) / 2), Math.round((boxH * 2 - h) / 2), w, h);
    url = c.toDataURL();
  } catch {
    return '';
  }
  cache.set(cacheKey, url);
  return url;
}

export function spriteTag(key: string, cls = 'card-ico', boxW = 34, boxH = 28): string {
  const url = spriteIcon(key, boxW, boxH);
  return url ? `<img class="${cls}" src="${url}" alt="">` : '';
}

/** Fill in every element in the page that declares a data-icon. */
export function applyIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => {
    const name = el.dataset.icon!;
    const existing = el.querySelector('img.ico');
    if (existing) existing.setAttribute('src', icon(name));
    else el.insertAdjacentHTML('afterbegin', iconTag(name));
  });
}
