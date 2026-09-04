import './style.css';
import { GRID } from './data';
import { Game, WallRef, GameMode } from './game';
import { SITES, SCENARIOS, ScenarioId } from './data';
import { setSitePalette } from './sprites';
import { buildSprites } from './sprites';
import { buildLandmarks } from './backdrop';
import { Camera, render, screenToTile, screenToWorld, panByScreen, HoverInfo } from './render';
import { UI } from './ui';
import { sfx, startAmbient, startMusic, isMuted, setMuted } from './sound';
import { buildShowcase } from './showcase';
import { transparentiseLogo } from './logo';

buildSprites();
buildLandmarks();
transparentiseLogo();

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// The title screen runs a real, simulated zoo behind it as a moving backdrop,
// so `game` is the showcase until the player picks something.
let inMenu = true;
let game = buildShowcase();
const cam = new Camera();
cam.zoom = 1.35;

const ui = new UI(game, cam, () => showMenu(), loaded => startGame(loaded.mode, loaded.scenario.id, loaded));

function guided(): boolean {
  return (document.getElementById('m-guide-box') as HTMLInputElement)?.checked ?? false;
}

function startGame(mode: GameMode, scenario: ScenarioId = 'taronga-new', loaded?: Game) {
  game = loaded ?? new Game(mode, scenario);
  setSitePalette(game.site);

  ui.setGame(game, !loaded && guided());
  cam.tx = game.entrance[0];
  cam.ty = game.entrance[1] - 6;
  cam.zoom = 1;
  cam.rot = 0;
  inMenu = false;
  document.body.classList.remove('menu');
  startAmbient();
  startMusic();
  sfx.cash();
}

function showMenu() {
  showSites(false, 'scenario');
  game = buildShowcase();
  setSitePalette(game.site);
  ui.setGame(game);
  inMenu = true;
  cam.zoom = 1.35;
  document.body.classList.add('menu');
  refreshMenuButtons();
}

function refreshMenuButtons() {
  const slot = Game.latestSlot();
  const cont = document.getElementById('m-continue') as HTMLButtonElement;
  cont.disabled = slot === null;
  const info = slot === null ? null : Game.slotInfo(slot);
  cont.querySelector('small')!.textContent = info
    ? `${info.label} · ${info.date}` : 'No saved zoo yet';
}

document.getElementById('m-continue')!.onclick = () => {
  const slot = Game.latestSlot();
  const loaded = slot === null ? null : Game.load(slot);
  if (loaded) startGame(loaded.mode, loaded.scenario.id, loaded);
  else refreshMenuButtons();
};
document.getElementById('m-play')!.onclick = () => showSites(true, 'scenario');
document.getElementById('m-sandbox')!.onclick = () => showSites(true, 'sandbox');

// remember whether the player wants the walkthrough
{
  const box = document.getElementById('m-guide-box') as HTMLInputElement;
  box.checked = localStorage.getItem('taronga-guide') !== '0';
  box.onchange = () => localStorage.setItem('taronga-guide', box.checked ? '1' : '0');
}

/** Second menu page: pick a site, then how you want to play it. */
let sitesMode: GameMode = 'scenario';
function showSites(on: boolean, mode: GameMode = 'scenario') {
  sitesMode = mode;
  const panel = document.getElementById('menu-sites')!;
  document.getElementById('menu-main')!.style.display = on ? 'none' : 'flex';
  document.querySelector('.menu-inner')!.classList.toggle('wide', on);
  panel.classList.toggle('on', on);
  if (!on) return;

  panel.innerHTML = SITES.map(site => {
    const runs = SCENARIOS.filter(sc => sc.site === site.id);
    const buttons = mode === 'sandbox'
      ? `<button class="btn" data-sandbox="${runs[0].id}">
           <b>Free Build</b><small>No deadline, every species unlocked</small></button>`
      : runs.map(sc => `<button class="btn" data-run="${sc.id}">
          <b>${sc.kind === 'recreate' ? 'Build Existing' : 'New Zoo'}</b>
          <small>${sc.kind === 'recreate'
            ? 'Rebuild the real zoo, species and all'
            : 'Empty ground, your own design'} · ${sc.deadlineYear - 1} years</small>
        </button>`).join('');
    return `<div class="site-card">
      <div class="site-head"><span class="site-name">${site.name}</span>
        <span class="site-sub">${site.subtitle}</span></div>
      <div class="site-blurb">${site.blurb}</div>
      <div class="site-modes">${buttons}</div>
    </div>`;
  }).join('') + '<button class="menu-btn" id="m-back">Back</button>';

  panel.querySelectorAll('[data-run]').forEach(el => {
    (el as HTMLElement).onclick = () =>
      startGame('scenario', (el as HTMLElement).dataset.run as ScenarioId);
  });
  panel.querySelectorAll('[data-sandbox]').forEach(el => {
    (el as HTMLElement).onclick = () =>
      startGame('sandbox', (el as HTMLElement).dataset.sandbox as ScenarioId);
  });
  document.getElementById('m-back')!.onclick = () => showSites(false);
  void sitesMode;
}
document.getElementById('m-sound')!.onclick = () => {
  setMuted(!isMuted());
  ui.refreshSoundIcon();
  if (!isMuted()) { startAmbient(); startMusic(); sfx.click(); }
};
document.body.classList.add('menu');
refreshMenuButtons();

// debug handle for the console: __tt.game, __tt.cam
(window as any).__tt = { get game() { return game; }, cam, ui };

// ── input ──────────────────────────────────────────────────────────────────
const mouse = { down: false, panning: false, moved: 0, lastX: 0, lastY: 0 };
let hover: HoverInfo | null = null;
let hoverWorld: [number, number] = [0, 0];
let lastPainted = '';
let wallStart: [number, number, number] | null = null;   // tile x, tile y, side
let wallPreview: WallRef[] | null = null;

const isWallTool = () => ui.tool.kind === 'fence' || ui.tool.kind === 'gate';

function updateWallPreview() {
  if (!wallStart) return;
  const [ex, ey] = [Math.floor(hoverWorld[0]), Math.floor(hoverWorld[1])];
  wallPreview = game.wallRun(wallStart[0], wallStart[1], wallStart[2], ex, ey);
}

/** Which tile edge the cursor is closest to — walls mount on edges, not tiles. */
function nearestEdge(fx: number, fy: number): [number, number, number] {
  const x = Math.floor(fx), y = Math.floor(fy);
  const u = fx - x, v = fy - y;
  const d = [v, 1 - u, 1 - v, u];               // N, E, S, W
  let best = 0;
  for (let i = 1; i < 4; i++) if (d[i] < d[best]) best = i;
  return [x, y, best];
}

function applyTool(tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return;
  const t = ui.tool;
  const before = game.cash;
  const feedback = (okd: boolean) => {
    if (okd) sfx.build();
    else if (game.cash === before) sfx.error();
  };
  switch (t.kind) {
    case 'path': feedback(game.buildPath(tx, ty)); break;
    case 'fence': case 'gate': break;          // handled by the drag flow below
    case 'terrain': feedback(game.paintTerrain(tx, ty, t.terrain)); break;
    case 'scenery': feedback(game.buildScenery(tx, ty, t.scenery)); break;
    case 'shop': feedback(game.buildShop(tx, ty, t.shop)); break;
    case 'bulldoze': {
      // a click near an edge takes the wall; otherwise it takes what's on the tile
      const [ex2, ey2, ed] = nearestEdge(hoverWorld[0], hoverWorld[1]);
      const ref = game.edgeRef(ex2, ey2, ed);
      // a station sits on the tile, so try that before walls and tile contents
      const removed = game.removeStationAt(tx, ty)
        || (game.wallRefAt(ref) && edgeDistance(hoverWorld[0], hoverWorld[1]) < 0.3
          ? game.removeWall(ref) : game.bulldoze(tx, ty));
      if (removed) sfx.demolish(); else sfx.error();
      break;
    }
    case 'animal': {
      const habId = game.tile(tx, ty).habitatId;
      if (habId >= 0) feedback(game.buyAnimal(t.species, habId));
      else { game.say('Click inside a fenced habitat to release the animal.', 'bad'); sfx.error(); }
      break;
    }
    case 'transport': {
      const before2 = game.rides.length;
      ui.activeRide = game.addStation(t.transport, tx, ty, ui.activeRide);
      feedback(game.rides.length !== before2 || game.cash !== before);
      break;
    }
    case 'select': selectAt(tx, ty); break;
  }
}

/** Distance from the cursor to the nearest tile edge, in tiles. */
function edgeDistance(fx: number, fy: number): number {
  const u = fx - Math.floor(fx), v = fy - Math.floor(fy);
  return Math.min(v, 1 - v, u, 1 - u);
}

function selectAt(tx: number, ty: number) {
  const [wx, wy] = hoverWorld;
  let bestD = 0.8;
  let pick: (() => void) | null = null;
  for (const a of game.animals) {
    const d = Math.hypot(a.x - wx, a.y - wy);
    if (d < bestD) { bestD = d; pick = () => ui.openAnimal(a.id); }
  }
  for (const g of game.guests) {
    const d = Math.hypot(g.x - wx, g.y - wy);
    if (d < bestD) { bestD = d; pick = () => ui.openGuest(g.id); }
  }
  for (const st of game.staff) {
    const d = Math.hypot(st.x - wx, st.y - wy);
    if (d < bestD) { bestD = d; pick = () => ui.openStaff(st.id); }
  }
  if (pick) { pick(); return; }
  const habId = game.tile(tx, ty).habitatId;
  if (habId >= 0) ui.openHabitat(habId);
  else ui.hidePanel();
}

canvas.addEventListener('mousedown', e => {
  if (inMenu) return;
  startAmbient();
  startMusic();                       // browsers only allow audio after a gesture
  mouse.down = true;
  mouse.moved = 0;
  mouse.lastX = e.clientX;
  mouse.lastY = e.clientY;
  // right/middle button always pans; left button pans only in Inspect mode
  mouse.panning = e.button !== 0 || ui.tool.kind === 'select';
  if (e.button === 0 && !mouse.panning && isWallTool()) {
    wallStart = nearestEdge(hoverWorld[0], hoverWorld[1]);
    updateWallPreview();
  }
});

window.addEventListener('mouseup', e => {
  if (inMenu) return;
  if (wallStart && e.button === 0) {
    // commit the whole run in one go, so a drag lays a straight wall
    if (wallPreview?.length && (ui.tool.kind === 'fence' || ui.tool.kind === 'gate')) {
      const n = game.buildWallRun(wallPreview, ui.tool.kind === 'gate', ui.tool.material);
      if (n) sfx.build(); else sfx.error();
    }
    wallStart = null;
    wallPreview = null;
  } else if (mouse.down && mouse.moved < 5 && e.button === 0 && e.target === canvas) {
    const [tx, ty] = screenToTile(e.clientX, e.clientY, cam, canvas);
    applyTool(tx, ty);
  }
  mouse.down = false;
  lastPainted = '';
});

canvas.addEventListener('mousemove', e => {
  if (inMenu) return;
  hoverWorld = screenToWorld(e.clientX, e.clientY, cam, canvas);
  const [tx, ty] = [Math.floor(hoverWorld[0]), Math.floor(hoverWorld[1])];
  const inside = tx >= 0 && ty >= 0 && tx < GRID && ty < GRID;
  hover = { x: tx, y: ty, valid: inside };
  ui.setHover(inside ? [tx, ty] : null);
  if (!wallStart && isWallTool()) {
    const [ex, ey, ed] = nearestEdge(hoverWorld[0], hoverWorld[1]);
    wallPreview = inside ? [game.edgeRef(ex, ey, ed)] : null;
  } else if (!wallStart) {
    wallPreview = null;
  }

  if (mouse.down) {
    const dx = e.clientX - mouse.lastX, dy = e.clientY - mouse.lastY;
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    if (mouse.panning) {
      panByScreen(cam, -dx / cam.zoom, -dy / cam.zoom);
    } else if (wallStart) {
      updateWallPreview();
    } else if (mouse.moved > 5 && ui.tool.kind !== 'animal') {
      const key = tx + ',' + ty;
      if (key !== lastPainted) { lastPainted = key; applyTool(tx, ty); }
    }
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
  }
});

canvas.addEventListener('wheel', e => {
  if (inMenu) return;
  e.preventDefault();
  cam.zoom = Math.max(0.4, Math.min(3, cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (inMenu || e.target instanceof HTMLInputElement) return;
  const step = 44;
  switch (e.key.toLowerCase()) {
    case 'arrowup': case 'w': panByScreen(cam, 0, -step / cam.zoom); break;
    case 'arrowdown': case 's': panByScreen(cam, 0, step / cam.zoom); break;
    case 'arrowleft': case 'a': panByScreen(cam, -step / cam.zoom, 0); break;
    case 'arrowright': case 'd': panByScreen(cam, step / cam.zoom, 0); break;
    case 'q': ui.rotate(-1); break;
    case 'e': ui.rotate(1); break;
    case '+': case '=': cam.zoom = Math.min(3, cam.zoom * 1.25); break;
    case '-': case '_': cam.zoom = Math.max(0.4, cam.zoom / 1.25); break;
    case ' ': game.speed = game.speed === 0 ? 1 : 0; e.preventDefault(); break;
    case '1': game.speed = 1; break;
    case '2': game.speed = 2; break;
    case '3': game.speed = 3; break;
    case 'escape': ui.tool = { kind: 'select' }; ui.activeRide = -1; break;
  }
});

// ── main loop ──────────────────────────────────────────────────────────────
let last = performance.now();
let autosaveT = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);

  if (inMenu) {
    // drift the camera slowly around the showcase zoo, turning now and then
    const t = game.time;
    const [fx, fy] = game.showcaseFocus;
    cam.tx = fx + Math.sin(t * 0.07) * 6;
    cam.ty = fy + Math.cos(t * 0.05) * 5;
    cam.rot = (Math.floor(t / 14) % 4) as 0 | 1 | 2 | 3;
    render(ctx, canvas, game, cam, null, { kind: 'select' }, t);
  } else {
    ui.refresh(dt);
    if (ui.tool.kind !== 'transport') ui.activeRide = -1;
  render(ctx, canvas, game, cam, hover, ui.tool, game.time, wallPreview,
      ui.tool.kind === 'fence' || ui.tool.kind === 'gate' ? ui.tool.material : 'timber');
    autosaveT += dt;
    if (autosaveT > 90) { autosaveT = 0; game.save(0, true); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
