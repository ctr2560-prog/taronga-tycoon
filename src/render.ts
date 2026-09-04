// ── isometric renderer with a 4-way rotating camera ────────────────────────
import { GRID, TILE_W, TILE_H, SPECIES, SHOPS, SCENERY, BARRIERS, TRANSPORT, COSTS } from './data';
import { Game, WallRef, wallDef, wallIsGate } from './game';
import { sprite } from './sprites';
import { landmarksFor, landmarkSprite, SKY } from './backdrop';
import { siteDef } from './data';
import type { Tool } from './ui';

export type Rot = 0 | 1 | 2 | 3;

export class Camera {
  tx = GRID / 2;   // world tile coords sitting at the centre of the screen
  ty = GRID / 2;
  zoom = 1;
  rot: Rot = 0;
  // smoothed values so rotating/zooming eases instead of snapping
  zoomShown = 1;
  spin = 0;        // animates 0→1 during a rotation for a subtle swing
}

// ── coordinate maths ───────────────────────────────────────────────────────
// A rotation maps world tile space onto "view" space; everything downstream
// (iso projection, depth sort) works in view space.
export function rotPoint(fx: number, fy: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [fx, fy];
    case 1: return [GRID - fy, fx];
    case 2: return [GRID - fx, GRID - fy];
    case 3: return [fy, GRID - fx];
  }
}

export function unrotPoint(rx: number, ry: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [rx, ry];
    case 1: return [ry, GRID - rx];
    case 2: return [GRID - rx, GRID - ry];
    case 3: return [GRID - ry, rx];
  }
}

export function rotTile(x: number, y: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [x, y];
    case 1: return [GRID - 1 - y, x];
    case 2: return [GRID - 1 - x, GRID - 1 - y];
    case 3: return [y, GRID - 1 - x];
  }
}

// vectors rotate without the board-size offset
export function rotVec(dx: number, dy: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [dx, dy];
    case 1: return [-dy, dx];
    case 2: return [-dx, -dy];
    case 3: return [dy, -dx];
  }
}

function unrotVec(dx: number, dy: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [dx, dy];
    case 1: return [dy, -dx];
    case 2: return [-dx, -dy];
    case 3: return [-dy, dx];
  }
}

export function tileToIso(rx: number, ry: number): [number, number] {
  return [(rx - ry) * (TILE_W / 2), (rx + ry) * (TILE_H / 2)];
}

function camIso(cam: Camera): [number, number] {
  const [rx, ry] = rotPoint(cam.tx, cam.ty, cam.rot);
  return tileToIso(rx, ry);
}

/** Screen pixel → world tile coords (fractional). */
export function screenToWorld(sx: number, sy: number, cam: Camera, canvas: HTMLCanvasElement): [number, number] {
  const [cix, ciy] = camIso(cam);
  const wx = (sx - canvas.width / 2) / cam.zoom + cix;
  const wy = (sy - canvas.height / 2) / cam.zoom + ciy;
  const rx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
  const ry = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
  return unrotPoint(rx, ry, cam.rot);
}

export function screenToTile(sx: number, sy: number, cam: Camera, canvas: HTMLCanvasElement): [number, number] {
  const [fx, fy] = screenToWorld(sx, sy, cam, canvas);
  return [Math.floor(fx), Math.floor(fy)];
}

/** Move the camera by a screen-space pixel delta, whatever the rotation. */
export function panByScreen(cam: Camera, sdx: number, sdy: number) {
  const drx = (sdx / (TILE_W / 2) + sdy / (TILE_H / 2)) / 2;
  const dry = (sdy / (TILE_H / 2) - sdx / (TILE_W / 2)) / 2;
  const [dx, dy] = unrotVec(drx, dry, cam.rot);
  cam.tx = Math.max(0, Math.min(GRID, cam.tx + dx));
  cam.ty = Math.max(0, Math.min(GRID, cam.ty + dy));
}

export interface HoverInfo { x: number; y: number; valid: boolean }

interface Drawable { depth: number; draw: () => void }

/** Decor index → sprite family. Matches the DECOR table in sites.ts. */
const NATURAL = ['', 'gum', 'scrub', 'sandstone', 'banksia', 'grasstuft', 'deadtree'];

// ── main render ────────────────────────────────────────────────────────────
export function render(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: Game,
  cam: Camera,
  hover: HoverInfo | null,
  tool: Tool,
  time: number,
  wallPreview: WallRef[] | null = null,
  material = 'timber',
) {
  g.imageSmoothingEnabled = false;

  // ── sky and a painted horizon, so the site sits somewhere real ──
  const kind = siteDef(game.site).backdrop;
  const [skyTop, skyBottom] = SKY[kind];
  const sky = g.createLinearGradient(0, 0, 0, canvas.height * 0.62);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, canvas.width, canvas.height);

  cam.zoomShown += (cam.zoom - cam.zoomShown) * Math.min(1, time * 0 + 0.25);
  const zoom = cam.zoomShown;

  const [cix, ciy] = camIso(cam);

  g.save();
  g.translate(canvas.width / 2, canvas.height / 2);
  g.scale(zoom, zoom);
  g.translate(-cix, -ciy);

  const waterFrame = Math.floor(time * 1.6) % 3;

  // visible iso bounds, for culling
  const halfW = canvas.width / 2 / zoom, halfH = canvas.height / 2 / zoom;
  const minIX = cix - halfW - TILE_W, maxIX = cix + halfW + TILE_W;
  const minIY = ciy - halfH - TILE_H * 3, maxIY = ciy + halfH + TILE_H * 3;

  // ── ground pass ──
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const [rx, ry] = rotTile(x, y, cam.rot);
      const [ix, iy] = tileToIso(rx, ry);
      if (ix < minIX || ix > maxIX || iy < minIY || iy > maxIY) continue;
      const t = game.tile(x, y);
      const dx = ix - TILE_W / 2;
      let key: string;
      if (t.path) key = 'path';
      else if (t.terrain === 'water') key = `water${game.depth[y * GRID + x] || 3}_${waterFrame}`;
      else key = t.terrain;
      g.drawImage(sprite(key), dx, iy);
      if (!game.playable[y * GRID + x] && t.terrain !== 'water') {
        // across the water: hazed back so it reads as view, not building land
        g.fillStyle = 'rgba(150, 176, 200, 0.30)';
        diamond(g, dx, iy);
        g.fill();
      }
      if (game.litter[y * GRID + x] > 0) {
        const l = sprite('litter');
        g.drawImage(l, ix - l.width / 2, iy + TILE_H / 2 - l.height / 2);
      }
      if (t.habitatId >= 0 && !t.path) {
        g.fillStyle = 'rgba(255, 215, 94, 0.07)';
        diamond(g, dx, iy);
        g.fill();
      }
    }
  }

  // ── hover highlight + build ghost ──
  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < GRID && hover.y < GRID) {
    const [rx, ry] = rotTile(hover.x, hover.y, cam.rot);
    const [ix, iy] = tileToIso(rx, ry);
    const dx = ix - TILE_W / 2;
    const pulse = 0.55 + Math.sin(time * 5) * 0.25;
    g.save();
    g.globalAlpha = pulse;
    g.strokeStyle = hover.valid ? '#ffe58a' : '#ff6b6b';
    g.lineWidth = 2;
    diamond(g, dx, iy);
    g.stroke();
    g.globalAlpha = pulse * 0.3;
    g.fillStyle = hover.valid ? '#ffe58a' : '#ff6b6b';
    diamond(g, dx, iy);
    g.fill();
    g.restore();

    // translucent preview of what you're about to place
    g.save();
    g.globalAlpha = 0.55;
    if (tool.kind !== 'fence' && tool.kind !== 'gate') {
      const ghost = ghostSprite(tool);
      if (ghost) g.drawImage(ghost.img, ix - ghost.img.width / 2 + ghost.ox, iy + ghost.oy);
    }
    g.restore();
  }

  // pending wall run, previewed as you drag
  if (wallPreview && (tool.kind === 'fence' || tool.kind === 'gate')) {
    g.save();
    g.globalAlpha = 0.6;
    for (const r of wallPreview) {
      // turn canonical storage back into (tile, side) so it can be drawn
      const [tx, ty, d] = r.h ? [r.x, r.y, 0] : [r.x, r.y, 3];
      const [rx, ry] = rotTile(tx, ty, cam.rot);
      const [ix2, iy2] = tileToIso(rx, ry);
      const vd = (d + cam.rot) % 4;
      g.drawImage(sprite(`${tool.kind === 'gate' ? 'gate' : 'wall'}_${material}_${vd}`), ix2 - TILE_W / 2, iy2 - 30);
    }
    g.restore();
  }

  // ── object + entity pass, painter's order by view-space depth ──
  const drawables: Drawable[] = [];
  const push = (rx: number, ry: number, draw: () => void, bias = 0) =>
    drawables.push({ depth: rx + ry + bias, draw });

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = game.tile(x, y);
      const [rx, ry] = rotTile(x, y, cam.rot);
      const [ix, iy] = tileToIso(rx, ry);
      if (ix < minIX || ix > maxIX || iy < minIY || iy > maxIY) continue;
      // Each edge is drawn once, by the tile that owns it: always its N and W
      // sides, plus S/E only on the last row/column.
      for (let d = 0; d < 4; d++) {
        if (d === 1 && x !== GRID - 1) continue;
        if (d === 2 && y !== GRID - 1) continue;
        const kind = game.wallAt(x, y, d);
        if (!kind) continue;
        const def = wallDef(kind);
        if (!def) continue;
        const vd = (d + cam.rot) % 4;
        const img = sprite(`${wallIsGate(kind) ? 'gate' : 'wall'}_${def.id}_${vd}`);
        // back edges (view N/W) sit behind the tile's occupants, front edges in
        // front; the bias is the midpoint depth of the edge itself
        push(rx, ry, () => g.drawImage(img, ix - TILE_W / 2, iy - 30), vd === 0 || vd === 3 ? 0.5 : 1.5);
      }
      if (t.scenery) {
        const s = sprite(t.scenery);
        push(rx, ry, () => g.drawImage(s, ix - s.width / 2, iy + TILE_H / 2 - s.height + 4), 1);
      } else {
        const nat = game.decor[y * GRID + x];
        if (nat) {
          // three variants of each, picked from position so it never shimmers
          const name = NATURAL[nat];
          const s2 = sprite(`nat_${name}_${(x * 7 + y * 13) % 3}`);
          push(rx, ry, () => g.drawImage(s2, ix - s2.width / 2, iy + TILE_H / 2 - s2.height + 4), 1);
        }
      }
      if (t.shop) {
        const s = sprite('shop_' + t.shop);
        push(rx, ry, () => g.drawImage(s, ix - TILE_W / 2, iy - 40), 1);
      }
    }
  }

  // ── transport: track, stations, vehicles ──
  for (const ride of game.rides) {
    const def = TRANSPORT.find(t => t.id === ride.type)!;
    const lift = def.elevated ? 34 : 3;
    const pt = (wx: number, wy: number): [number, number] => {
      const [rx, ry] = rotPoint(wx + 0.5, wy + 0.5, cam.rot);
      const [ix2, iy2] = tileToIso(rx - 0.5, ry - 0.5);
      return [ix2, iy2 + TILE_H / 2 - lift];
    };

    // track drawn as one pass beneath everything, so it never chops up
    for (let i = 1; i < ride.stations.length; i++) {
      const [ax, ay] = pt(...ride.stations[i - 1]);
      const [bx, by] = pt(...ride.stations[i]);
      const depth = (ride.stations[i - 1][0] + ride.stations[i - 1][1]
                   + ride.stations[i][0] + ride.stations[i][1]) / 2;
      push(depth / 2, depth / 2, () => {
        if (def.elevated) {
          // support pylons at intervals along the span
          const segs = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 46));
          g.strokeStyle = 'rgba(120,126,132,0.85)';
          g.lineWidth = 3;
          for (let k = 0; k <= segs; k++) {
            const px2 = ax + (bx - ax) * (k / segs), py2 = ay + (by - ay) * (k / segs);
            g.beginPath(); g.moveTo(px2, py2); g.lineTo(px2, py2 + lift); g.stroke();
          }
        }
        g.strokeStyle = def.id === 'cablecar' ? '#4a4f55' : '#9aa0a6';
        g.lineWidth = def.id === 'cablecar' ? 2 : 5;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        if (def.id !== 'cablecar') {
          g.strokeStyle = shadeHex(def.colour, 0.8);
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(ax, ay + 2); g.lineTo(bx, by + 2); g.stroke();
        }
      }, -1.2);
    }

    for (const [sx, sy] of ride.stations) {
      const [rx, ry] = rotTile(sx, sy, cam.rot);
      const [ix2, iy2] = tileToIso(rx, ry);
      const img = sprite('station_' + def.id);
      push(rx, ry, () => g.drawImage(img, ix2 - TILE_W / 2, iy2 + TILE_H - img.height), 1);
    }

    for (const v of ride.vehicles) {
      const [wx, wy] = game.ridePoint(ride, v.at);
      const [rx, ry] = rotPoint(wx + 0.5, wy + 0.5, cam.rot);
      const [ix2, iy2] = tileToIso(rx - 0.5, ry - 0.5);
      const img = sprite('vehicle_' + def.id);
      push(rx, ry, () => {
        g.drawImage(img, ix2 - img.width / 2, iy2 + TILE_H / 2 - lift - img.height + 6);
      }, 0.9);
    }
  }

  // ── ferries working the harbour ──
  if (game.site === 'taronga') {
    for (let i = 0; i < game.ferryRoutes.length; i++) {
      const { x1: ax, y1: ay, x2: bx, y2: by, period } = game.ferryRoutes[i];
      // ping-pong along the route
      const phase = ((time / period) + i * 0.37) % 2;
      const t2 = phase < 1 ? phase : 2 - phase;
      const wx = ax + (bx - ax) * t2, wy = ay + (by - ay) * t2;
      const [rx, ry] = rotPoint(wx, wy, cam.rot);
      const [ix2, iy2] = tileToIso(rx - 0.5, ry - 0.5);
      const img = sprite('ferry');
      const [vdx, vdy] = rotVec(bx - ax, by - ay, cam.rot);
      const facing = (phase < 1 ? 1 : -1) * ((vdx - vdy) < 0 ? -1 : 1);
      push(rx, ry, () => {
        g.save();
        g.translate(ix2, iy2 + TILE_H / 2);
        if (facing < 0) g.scale(-1, 1);
        g.drawImage(img, -img.width / 2, -img.height + 8);
        g.restore();
      }, 0.5);
    }
  }

  // ── landmarks: the city across the harbour, or the ranges out west ──
  for (const lm of landmarksFor(game.site)) {
    const img = landmarkSprite(lm.key);
    if (!img) continue;
    const [rx, ry] = rotTile(lm.x, lm.y, cam.rot);
    const [ix2, iy2] = tileToIso(rx, ry);
    if (ix2 < minIX - 400 || ix2 > maxIX + 400) continue;
    // drawn well behind everything, and hazed so they read as distance
    // boats sit on the water in front of the city, so they read at full strength
    const near = lm.key.startsWith('lm_yacht');
    push(rx, ry, () => {
      g.save();
      g.globalAlpha = near ? 1 : 0.88;
      g.drawImage(img, ix2 - img.width / 2, iy2 + TILE_H - img.height);
      g.restore();
    }, near ? 0.4 : -40);
  }

  // every way in: the wharf arch, or the heritage gatehouse on the road
  game.entrances.forEach(([ex, ey], i) => {
    const [rx, ry] = rotTile(ex, ey, cam.rot);
    const [ix, iy] = tileToIso(rx, ry);
    if (game.entranceKinds[i] === 'gate') {
      // a wide building, so it overhangs its tile on both sides
      const img = sprite('entrance_gate');
      push(rx, ry, () => g.drawImage(img, ix - img.width / 2, iy + TILE_H - img.height), 0.5);
    } else {
      push(rx, ry, () => g.drawImage(sprite('entrance'), ix - TILE_W / 2, iy - 56), 0.5);
    }
  });

  // troughs
  for (const hab of game.habitats.values()) {
    if (!hab.troughAt) continue;
    if (!game.animals.some(a => a.habitatId === hab.id)) continue;
    const [rx, ry] = rotTile(hab.troughAt[0], hab.troughAt[1], cam.rot);
    const [ix, iy] = tileToIso(rx, ry);
    const s = sprite('trough');
    push(rx, ry, () => {
      g.drawImage(s, ix - s.width / 2, iy + TILE_H / 2 - s.height + 2);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(ix - 13, iy - 5, 26, 5);
      const frac = hab.food / hab.foodMax;
      g.fillStyle = frac > 0.3 ? '#5fd97a' : '#e6913a';
      g.fillRect(ix - 12, iy - 4, 24 * frac, 3);
    });
  }

  // ── mobile entities: animals, guests, keepers ──
  const drawActor = (
    wx: number, wy: number, targetX: number, targetY: number,
    img: HTMLCanvasElement, decorate?: (ix: number, iy: number, h: number) => void,
  ) => {
    const [rx, ry] = rotPoint(wx, wy, cam.rot);
    const [ix, iy] = tileToIso(rx - 0.5, ry - 0.5);
    if (ix < minIX || ix > maxIX || iy < minIY || iy > maxIY) return;
    // facing is decided in screen space, so it stays correct through rotations
    const [vdx, vdy] = rotVec(targetX - wx, targetY - wy, cam.rot);
    const screenDx = vdx - vdy;
    push(rx, ry, () => {
      g.save();
      g.translate(ix, iy + TILE_H / 2);
      if (screenDx < -0.001) g.scale(-1, 1);
      // faint contact shadow just to seat the sprite on the tile
      g.globalAlpha = 0.13;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(0, -1, img.width * 0.2, img.width * 0.08, 0, 0, 7);
      g.fill();
      g.globalAlpha = 1;
      g.drawImage(img, -img.width / 2, -img.height + 4);
      g.restore();
      decorate?.(ix, iy, img.height);
    });
  };

  for (const a of game.animals) {
    const escaped = a.habitatId < 0;
    const def = SPECIES.find(s2 => s2.id === a.species)!;
    const young = a.age < def.matureAt;
    drawActor(a.x, a.y, a.tx, a.ty, sprite(`animal_${a.species}_${a.frame}${young ? '_y' : ''}`), (ix, iy, h) => {
      if (escaped) {
        g.fillStyle = '#ff4d4d';
        g.font = 'bold 12px monospace';
        g.textAlign = 'center';
        g.fillText('!', ix, iy - h + 2 + Math.sin(time * 6) * 2);
      } else if (a.health < 40) {
        g.fillStyle = '#ff6b6b';
        g.font = '10px serif';
        g.textAlign = 'center';
        g.fillText('✚', ix, iy - h + 4);
      } else if (a.welfare < 35) {
        g.fillStyle = '#e6913a';
        g.font = '10px serif';
        g.textAlign = 'center';
        g.fillText('☹', ix, iy - h + 4);
      }
    });
  }

  for (const gu of game.guests) {
    drawActor(gu.x, gu.y, gu.tx, gu.ty, sprite(`guest_${gu.shirt}_${gu.skin}_${gu.frame}`), (ix, iy, h) => {
      if (gu.happiness < 30) {
        g.fillStyle = '#ff6b6b';
        g.font = '9px serif';
        g.textAlign = 'center';
        g.fillText('☹', ix, iy - h);
      }
    });
  }

  for (const k of game.staff) {
    drawActor(k.x, k.y, k.tx, k.ty, sprite(`${k.role}_${k.frame}`));
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();

  g.restore();
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function diamond(g: CanvasRenderingContext2D, dx: number, iy: number) {
  g.beginPath();
  g.moveTo(dx + TILE_W / 2, iy);
  g.lineTo(dx + TILE_W, iy + TILE_H / 2);
  g.lineTo(dx + TILE_W / 2, iy + TILE_H);
  g.lineTo(dx, iy + TILE_H / 2);
  g.closePath();
}

function ghostSprite(tool: Tool): { img: HTMLCanvasElement; ox: number; oy: number } | null {
  switch (tool.kind) {
    case 'shop': return { img: sprite('shop_' + tool.shop), ox: 0, oy: -40 };
    case 'scenery': {
      const s = sprite(tool.scenery);
      return { img: s, ox: 0, oy: TILE_H / 2 - s.height + 4 };
    }
    default: return null;
  }
}

/** What the current tool would cost on this tile, or null if it can't go there. */
export function toolCost(game: Game, tool: Tool, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
  const t = game.tile(x, y);
  switch (tool.kind) {
    case 'path': return t.path || t.shop || t.terrain === 'water' || t.habitatId >= 0 ? null : COSTS.path;
    case 'fence': return BARRIERS.find(b => b.id === tool.material)!.cost;
    case 'gate': return BARRIERS.find(b => b.id === tool.material)!.cost + COSTS.gate;
    case 'terrain': return t.terrain === tool.terrain || t.path || t.shop ? null : COSTS.terrain;
    case 'scenery': return t.path || t.shop || t.scenery || t.terrain === 'water'
      ? null : SCENERY.find(s => s.id === tool.scenery)!.cost;
    case 'shop': return t.path || t.shop || t.terrain === 'water' || t.habitatId >= 0
      ? null : SHOPS.find(s => s.id === tool.shop)!.cost;
    case 'animal': return t.habitatId >= 0 ? SPECIES.find(s => s.id === tool.species)!.cost : null;
    case 'transport': return TRANSPORT.find(t => t.id === tool.transport)!.stationCost;
    case 'bulldoze': return 0;
    default: return null;
  }
}

// ── minimap ────────────────────────────────────────────────────────────────
export function renderMinimap(
  g: CanvasRenderingContext2D, game: Game, cam: Camera, size: number, view?: HTMLCanvasElement,
) {
  const s = size / GRID;
  g.clearRect(0, 0, size, size);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = game.tile(x, y);
      let c: string;
      if (t.path) c = '#c7b48c';
      else if (t.shop) c = '#c0392b';
      else if (t.terrain === 'water') c = '#3d7dbb';
      else if (t.terrain === 'sand') c = '#ddc98d';
      else if (t.terrain === 'dirt') c = '#9c7a4f';
      else c = t.habitatId >= 0 ? '#6fae52' : '#4f8f42';
      g.fillStyle = c;
      g.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
    }
  }
  g.fillStyle = '#6b4a2b';
  for (let y = 0; y <= GRID; y++) {
    for (let x = 0; x < GRID; x++) if (game.wallH[y * GRID + x]) g.fillRect(x * s, y * s - 0.5, Math.ceil(s), 1);
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x <= GRID; x++) if (game.wallV[y * (GRID + 1) + x]) g.fillRect(x * s - 0.5, y * s, 1, Math.ceil(s));
  }
  g.fillStyle = '#e05b4a';
  for (const r of game.rides) {
    for (let i = 1; i < r.stations.length; i++) {
      g.strokeStyle = 'rgba(224,91,74,0.9)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(r.stations[i - 1][0] * s, r.stations[i - 1][1] * s);
      g.lineTo(r.stations[i][0] * s, r.stations[i][1] * s);
      g.stroke();
    }
    for (const [sx, sy] of r.stations) g.fillRect(sx * s - 1, sy * s - 1, 3, 3);
  }
  g.fillStyle = '#ffd75e';
  for (const a of game.animals) g.fillRect(a.x * s - 1, a.y * s - 1, 3, 3);
  g.fillStyle = '#ffffff';
  for (const gu of game.guests) g.fillRect(gu.x * s - 0.5, gu.y * s - 0.5, 2, 2);
  // outline of what's currently on screen
  if (view) {
    const corners: [number, number][] = [
      [0, 0], [view.width, 0], [view.width, view.height], [0, view.height],
    ].map(([sx, sy]) => screenToWorld(sx, sy, cam, view));
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.5;
    g.beginPath();
    corners.forEach(([wx, wy], i) =>
      i ? g.lineTo(wx * s, wy * s) : g.moveTo(wx * s, wy * s));
    g.closePath();
    g.stroke();
  }
}
