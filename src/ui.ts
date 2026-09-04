// ── UI layer: toolbar, flyouts, draggable windows, minimap, status bar ─────
import {
  SPECIES, SHOPS, SCENERY, BARRIERS, STAFF, siteDef, COSTS,
  TerrainId, SceneryId, ShopId, BarrierId, SceneryCategory, TransportId, TRANSPORT, GRID,
} from './data';
import {
  isMuted, setMuted, isMusicOff, setMusicOff, sfx, startAmbient, startMusic,
  playEvent, setAmbience, currentTrackName,
} from './sound';
import { STEPS } from './tutorial';
import { iconTag, spriteTag, applyIcons, icon } from './icons';
import { YEAR_SECONDS } from './game';
import { Game } from './game';
import { Camera, renderMinimap, toolCost } from './render';

export type Tool =
  | { kind: 'select' }
  | { kind: 'path' }
  | { kind: 'fence'; material: BarrierId }
  | { kind: 'gate'; material: BarrierId }
  | { kind: 'terrain'; terrain: TerrainId }
  | { kind: 'scenery'; scenery: SceneryId }
  | { kind: 'shop'; shop: ShopId }
  | { kind: 'animal'; species: string }
  | { kind: 'transport'; transport: TransportId }
  | { kind: 'bulldoze' };

const TOOL_NAMES: Record<Tool['kind'], string> = {
  select: 'Inspect', path: 'Build path', fence: 'Build fence', gate: 'Place gate',
  terrain: 'Paint terrain', scenery: 'Place scenery', shop: 'Build shop',
  animal: 'Release animal', transport: 'Build transport', bulldoze: 'Demolish',
};

type AddCard = (
  emoji: string, name: string, subtitle: string, cost: string, tool: Tool, active: boolean,
  locked?: boolean,
) => void;

interface Win {
  el: HTMLElement;
  body: HTMLElement;
  render: () => void;
}

const $ = (id: string) => document.getElementById(id)!;

export class UI {
  tool: Tool = { kind: 'select' };
  private game: Game;
  private cam: Camera;
  private wins = new Map<string, Win>();
  private winZ = 20;
  private refreshT = 0;
  private minimapT = 0;
  private mmCtx: CanvasRenderingContext2D;
  private hoverTile: [number, number] | null = null;
  /** The transport line currently being extended, or -1. */
  activeRide = -1;
  private tutStep = -1;          // -1 = tutorial not running
  private tutT = 0;

  constructor(
    game: Game, cam: Camera,
    private onNewGame: () => void,
    private onLoadGame: (g: Game) => void = () => {},
  ) {
    this.game = game;
    this.cam = cam;
    this.mmCtx = ($('minimap') as HTMLCanvasElement).getContext('2d')!;
    this.mmCtx.imageSmoothingEnabled = false;
    applyIcons();
    this.buildToolbar();
    this.bindTopBar();
    this.bindViewPanel();
  }

  setGame(g: Game, guided = false) {
    this.game = g;
    for (const [id] of this.wins) this.closeWindow(id);
    this.tutStep = guided ? 0 : -1;
    this.tutT = 0;
    this.renderTutorial();
  }

  // ── guided first run ─────────────────────────────────────────────────────
  private renderTutorial() {
    const panel = $('tutorial');
    document.querySelectorAll('.tut-target').forEach(e => e.classList.remove('tut-target'));
    if (this.tutStep < 0 || this.tutStep >= STEPS.length) {
      panel.classList.remove('on');
      return;
    }
    const step = STEPS[this.tutStep];
    panel.classList.add('on');
    $('tut-step').textContent = `${this.tutStep + 1} / ${STEPS.length}`;
    $('tut-title').textContent = step.title;
    $('tut-body').innerHTML = step.body;
    $('tut-next').classList.toggle('on', !!step.manual);
    $('tut-next').textContent = this.tutStep === STEPS.length - 1 ? 'Start playing' : 'Got it';
    $('tut-hint').classList.remove('on');
    if (step.highlight) document.getElementById(step.highlight)?.classList.add('tut-target');
  }

  private advanceTutorial() {
    this.tutStep++;
    this.tutT = 0;
    sfx.cash();
    if (this.tutStep >= STEPS.length) this.endTutorial();
    else this.renderTutorial();
  }

  endTutorial() {
    this.tutStep = -1;
    this.renderTutorial();
  }

  private tickTutorial(dt: number) {
    if (this.tutStep < 0) return;
    const step = STEPS[this.tutStep];
    this.tutT += dt;
    // surface the extra hint if they've been stuck on this step a while
    if (step.hint && this.tutT > 22) {
      const h = $('tut-hint');
      h.textContent = step.hint;
      h.classList.add('on');
    }
    if (!step.manual && step.check?.(this.game)) this.advanceTutorial();
  }

  setHover(t: [number, number] | null) { this.hoverTile = t; }

  // ── top bar ──────────────────────────────────────────────────────────────
  private bindTopBar() {
    const speeds: [string, number][] = [['btn-pause', 0], ['btn-play', 1], ['btn-med', 2], ['btn-fast', 3]];
    for (const [id, s] of speeds) $(id).onclick = () => { this.game.speed = s; };
    $('btn-save').onclick = () => this.toggleWindow('saves');
    $('btn-new').onclick = () => {
      if (confirm('Start a new zoo? Any unsaved progress is lost.')) this.onNewGame();
    };
    $('btn-goals').onclick = () => this.toggleWindow('goals');
    $('btn-alerts').onclick = () => this.toggleWindow('alerts');
    $('btn-music').onclick = () => {
      setMusicOff(!isMusicOff());
      this.refreshSoundIcon();
      if (!isMusicOff()) this.game.say(`♪ Now playing: ${currentTrackName()}`, 'info');
    };
    $('btn-sound').onclick = () => {
      setMuted(!isMuted());
      this.refreshSoundIcon();
      if (!isMuted()) sfx.click();
    };
    this.refreshSoundIcon();
    ($('outcome-new') as HTMLElement).onclick = () => this.onNewGame();
    ($('tut-next') as HTMLElement).onclick = () => this.advanceTutorial();
    ($('tut-skip') as HTMLElement).onclick = () => this.endTutorial();
    $('btn-zoo').onclick = () => this.toggleWindow('zoo');
    $('btn-staff').onclick = () => this.toggleWindow('staff');
    $('btn-finance').onclick = () => this.toggleWindow('finance');
    $('btn-animals').onclick = () => this.toggleWindow('animals');
    $('btn-guests').onclick = () => this.toggleWindow('guests');
    $('btn-log').onclick = () => this.toggleWindow('log');
    $('btn-help').onclick = () => this.toggleWindow('help');
  }

  /** Keep both sound buttons showing the right speaker icon. */
  refreshSoundIcon() {
    const set = (id: string, name: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dataset.icon = name;
      const img = el.querySelector('img.ico');
      if (img) img.setAttribute('src', icon(name));
    };
    set('btn-sound', isMuted() ? 'soundOff' : 'soundOn');
    set('m-sound', isMuted() ? 'soundOff' : 'soundOn');
    set('btn-music', isMusicOff() || isMuted() ? 'musicOff' : 'musicOn');
  }

  private bindViewPanel() {
    $('btn-rot-l').onclick = () => this.rotate(-1);
    $('btn-rot-r').onclick = () => this.rotate(1);
    $('btn-zoom-in').onclick = () => { this.cam.zoom = Math.min(3, this.cam.zoom * 1.25); };
    $('btn-zoom-out').onclick = () => { this.cam.zoom = Math.max(0.4, this.cam.zoom / 1.25); };
    const mm = $('minimap') as HTMLCanvasElement;
    mm.onclick = e => {
      const r = mm.getBoundingClientRect();
      this.cam.tx = ((e.clientX - r.left) / r.width) * GRID;
      this.cam.ty = ((e.clientY - r.top) / r.height) * GRID;
    };
  }

  rotate(dir: 1 | -1) {
    this.cam.rot = (((this.cam.rot + dir) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
  }

  // ── toolbar ──────────────────────────────────────────────────────────────
  private buildToolbar() {
    const bar = $('toolbar');
    const sub = $('submenu');
    bar.innerHTML = '';

    const clear = () => bar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    const mk = (iconName: string, label: string, title: string, tool: Tool, flyout?: (add: AddCard) => void) => {
      const b = document.createElement('button');
      b.className = 'btn tool-btn';
      b.id = 'tool-' + tool.kind;
      b.innerHTML = `${iconTag(iconName, 'tool-ico')}<span class="tool-label">${label}</span>`;
      b.title = title;
      b.onclick = () => {
        clear();
        b.classList.add('active');
        this.tool = tool;
        sub.innerHTML = '';
        sub.classList.toggle('open', !!flyout);
        if (flyout) {
          const head = document.createElement('div');
          head.className = 'sub-head';
          head.textContent = label;
          sub.appendChild(head);
          flyout(this.makeAddCard(sub));
        }
      };
      bar.appendChild(b);
      return b;
    };

    mk('cursor', 'Inspect', 'Click animals, guests or habitats for details', { kind: 'select' }).classList.add('active');
    mk('path', 'Path', `Guest walkway — $${COSTS.path} per tile`, { kind: 'path' });
    mk('fence', 'Barrier', 'Drag along a tile edge to lay a straight run', { kind: 'fence', material: 'timber' }, add => {
      BARRIERS.forEach((b, i) =>
        add('@wall_' + b.id + '_2', b.name,
          `Strength ${b.strength}/3 · ${b.seeThrough ? 'guests can see through' : 'blocks the view'} · ${b.blurb}`,
          `$${b.cost}`, { kind: 'fence', material: b.id }, i === 0));
    });
    mk('gate', 'Gate', 'Keeper access — put one in a barrier you have built', { kind: 'gate', material: 'timber' }, add => {
      BARRIERS.forEach((b, i) =>
        add('@gate_' + b.id + '_2', b.name + ' Gate', `Matches your ${b.name.toLowerCase()} · keepers need one to get in`,
          `$${b.cost + COSTS.gate}`, { kind: 'gate', material: b.id }, i === 0));
    });

    mk('terrain', 'Land', 'Paint the ground animals live on', { kind: 'terrain', terrain: 'grass' }, add => {
      const opts: [TerrainId, string, string, string][] = [
        ['grass', '🟩', 'Grass', 'Roos, koalas, emus, cassowaries'],
        ['sand',  '🟨', 'Sand',  'Dry-country species'],
        ['dirt',  '🟫', 'Dirt',  'Dingoes and wombats'],
        ['water', '🟦', 'Water', 'Required by platypus and crocs'],
      ];
      opts.forEach(([id, emoji, name, sub2], i) =>
        add(emoji, name, sub2, `$${COSTS.terrain}`, { kind: 'terrain', terrain: id }, i === 0));
    });

    const menu = (iconName: string, label: string, title: string, cat: SceneryCategory) => {
      const items = SCENERY.filter(s => s.category === cat);
      mk(iconName, label, title, { kind: 'scenery', scenery: items[0].id }, add => {
        items.forEach((s, i) => {
          const facts = cat === 'enrichment' ? `Enrichment ${s.enrichment}`
            : cat === 'feeding' ? (s.foodCapacity ? `+${s.foodCapacity} trough capacity` : 'Steady welfare bonus')
            : s.guestItem ? 'For guest paths' : `Beauty ${s.beauty}`;
          add('@' + s.id, s.name, `${facts} · ${s.blurb}`, `$${s.cost}`,
            { kind: 'scenery', scenery: s.id }, i === 0);
        });
      });
    };
    menu('enrich', 'Enrich', 'Items that go inside a habitat and lift animal welfare', 'enrichment');
    menu('feeding', 'Feeding', 'Feeding and watering — keeps a habitat fed between keeper visits', 'feeding');
    menu('scenery', 'Scenery', 'Zoo surrounds: planting, benches, bins and signage', 'scenery');

    mk('shop', 'Shops', 'Facilities that keep guests happy (must touch a path)', { kind: 'shop', shop: 'food' }, add => {
      SHOPS.forEach((s, i) =>
        add(s.emoji, s.name, `Sells at $${s.price} · upkeep $${s.upkeepMonthly}/mo`, `$${s.cost}`,
          { kind: 'shop', shop: s.id }, i === 0));
    });

    mk('animal', 'Animals', 'Buy animals — click inside a gated habitat', { kind: 'animal', species: SPECIES[0].id }, add => {
      SPECIES.forEach((s, i) => {
        const locked = !this.game.unlocked(s);
        add(locked ? '#lock' : '@animal_' + s.id + '_0', s.name,
          locked
            ? `Unlocks at zoo rating ${s.unlockRating}`
            : `Appeal ${s.appeal}/10 · ${s.tilesPerAnimal} tiles each · group of ${s.socialMin}+ · ` +
              `barrier ${s.strength}/3 · lives ~${s.lifespan}y` + (s.needsWater ? ' · needs water' : ''),
          locked ? `${s.unlockRating}` : `$${s.cost}`,
          { kind: 'animal', species: s.id }, i === 0, locked);
      });
    });

    mk('transport', 'Transport', 'Guest rides — click to drop a station, click again to run track onward',
      { kind: 'transport', transport: 'monorail' }, add => {
      TRANSPORT.forEach((t, i) =>
        add('@vehicle_' + t.id, t.name,
          `$${t.trackPerTile}/tile track · $${t.fare} fare · carries ${t.capacity}` +
          (t.viewsAnimals ? ' · riders see the animals' : ''),
          `$${t.stationCost}`, { kind: 'transport', transport: t.id }, i === 0));
    });

    mk('demolish', 'Demolish', `Remove things (refunds ${Math.round(COSTS.bulldozeRefund * 100)}%)`, { kind: 'bulldoze' });
  }

  private makeAddCard(sub: HTMLElement) {
    return (emoji: string, name: string, subtitle: string, cost: string, tool: Tool, active: boolean, locked = false) => {
      const c = document.createElement('button');
      c.className = 'card' + (active && !locked ? ' active' : '') + (locked ? ' locked' : '');
      // `emoji` is now a sprite key when one exists, else a plain glyph
      // '@name' pulls a game sprite, '#name' a UI icon, anything else is literal text
      const art = emoji.startsWith('@') ? spriteTag(emoji.slice(1))
        : emoji.startsWith('#') ? iconTag(emoji.slice(1), 'card-ico') : '';
      c.innerHTML =
        (art || `<span class="card-emoji">${emoji}</span>`) +
        `<span class="card-text"><span class="card-name">${name}</span><br>` +
        `<span class="card-sub">${subtitle}</span></span>` +
        `<span class="card-cost">${cost}</span>`;
      c.onclick = () => {
        if (locked) { sfx.error(); return; }
        sub.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        // choosing a different vehicle starts a fresh line rather than
        // continuing the one already under construction
        if (tool.kind === 'transport') this.activeRide = -1;
        this.tool = tool;
        sfx.click();
      };
      sub.appendChild(c);
    };
  }

  // ── window system ────────────────────────────────────────────────────────
  private toggleWindow(id: string) {
    if (this.wins.has(id)) this.closeWindow(id);
    else this.openWindow(id);
  }

  closeWindow(id: string) {
    const w = this.wins.get(id);
    if (w) { w.el.remove(); this.wins.delete(id); }
  }

  private openWindow(id: string, at?: [number, number]) {
    const existing = this.wins.get(id);
    if (existing) { existing.el.style.zIndex = String(++this.winZ); existing.render(); return; }

    const spec = this.windowSpec(id);
    if (!spec) return;

    const el = document.createElement('div');
    el.className = 'win';
    el.style.zIndex = String(++this.winZ);
    const [px, py] = at ?? this.nextSlot();
    el.style.left = px + 'px';
    el.style.top = py + 'px';
    el.innerHTML =
      `<div class="win-bar"><span class="win-title">${spec.title}</span><span class="win-close">✕</span></div>` +
      `<div class="win-body"></div>`;
    $('windows').appendChild(el);

    const body = el.querySelector('.win-body') as HTMLElement;
    const win: Win = { el, body, render: () => spec.render(body) };
    this.wins.set(id, win);

    (el.querySelector('.win-close') as HTMLElement).onclick = () => this.closeWindow(id);
    el.onmousedown = () => { el.style.zIndex = String(++this.winZ); };
    this.makeDraggable(el, el.querySelector('.win-bar') as HTMLElement);
    win.render();
  }

  /** Stack windows down the right edge, starting a new column when one fills up. */
  private nextSlot(): [number, number] {
    const W = 312, GAP = 8, TOP = 82;
    for (let col = 0; col < 4; col++) {
      const left = window.innerWidth - 20 - (col + 1) * (W + GAP);
      let y = TOP;
      for (const w of this.wins.values()) {
        if (Math.abs(w.el.offsetLeft - left) > 40) continue;
        y = Math.max(y, w.el.offsetTop + w.el.offsetHeight + GAP);
      }
      if (y + 140 < window.innerHeight - 170) return [left, y];
    }
    return [window.innerWidth - 20 - W - GAP, TOP + this.wins.size * 26];
  }

  private makeDraggable(el: HTMLElement, handle: HTMLElement) {
    let ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      el.style.left = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - ox)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  // ── inspect entry points ─────────────────────────────────────────────────
  openHabitat(id: number) { this.closeWindow('inspect'); this.inspectTarget = { type: 'habitat', id }; this.openWindow('inspect'); }
  openAnimal(id: number) { this.closeWindow('inspect'); this.inspectTarget = { type: 'animal', id }; this.openWindow('inspect'); }
  openStaff(id: number) { this.closeWindow('inspect'); this.inspectTarget = { type: 'staff', id }; this.openWindow('inspect'); }
  openGuest(id: number) { this.closeWindow('inspect'); this.inspectTarget = { type: 'guest', id }; this.openWindow('inspect'); }
  hidePanel() { this.closeWindow('inspect'); }

  private inspectTarget: { type: 'habitat' | 'animal' | 'guest' | 'staff'; id: number } | null = null;

  // ── window definitions ───────────────────────────────────────────────────
  private windowSpec(id: string): { title: string; render: (b: HTMLElement) => void } | null {
    const g = () => this.game;
    switch (id) {
      case 'goals': return { title: this.game.scenario.name, render: b => this.renderGoals(b) };
      case 'alerts': return { title: 'Alerts', render: b => this.renderAlerts(b) };
      case 'zoo': return { title: 'Zoo Overview', render: b => this.renderZoo(b) };
      case 'staff': return { title: 'Staff', render: b => this.renderStaff(b) };
      case 'saves': return { title: 'Save & Load', render: b => this.renderSaves(b) };
      case 'finance': return { title: 'Finances', render: b => this.renderFinance(b) };
      case 'animals': return { title: 'Animals', render: b => this.renderAnimalList(b) };
      case 'guests': return { title: 'Guests', render: b => this.renderGuestList(b) };
      case 'log': return { title: 'Messages', render: b => this.renderLog(b) };
      case 'help': return { title: 'How to play', render: b => this.renderHelp(b) };
      case 'inspect': return { title: this.inspectTitle(), render: b => this.renderInspect(b) };
      default: return null;
    }
  }

  private inspectTitle(): string {
    const t = this.inspectTarget;
    if (!t) return 'Details';
    if (t.type === 'habitat') return `Habitat #${t.id}`;
    if (t.type === 'animal') {
      const a = this.game.animals.find(x => x.id === t.id);
      const def = a && SPECIES.find(s => s.id === a.species);
      return def ? def.name : 'Animal';
    }
    if (t.type === 'staff') {
      const st = this.game.staff.find(x => x.id === t.id);
      const def = st && STAFF.find(d => d.role === st.role);
      return st ? st.name : 'Staff';
    }
    const gu = this.game.guests.find(x => x.id === t.id);
    return gu ? gu.name : 'Guest';
  }

  /** Conservation release, or the reason this animal isn't ready. */
  private releaseBlock(a: any): string {
    if (!a.bornHere) return '';
    const why = this.game.canRelease(a);
    return `<hr><div class="sub-head">Conservation</div>` + (why
      ? `<p class="hint">Born at this zoo. ${why}</p>`
      : `<p class="hint">Born at this zoo and ready to go home.</p>
         <button class="btn wide" id="p-release">🌏 Release to the wild</button>`);
  }

  private meter(v: number, colour?: string): string {
    const pct = Math.max(0, Math.min(100, v));
    const c = colour ?? (pct > 60 ? 'var(--good)' : pct > 33 ? 'var(--warn)' : 'var(--bad)');
    return `<span class="meter"><span class="meter-fill" style="width:${pct}%;background-color:${c}"></span></span>`;
  }

  private renderGoals(b: HTMLElement) {
    const g = this.game;
    const prog = g.objectiveProgress();
    const sc = g.scenario;
    const yearsLeft = sc.deadlineYear - g.year;
    const site = siteDef(g.site);
    b.innerHTML = `
      <p class="hint" style="margin-top:0"><b>${site.name}</b> — ${site.subtitle}</p>
      <p class="hint">${sc.brief}</p>
      ${sc.kind === 'recreate'
        ? `<p class="hint"><b>Signature species:</b> ${site.signature
            .map(id => SPECIES.find(x => x.id === id)!.name).join(', ')}.</p>` : ''}
      <hr>
      ${prog.map(p => {
        const pct = Math.min(100, (p.current / p.target) * 100);
        return `<div class="obj ${p.done ? 'done' : ''}">
          <div class="obj-top"><span>${p.done ? '✔ ' : ''}${p.label}</span>
            <b>${p.current} / ${p.target}</b></div>
          ${this.meter(pct, p.done ? 'var(--good)' : undefined)}</div>`;
      }).join('')}
      <hr>
      <div class="row"><span>Deadline</span><b>start of Year ${sc.deadlineYear}</b></div>
      <div class="row"><span>Time remaining</span><b style="color:${yearsLeft <= 1 ? 'var(--bad)' : 'var(--ink)'}">
        ${yearsLeft} year${yearsLeft === 1 ? '' : 's'}</b></div>
      <div class="row"><span>Bankrupt below</span><b>$${sc.bankruptAt.toLocaleString()}</b></div>
      <p class="hint">Meet every objective before Year ${sc.deadlineYear} begins. Better species
      unlock as your rating climbs.</p>`;
  }

  private renderAlerts(b: HTMLElement) {
    const list = this.game.alerts();
    if (!list.length) {
      b.innerHTML = '<p class="hint">Nothing needs your attention. Nice work.</p>';
      return;
    }
    b.innerHTML = list.map((a, i) =>
      `<div class="list-item" data-i="${i}">
        <span class="pill ${a.kind === 'bad' ? 'bad' : 'warn'}">${a.kind === 'bad' ? '!' : '?'}</span>
        <span class="grow">${a.text}</span></div>`).join('');
    b.querySelectorAll('.list-item').forEach(el => {
      (el as HTMLElement).onclick = () => {
        const at = list[Number((el as HTMLElement).dataset.i)].at;
        if (at) { this.cam.tx = at[0]; this.cam.ty = at[1]; }
      };
    });
  }

  private renderZoo(b: HTMLElement) {
    const g = this.game;
    const avgW = g.animals.length
      ? Math.round(g.animals.reduce((s, a) => s + a.welfare, 0) / g.animals.length) : 0;
    const happy = g.guests.length
      ? Math.round(g.guests.reduce((s, x) => s + x.happiness, 0) / g.guests.length) : 0;
    const species = new Set(g.animals.map(a => a.species)).size;
    b.innerHTML = `
      <div class="row"><span>Zoo rating</span><b>${g.rating} / 999</b></div>
      <div class="row"><span>Reputation</span>${this.meter(g.rating / 9.99)}</div>
      <hr>
      <div class="row"><span>Animals</span><b>${g.animals.length} (${species} species)</b></div>
      <div class="row"><span>Avg welfare</span>${this.meter(avgW)}<b>${avgW}%</b></div>
      <div class="row"><span>Guests here now</span><b>${g.guests.length}</b></div>
      <div class="row"><span>Avg happiness</span>${this.meter(happy)}<b>${happy}%</b></div>
      <div class="row"><span>Guests all-time</span><b>${g.guestsSinceStart}</b></div>
      <hr>
      <div class="sub-head">Education &amp; conservation</div>
      <div class="row"><span>Guests educated</span><b>${g.educatedTotal}</b></div>
      <div class="row"><span>Released to the wild</span><b>${g.released}</b></div>
      <div class="row"><span>Conservation credits</span><b>${g.conservation}</b></div>
      <hr>
      <div class="row"><span>Admission price</span><span>
        <button class="btn mini" id="adm-down">−</button>
        <b style="padding:0 6px">$${g.admission}</b>
        <button class="btn mini" id="adm-up">+</button></span></div>
      <div class="row"><span>Staff on the books</span><b>${g.staff.length}</b></div>
      <p class="hint">Price too high and guests won't come through the gate at all.
      Hire and manage your team in the <b>🧑‍🌾 Staff</b> window.</p>`;
    $('adm-up').onclick = () => { g.admission = Math.min(60, g.admission + 1); this.renderZoo(b); };
    $('adm-down').onclick = () => { g.admission = Math.max(0, g.admission - 1); this.renderZoo(b); };
  }

  /** Hire, fire, and see what each staff member is actually doing right now. */
  /** Three named slots, plus export/import so a zoo can leave the browser. */
  private renderSaves(b: HTMLElement) {
    const g = this.game;
    const slots = [...Array(Game.SLOTS)].map((_, i) => Game.slotInfo(i));
    const ago = (t: number) => {
      const m = Math.round((Date.now() - t) / 60000);
      return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
    };
    b.innerHTML = slots.map((info, i) => `
      <div style="margin:9px 0">
        <div class="row" style="margin:0"><span><b>Slot ${i + 1}</b></span>
          <span>
            <button class="btn mini" data-save="${i}">Save</button>
            <button class="btn mini" data-load="${i}" ${info ? '' : 'disabled'}>Load</button>
            <button class="btn mini" data-del="${i}" ${info ? '' : 'disabled'}>✕</button>
          </span></div>
        <div class="hint" style="margin-top:2px">${info
          ? `${info.label}<br>${info.date} · rating ${info.rating} · ${info.guests} visitors
             <span style="opacity:0.6">· saved ${ago(info.savedAt)}</span>`
          : '<i>empty</i>'}</div>
      </div>`).join('<hr style="margin:4px 0">') + `
      <hr>
      <div class="sub-head">Keep a copy</div>
      <button class="btn wide" id="sv-export">⬇ Download this zoo as a file</button>
      <button class="btn wide" id="sv-import">⬆ Load a zoo from a file</button>
      <input type="file" id="sv-file" accept=".json,application/json" style="display:none">
      <p class="hint">Slots live in this browser only — clearing site data wipes them. Download a
      copy to keep a zoo safe or move it to another machine. The game also autosaves to Slot 1
      every 90 seconds.</p>`;

    b.querySelectorAll('[data-save]').forEach(el => {
      (el as HTMLElement).onclick = () => {
        g.save(Number((el as HTMLElement).dataset.save));
        sfx.cash();
        this.renderSaves(b);
      };
    });
    b.querySelectorAll('[data-load]').forEach(el => {
      (el as HTMLElement).onclick = () => {
        const loaded = Game.load(Number((el as HTMLElement).dataset.load));
        if (loaded) this.onLoadGame(loaded); else sfx.error();
      };
    });
    b.querySelectorAll('[data-del]').forEach(el => {
      (el as HTMLElement).onclick = () => {
        Game.deleteSlot(Number((el as HTMLElement).dataset.del));
        this.renderSaves(b);
      };
    });
    $('sv-export').onclick = () => {
      const blob = new Blob([g.toJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `taronga-tycoon-${g.site}-y${g.year}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      g.say('Zoo downloaded.', 'good');
    };
    const file = $('sv-file') as HTMLInputElement;
    $('sv-import').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      const loaded = Game.fromJSON(await f.text());
      if (loaded) this.onLoadGame(loaded);
      else { sfx.error(); g.say("That file isn't a Taronga Tycoon zoo.", 'bad'); }
    };
  }

  private renderStaff(b: HTMLElement) {
    const g = this.game;
    const wages = g.staff.reduce((n, st) => n + STAFF.find(x => x.role === st.role)!.wage, 0);
    b.innerHTML = STAFF.map(st => {
      const crew = g.staff.filter(x => x.role === st.role);
      const load = g.staffLoad(st.role);
      const status = crew.length === 0
        ? { c: 'var(--ink-soft)', t: 'none on staff' }
        : load > 1.4 ? { c: 'var(--bad)', t: 'stretched — hire another' }
        : load > 0.8 ? { c: 'var(--warn)', t: 'busy' }
        : { c: 'var(--good)', t: 'coping fine' };
      return `<div style="margin:9px 0">
        <div class="row" style="margin:0">
          <span><b>${st.name}</b> <span style="opacity:0.65">$${st.wage}/mo</span></span>
          <span>
            <button class="btn mini" data-fire="${st.role}" ${crew.length ? '' : 'disabled'}>−</button>
            <b style="padding:0 7px">${crew.length}</b>
            <button class="btn mini" data-hire="${st.role}">+</button>
          </span></div>
        <div class="hint" style="margin:2px 0 4px">${st.blurb}
          <span style="color:${status.c}"> · ${status.t}</span></div>
        ${crew.map(p => `<div class="list-item" data-staff="${p.id}">
            ${spriteTag(st.role + '_0', 'list-ico', 20, 22)}
            <span class="grow"><b>${p.name}</b> — <span style="opacity:0.75">${g.staffTask(p)}</span></span>
            <span class="pill good">${p.jobsDone}</span>
          </div>`).join('')}
      </div>`;
    }).join('<hr style="margin:4px 0">') + `
      <hr>
      <div class="row"><span>Total wage bill</span><b>$${wages}/mo</b></div>
      <p class="hint">Wages come out with the monthly bills. A zoo with animals really wants at
      least one keeper; add a vet once you have a collection worth protecting.</p>`;
    b.querySelectorAll('[data-hire]').forEach(el => {
      (el as HTMLElement).onclick = () => { g.hireStaff((el as HTMLElement).dataset.hire as any); this.renderStaff(b); };
    });
    b.querySelectorAll('[data-fire]').forEach(el => {
      (el as HTMLElement).onclick = () => { g.fireStaff((el as HTMLElement).dataset.fire as any); this.renderStaff(b); };
    });
    // click a person to follow them and open their card
    b.querySelectorAll('[data-staff]').forEach(el => {
      (el as HTMLElement).onclick = () => {
        const id = Number((el as HTMLElement).dataset.staff);
        const p = g.staff.find(x => x.id === id);
        if (p) { this.cam.tx = p.x; this.cam.ty = p.y; this.openStaff(id); }
      };
    });
  }

  private renderFinance(b: HTMLElement) {
    const g = this.game;
    let feed = 0;
    for (const a of g.animals) feed += SPECIES.find(s => s.id === a.species)!.feedCostMonthly;
    let upkeep = 0;
    for (const t of g.tiles) if (t.shop) upkeep += SHOPS.find(s => s.id === t.shop)!.upkeepMonthly;
    const wages = g.keepers.length * COSTS.keeperWage;
    const profit = g.lastMonthIncome - g.lastMonthExpense;
    b.innerHTML = `
      <div class="row"><span>Funds</span><b style="color:${g.cash < 0 ? 'var(--bad)' : 'var(--ink)'}">
        $${Math.round(g.cash).toLocaleString()}</b></div>
      <hr>
      <div class="sub-head">This month</div>
      <div class="row"><span>Income</span><b style="color:var(--good)">+$${Math.round(g.monthIncome)}</b></div>
      <div class="row"><span>Spending</span><b style="color:var(--bad)">−$${Math.round(g.monthExpense)}</b></div>
      <hr>
      <div class="sub-head">Last month</div>
      <div class="row"><span>Income</span><b>+$${Math.round(g.lastMonthIncome)}</b></div>
      <div class="row"><span>Spending</span><b>−$${Math.round(g.lastMonthExpense)}</b></div>
      <div class="row"><span>Profit</span><b style="color:${profit >= 0 ? 'var(--good)' : 'var(--bad)'}">
        ${profit >= 0 ? '+' : '−'}$${Math.abs(Math.round(profit))}</b></div>
      <hr>
      <div class="sub-head">Recurring bills</div>
      <div class="row"><span>Animal feed</span><b>$${feed}/mo</b></div>
      <div class="row"><span>Shop upkeep</span><b>$${upkeep}/mo</b></div>
      <div class="row"><span>Keeper wages</span><b>$${wages}/mo</b></div>
      <div class="row"><span>Total</span><b>$${feed + upkeep + wages}/mo</b></div>
      <p class="hint">Admission is charged per guest at the gate. Shops earn on every purchase, so
      hungry guests with nowhere to spend are lost revenue.</p>`;
  }

  private renderAnimalList(b: HTMLElement) {
    const g = this.game;
    if (!g.animals.length) {
      b.innerHTML = `<p class="hint">No animals yet. Fence off an area, add a gate, then use the
        🦘 tool and click inside it.</p>`;
      return;
    }
    const rows = g.animals.map(a => {
      const def = SPECIES.find(s => s.id === a.species)!;
      const cls = a.habitatId < 0 ? 'bad' : a.welfare > 60 ? 'good' : a.welfare > 35 ? 'warn' : 'bad';
      const label = a.habitatId < 0 ? 'LOOSE' : a.welfare + '%';
      return `<div class="list-item" data-id="${a.id}">
        ${spriteTag('animal_' + def.id + '_0', 'list-ico', 26, 20)}<span class="grow">${def.name}</span>
        <span class="pill ${cls}">${label}</span></div>`;
    }).join('');
    b.innerHTML = rows;
    b.querySelectorAll('.list-item').forEach(el => {
      (el as HTMLElement).onclick = () => {
        const id = Number((el as HTMLElement).dataset.id);
        const a = g.animals.find(x => x.id === id);
        if (a) { this.cam.tx = a.x; this.cam.ty = a.y; this.openAnimal(id); }
      };
    });
  }

  private renderGuestList(b: HTMLElement) {
    const g = this.game;
    if (!g.guests.length) {
      b.innerHTML = `<p class="hint">Nobody's here yet. Guests arrive once there's a path from the
        entrance and something worth seeing.</p>`;
      return;
    }
    b.innerHTML = g.guests.slice(0, 60).map(gu => {
      const cls = gu.happiness > 60 ? 'good' : gu.happiness > 33 ? 'warn' : 'bad';
      const thought = gu.thoughts[gu.thoughts.length - 1] ?? 'Having a look around.';
      return `<div class="list-item" data-id="${gu.id}">
        <span class="grow"><b>${gu.name}</b> — <span style="opacity:0.75">${thought}</span></span>
        <span class="pill ${cls}">${Math.round(gu.happiness)}%</span></div>`;
    }).join('');
    b.querySelectorAll('.list-item').forEach(el => {
      (el as HTMLElement).onclick = () => {
        const id = Number((el as HTMLElement).dataset.id);
        const gu = g.guests.find(x => x.id === id);
        if (gu) { this.cam.tx = gu.x; this.cam.ty = gu.y; this.openGuest(id); }
      };
    });
  }

  private renderLog(b: HTMLElement) {
    const msgs = this.game.messages.slice(-40).reverse();
    b.innerHTML = msgs.length
      ? msgs.map(m => `<div class="log-line ${m.kind}">${m.text}</div>`).join('')
      : '<p class="hint">Nothing has happened yet.</p>';
  }

  private renderHelp(b: HTMLElement) {
    b.innerHTML = `
      <div class="sub-head">Building a habitat</div>
      <p class="hint" style="margin-top:2px">Barriers sit on the <b>edges between tiles</b>, so they
      cost you no habitat space and a path can run right up against them. With <b>🚧 Barrier</b>,
      click near the edge you want and <b>drag</b> to lay a straight run; four drags gives you a pen.
      Then put a <b>🚪 Gate</b> in one segment — without one, keepers can't get in and you can't
      stock the habitat.<br><br>
      <b>💥 Demolish</b> near an edge removes that segment; away from an edge it clears the tile.</p>
      <div class="sub-head" style="margin-top:9px">Barrier strength</div>
      <p class="hint" style="margin-top:2px">Every species needs a barrier rated for it (shown on its
      card, 1–3). A perimeter is only as strong as its <b>weakest segment</b> — one panel of hedge in
      a tiger enclosure and the tiger eventually walks out. Glass and stone are both escape-proof;
      only <b>stone blocks the view</b>, so guests won't see anything behind it. Glass costs more but
      keeps the enclosure watchable.</p>
      <div class="sub-head" style="margin-top:9px">Building menus</div>
      <p class="hint" style="margin-top:2px">
      <b>🧗 Enrich</b> goes inside a habitat and lifts welfare — climbing frames and feeder puzzles
      are worth far more than a boulder.<br>
      <b>🍽️ Feeding</b> deepens a habitat's trough so keepers need to visit less often; a Water
      Trough adds a steady welfare bonus.<br>
      <b>🌳 Scenery</b> is for the zoo surrounds — planting, benches, bins, lamps and signage.</p>
      <div class="sub-head" style="margin-top:9px">Staff</div>
      <p class="hint" style="margin-top:2px">Hire from the <b>🧑‍🌾 Staff</b> window: <b>keepers</b>
      feed habitats, <b>caretakers</b> sweep litter, <b>vets</b> treat sick animals before they die,
      and <b>educators</b> run keeper talks from a podium. The window shows what each is doing.</p>
      <div class="sub-head" style="margin-top:9px">Transport</div>
      <p class="hint" style="margin-top:2px">With <b>🚝 Transport</b>, click to drop a station beside
      a path, then click again further away to run track on to the next one — the line opens as soon
      as it has two stations. <b>Esc</b> finishes the line, and picking a different vehicle from the
      list also starts a fresh one.<br><br>
      Guests waiting on a platform pay a fare, arrive rested and happier, and on a <b>Cable Car</b>
      or <b>Safari Trail</b> they also see every habitat the route passes.<br><br>
      <b>💥 Demolish</b> on a station removes just that station and joins the line back up. Take a
      line down to one station and it stops running; remove the last one and the line is gone.</p>
      <div class="sub-head" style="margin-top:9px">Getting guests in</div>
      <p class="hint" style="margin-top:2px">Run a <b>🚶 Path</b> from the entrance arch. Guests only
      see animals from a path that runs <i>alongside</i> a habitat fence, so leave viewing lanes.
      Shops must touch a path too.</p>
      <div class="sub-head" style="margin-top:9px">Keeping animals well</div>
      <p class="hint" style="margin-top:2px">Welfare comes from space, ground type, food, company and
      enrichment. Match the ground to the species, give them room, put a few of the social ones
      together, and scatter scenery inside the pen.</p>
      <div class="sub-head" style="margin-top:9px">Animals have lives</div>
      <p class="hint" style="margin-top:2px">Animals age, and a healthy well-kept pair will breed —
      juveniles are drawn smaller. Neglect them and their <b>health</b> falls until they die, so a
      <b>vet</b> is worth hiring once you have a real collection. Better species unlock as your zoo
      rating climbs.</p>
      <div class="sub-head" style="margin-top:9px">Education &amp; conservation</div>
      <p class="hint" style="margin-top:2px">An <b>📖 Education Board</b> on a path near a habitat
      teaches guests about the animals — they leave happier and it counts toward your record. A
      <b>🎤 Talk Podium</b> staffed by an <b>Educator</b> runs keeper talks for everyone nearby.<br><br>
      Animals <i>born at your zoo</i> that grow up healthy and well-kept can be <b>released back into
      the wild</b> from their info panel. That is the whole point of the place, and the scenario
      asks you to do it.</p>
      <div class="sub-head" style="margin-top:9px">The two sites</div>
      <p class="hint" style="margin-top:2px"><b>Taronga Sydney</b> is a tight harbour headland with
      water on two sides and the city across the water — every metre has to earn its place. It has
      <b>two gates</b>: the ferry wharf on the harbour and the road entrance at the bottom of the
      map. Guests arrive at either and leave by whichever is nearer, so it pays to run a path
      between them.
      <b>Western Plains, Dubbo</b> is many times bigger, red earth and open country, with room for
      herds and a circuit long enough that guests will want a ride.<br><br>
      Each site has two challenges: <b>Build from scratch</b> starts you on empty ground with general
      objectives, while <b>Recreate it</b> asks you to rebuild the real zoo — all ten of that site's
      signature species, properly housed, at the welfare standard the real zoo keeps.</p>
      <div class="sub-head" style="margin-top:9px">Sound</div>
      <p class="hint" style="margin-top:2px">Three chiptune tracks — <i>Bushwalk</i>, <i>Canopy</i>
      and <i>Billabong</i> — cycle in the background. The speaker button mutes everything; the note
      button beside it turns the music off but keeps the zoo noises. Animals call out with their own
      voice when they arrive and now and then afterwards, so a zoo full of tigers sounds different
      from one full of penguins.</p>
      <div class="sub-head" style="margin-top:9px">Controls</div>
      <p class="hint" style="margin-top:2px">
        Drag to pan · scroll to zoom · <b>Q</b>/<b>E</b> rotate the view<br>
        <b>Space</b> pause · <b>1</b>/<b>2</b>/<b>3</b> speed · <b>Esc</b> back to Inspect<br>
        Drag with a build tool to lay a run of tiles. Autosaves every 90s.</p>`;
  }

  private renderInspect(b: HTMLElement) {
    const t = this.inspectTarget;
    const g = this.game;
    if (!t) return;

    if (t.type === 'habitat') {
      const hab = g.habitats.get(t.id);
      if (!hab) { b.innerHTML = '<p class="hint">This habitat no longer exists.</p>'; return; }
      const residents = g.animals.filter(a => a.habitatId === hab.id);
      const rows = [...g.speciesInHabitat(hab.id).entries()].map(([sid, n]) => {
        const def = SPECIES.find(s => s.id === sid)!;
        const ws = residents.filter(a => a.species === sid).map(a => a.welfare);
        const avg = Math.round(ws.reduce((s, w) => s + w, 0) / ws.length);
        return `<div class="row"><span>${def.name} ×${n}</span>${this.meter(avg)}<b>${avg}%</b></div>`;
      }).join('');
      // spell out exactly what is wrong rather than leaving the player to read bars
      const problems: string[] = [];
      if (!hab.hasGate) problems.push('No gate — keepers cannot get in.');
      const bySpecies = [...g.speciesInHabitat(hab.id).entries()];
      for (const [sid, n] of bySpecies) {
        const def = SPECIES.find(x => x.id === sid)!;
        const need = n * def.tilesPerAnimal;
        if (need > hab.tiles.length) {
          problems.push(`Too small for ${n} ${def.name}${n > 1 ? 's' : ''} — needs ${need} tiles, has ${hab.tiles.length}.`);
        }
        if (def.needsWater && hab.water === 0) problems.push(`${def.name}s need at least one water tile.`);
        if (n < def.socialMin) problems.push(`${def.name}s want a group of ${def.socialMin}+ — you have ${n}.`);
        const share = Object.entries(def.terrain)
          .map(([t, w]) => ({ t, w: w as number, have: (hab.terrainCount[t as TerrainId] ?? 0) / hab.tiles.length }))
          .filter(x => x.have < x.w * 0.6);
        for (const x of share) {
          problems.push(`${def.name}s want more ${x.t} — about ${Math.round(x.w * 100)}% of the pen.`);
        }
        if (hab.minStrength < def.strength) {
          problems.push(`Barrier too weak for ${def.name}s (${hab.minStrength}/${def.strength}) — they will escape.`);
        }
        const pop = bySpecies.reduce((t, [, c]) => t + c, 0);
        if (hab.enrichment < pop * 2) problems.push(`Not enough enrichment — add climbing frames, logs or a pool.`);
      }
      if (hab.food < hab.foodMax * 0.2) problems.push('Trough is nearly empty — a Feeding Station holds much more.');

      const terrain = Object.entries(hab.terrainCount)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${Math.round((n / hab.tiles.length) * 100)}%`).join(' · ');
      b.innerHTML = `
        ${hab.hasGate ? '' : '<div class="alert">No gate — keepers can\'t get in and you can\'t stock it.</div>'}
        <div class="row"><span>Size</span><b>${hab.tiles.length} tiles</b></div>
        <div class="row"><span>Ground</span><b style="font-size:10px">${terrain || '—'}</b></div>
        <div class="row"><span>Enrichment</span><b>${hab.enrichment}</b></div>
        <div class="row"><span>Trough</span>${this.meter((hab.food / hab.foodMax) * 100)}<b>${Math.round(hab.food)}/${hab.foodMax}</b></div>
        <button class="btn wide" id="p-feed">Fill trough — $20</button>
        <hr>
        ${rows || '<p class="hint">Empty. Pick a species with the 🦘 tool and click inside.</p>'}
        ${problems.length ? '<hr><div class="sub-head">Needs attention</div>' +
          [...new Set(problems)].map(p2 => `<div class="log-line bad">${p2}</div>`).join('') : ''}`;
      const feed = document.getElementById('p-feed');
      if (feed) feed.onclick = () => { g.fillTrough(hab.id); this.renderInspect(b); };
    }

    if (t.type === 'animal') {
      const a = g.animals.find(x => x.id === t.id);
      if (!a) { b.innerHTML = '<p class="hint">This animal is gone.</p>'; return; }
      const def = SPECIES.find(s => s.id === a.species)!;
      const w = g.animalWelfare(a);
      const p = (v: number) => Math.round(v * 100);
      b.innerHTML = `
        ${a.habitatId < 0 ? '<div class="alert">⚠️ ESCAPED — guests are panicking and your rating is suffering.</div><button class="btn wide" id="p-capture">Recapture — $150</button><hr>' : ''}
        <div class="row"><span><b>Welfare</b></span>${this.meter(w.total)}<b>${w.total}%</b></div>
        <div class="row"><span>Health</span>${this.meter(a.health)}<b>${Math.round(a.health)}%</b></div>
        <div class="row"><span>Age</span><b>${a.age.toFixed(1)} / ~${def.lifespan}y${a.age < def.matureAt ? ' (juvenile)' : ''}</b></div>
        <div class="row"><span>Sex</span><b>${a.sex === 'f' ? '♀ female' : '♂ male'}${a.gestation > 0 ? ' · expecting' : ''}</b></div>
        <hr>
        <div class="row"><span>Fed</span>${this.meter(p(w.food))}</div>
        <div class="row"><span>Space</span>${this.meter(p(w.space))}</div>
        <div class="row"><span>Ground</span>${this.meter(p(w.terrain))}</div>
        <div class="row"><span>Company</span>${this.meter(p(w.social))}</div>
        <div class="row"><span>Enrichment</span>${this.meter(p(w.enrich))}</div>
        ${this.releaseBlock(a)}
        <p class="hint"><b>${def.name}</b> — prefers ${Object.keys(def.terrain).join(' & ')}${def.needsWater ? ', must have water' : ''}.
        Wants ${def.tilesPerAnimal} tiles each and a group of ${def.socialMin}+.
        Appeal to guests ${def.appeal}/10 · feed $${def.feedCostMonthly}/mo.</p>`;
      const cap = document.getElementById('p-capture');
      if (cap) cap.onclick = () => { g.recaptureAnimal(a); this.renderInspect(b); };
      const rel = document.getElementById('p-release');
      if (rel) rel.onclick = () => { g.releaseToWild(a); this.hidePanel(); };
    }

    if (t.type === 'staff') {
      const st = g.staff.find(x => x.id === t.id);
      if (!st) { b.innerHTML = '<p class="hint">This person has left the zoo.</p>'; return; }
      const def = STAFF.find(x => x.role === st.role)!;
      const years = Math.max(0, (g.time - st.hiredOn) / YEAR_SECONDS);
      b.innerHTML = `
        <div class="row"><span>Role</span><b>${def.name}</b></div>
        <div class="row"><span>Wage</span><b>$${def.wage}/mo</b></div>
        <div class="row"><span>With the zoo</span><b>${years < 0.1 ? 'just started' : years.toFixed(1) + ' years'}</b></div>
        <div class="row"><span>Jobs completed</span><b>${st.jobsDone}</b></div>
        <hr>
        <div class="sub-head">Right now</div>
        <p class="hint" style="margin-top:2px">${g.staffTask(st)}</p>
        <p class="hint">${def.blurb}</p>
        <button class="btn wide" id="p-fire">Let ${st.name} go</button>`;
      const fire = document.getElementById('p-fire');
      if (fire) fire.onclick = () => { g.fireStaffMember(st.id); this.hidePanel(); };
    }

    if (t.type === 'guest') {
      const gu = g.guests.find(x => x.id === t.id);
      if (!gu) { b.innerHTML = '<p class="hint">This guest has gone home.</p>'; return; }
      const inv = (v: number) => 100 - v;
      b.innerHTML = `
        <div class="row"><span><b>Happiness</b></span>${this.meter(gu.happiness)}<b>${Math.round(gu.happiness)}%</b></div>
        <hr>
        <div class="row"><span>Hunger</span>${this.meter(inv(gu.hunger))}</div>
        <div class="row"><span>Thirst</span>${this.meter(inv(gu.thirst))}</div>
        <div class="row"><span>Toilet</span>${this.meter(inv(gu.bladder))}</div>
        <div class="row"><span>Energy</span>${this.meter(gu.energy)}</div>
        <hr>
        <div class="row"><span>Cash left</span><b>$${Math.round(gu.cash)}</b></div>
        <div class="row"><span>Spent here</span><b>$${Math.round(gu.bought)}</b></div>
        <div class="row"><span>Habitats seen</span><b>${gu.seen.size}</b></div>
        <hr>
        ${gu.thoughts.length
          ? gu.thoughts.slice(-4).reverse().map(t2 => `<div class="log-line">💭 ${t2}</div>`).join('')
          : '<p class="hint">No thoughts yet.</p>'}`;
    }
  }

  // ── per-frame ────────────────────────────────────────────────────────────
  refresh(dt: number) {
    const g = this.game;

    const cash = $('hud-cash');
    cash.textContent = '$' + Math.round(g.cash).toLocaleString();
    cash.classList.toggle('broke', g.cash < 0);
    $('hud-guests').textContent = String(g.guests.length);
    $('hud-rating').textContent = String(g.rating);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    $('hud-date').textContent = `${months[g.month - 1]} ${g.day} · Y${g.year}`;

    // alert badge
    const alerts = g.alerts();
    const badge = $('alert-badge');
    badge.textContent = String(alerts.length);
    badge.classList.toggle('on', alerts.length > 0);
    $('btn-alerts').classList.toggle('urgent', alerts.some(a => a.kind === 'bad'));

    // drain simulation events into sounds, and keep the ambience in step with
    // how busy the park is and which animals are actually in it
    for (const ev of g.events) playEvent(ev);
    g.events.length = 0;
    setAmbience(g.guests.length, [...new Set(g.animals.map(a => a.species))]);

    // end-of-scenario banner
    const out = $('outcome');
    if (g.outcome !== 'playing') {
      out.className = 'show ' + g.outcome;
      $('outcome-title').textContent = g.outcome === 'won' ? 'Zoo of the Year!' : 'Game Over';
      $('outcome-text').textContent = g.outcomeReason;
    } else {
      out.className = '';
    }

    for (const [id, s] of [['btn-pause', 0], ['btn-play', 1], ['btn-med', 2], ['btn-fast', 3]] as [string, number][]) {
      $(id).classList.toggle('active', g.speed === s);
    }
    for (const [id, win] of [['btn-zoo', 'zoo'], ['btn-finance', 'finance'], ['btn-animals', 'animals'],
      ['btn-guests', 'guests'], ['btn-log', 'log'], ['btn-help', 'help'],
      ['btn-goals', 'goals'], ['btn-alerts', 'alerts'], ['btn-staff', 'staff'],
      ['btn-save', 'saves']] as [string, string][]) {
      $(id).classList.toggle('active', this.wins.has(win));
    }

    // status bar: what the tool would do on the hovered tile
    $('status-tool').textContent = TOOL_NAMES[this.tool.kind]
      + (this.tool.kind === 'fence' || this.tool.kind === 'gate' ? ' (drag to lay a run)' : '')
      + (this.tool.kind === 'transport'
        ? (this.activeRide >= 0 ? ' (click the next station · Esc to finish)' : ' (click to place the first station)')
        : '');
    const costEl = $('status-cost');
    if (this.hoverTile) {
      const [x, y] = this.hoverTile;
      const t = g.tile(x, y);
      const parts: string[] = [t.path ? 'path' : t.terrain];
      if (t.shop) parts.push(SHOPS.find(s => s.id === t.shop)!.name);
      if (t.scenery) parts.push(SCENERY.find(s => s.id === t.scenery)!.name);
      if (t.habitatId >= 0) parts.push(`habitat #${t.habitatId}`);
      $('status-tile').textContent = `(${x}, ${y}) ${parts.join(', ')}`;
      const cost = toolCost(g, this.tool, x, y);
      if (this.tool.kind === 'select' || cost === null) {
        costEl.textContent = this.tool.kind === 'select' ? '' : "can't build here";
        costEl.className = this.tool.kind === 'select' ? '' : 'no';
      } else {
        costEl.textContent = cost === 0 ? 'refund' : `−$${cost}`;
        costEl.className = g.cash >= cost ? 'afford' : 'no';
      }
    } else {
      $('status-tile').textContent = '—';
      costEl.textContent = '';
    }

    // ticker shows the newest message, then fades out
    const last = g.messages[g.messages.length - 1];
    const tick = $('ticker');
    if (last && g.time - last.t < 7) {
      tick.textContent = last.text;
      tick.className = last.kind;
    } else {
      tick.className = 'hidden';
    }

    this.tickTutorial(dt);

    this.refreshT += dt;
    if (this.refreshT > 0.4) {
      this.refreshT = 0;
      for (const w of this.wins.values()) w.render();
    }
    this.minimapT += dt;
    if (this.minimapT > 0.25) {
      this.minimapT = 0;
      renderMinimap(this.mmCtx, g, this.cam, 150, document.getElementById('canvas') as HTMLCanvasElement);
    }
  }
}
