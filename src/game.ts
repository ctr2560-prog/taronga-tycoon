// ── Taronga Tycoon: world state + simulation ───────────────────────────────
import {
  GRID, START_CASH, DAY_LENGTH, GUEST_CAP, COSTS,
  SPECIES, SHOPS, SCENERY, BARRIERS, STAFF, SCENARIOS, TRANSPORT, GUEST_NAMES, STAFF_NAMES,
  scenarioDef, siteDef,
  TerrainId, SpeciesDef, ShopId, SceneryId, BarrierId, StaffRole, TransportId,
  SiteId, ScenarioId, ScenarioDef,
} from './data';
import { shapeSite } from './sites';

/** Edge directions, in the order used everywhere: N, E, S, W. */
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Offsets within two tiles, nearest first — used for "is there a habitat near this?" */
const NEARBY: [number, number][] = [];
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) NEARBY.push([dx, dy]);
}
NEARBY.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));

/** Seconds of simulated time in one game year, at 1x speed. */
export const YEAR_SECONDS = DAY_LENGTH * 30 * 12;
import { GUEST_SHIRTS, GUEST_SKINS } from './sprites';

/**
 * A wall byte packs the barrier material in the low bits and a gate flag on top,
 * so one Uint8Array still holds everything about an edge. 0 means no barrier.
 */
export type WallKind = number;
const GATE_BIT = 0x80;

export function wallMaterial(v: WallKind): BarrierId | null {
  const i = (v & 0x0f) - 1;
  return i >= 0 && i < BARRIERS.length ? BARRIERS[i].id : null;
}
export function wallIsGate(v: WallKind): boolean { return (v & GATE_BIT) !== 0; }
export function packWall(material: BarrierId, gate: boolean): WallKind {
  const i = BARRIERS.findIndex(b => b.id === material);
  return (i + 1) | (gate ? GATE_BIT : 0);
}
export function wallDef(v: WallKind) {
  const m = wallMaterial(v);
  return m ? BARRIERS.find(b => b.id === m)! : null;
}

/** Edge directions, in the order used everywhere: N, E, S, W. */


export interface Tile {
  terrain: TerrainId;
  path: boolean;
  scenery: SceneryId | null;
  shop: ShopId | null;
  habitatId: number;          // -1 = not inside any habitat
}

/** One segment of a wall run, addressed in canonical edge storage. */
export interface WallRef { h: boolean; x: number; y: number }

export interface Habitat {
  id: number;
  tiles: [number, number][];
  hasGate: boolean;
  minStrength: number;        // weakest link in the perimeter
  food: number;               // trough level 0-100
  troughAt: [number, number] | null;
  water: number;              // water tile count
  foodMax: number;            // trough capacity, raised by feeding stations
  hydration: number;          // from water troughs
  terrainCount: Record<TerrainId, number>;
  enrichment: number;         // from scenery inside
}

export type AnimalState = 'idle' | 'walk' | 'eat';

export interface Animal {
  id: number;
  species: string;
  x: number; y: number;
  tx: number; ty: number;     // move target
  habitatId: number;          // -1 = escaped!
  hunger: number;             // 0 good → 100 starving
  age: number;                // game years
  sex: 'm' | 'f';
  health: number;             // 0-100; hits zero and the animal dies
  gestation: number;          // -1 not pregnant, else years remaining
  bornHere: boolean;          // only captive-bred animals can be released to the wild
  state: AnimalState;
  stateT: number;
  dir: 1 | -1;
  frame: number; frameT: number;
  welfare: number;            // cached 0-100
}

export type GuestState = 'walk' | 'view' | 'buy' | 'leave';

export interface Guest {
  id: number;
  name: string;
  x: number; y: number;
  tx: number; ty: number;
  px: number; py: number;     // previous tile (avoid backtracking)
  shirt: number; skin: number;
  cash: number;
  hunger: number; thirst: number; bladder: number; energy: number;
  happiness: number;
  state: GuestState;
  stateT: number;
  dir: 1 | -1;
  frame: number; frameT: number;
  seen: Set<number>;          // habitat ids viewed
  learned: Set<number>;       // habitat ids they actually read about
  thoughts: string[];
  bought: number;             // spend total (stats)
}

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  hiredOn: number;            // game time, for "employed since"
  jobsDone: number;           // troughs filled, tiles swept, talks given
  x: number; y: number;
  tx: number; ty: number;
  targetHabitat: number;
  dir: 1 | -1;
  frame: number; frameT: number;
}

/** A guest transport line: a chain of stations with vehicles shuttling between them. */
export interface Ride {
  id: number;
  type: TransportId;
  stations: [number, number][];
  vehicles: { at: number; dir: 1 | -1; riders: number; wait: number }[];
  rides: number;          // total journeys sold
}

export interface Alert { kind: 'bad' | 'warn'; text: string; at?: [number, number] }

export interface Msg { text: string; t: number; kind: 'info' | 'good' | 'bad' }

let nextId = 1;
const uid = () => nextId++;

export type GameMode = 'scenario' | 'sandbox' | 'tutorial';

export class Game {
  mode: GameMode;
  site: SiteId;
  scenario: ScenarioDef;
  tiles: Tile[] = [];
  habitats = new Map<number, Habitat>();
  animals: Animal[] = [];
  guests: Guest[] = [];
  staff: Staff[] = [];
  litter = new Uint8Array(GRID * GRID);
  /** Natural planting and rocks the site was born with — decoration only. */
  decor = new Uint8Array(GRID * GRID);
  /** 0 land, 1 shallow, 2 deep — purely for how the water is drawn. */
  depth = new Uint8Array(GRID * GRID);
  /** 1 where the player may build. Water and the far shore are 0. */
  playable = new Uint8Array(GRID * GRID);
  /** 1 for ground that is not part of your site at all: the city, the islet,
   *  and open water. Unlike `playable` this excludes your own ponds and dams. */
  offsite = new Uint8Array(GRID * GRID);
  rides: Ride[] = [];
  /** Ferry runs, measured off the actual harbour so they never cross land. */
  ferryRoutes: { x1: number; y1: number; x2: number; y2: number; period: number }[] = [];
  /** Where the title-screen camera should drift around. */
  showcaseFocus: [number, number] = [GRID / 2, GRID / 2];
  events: string[] = [];                 // drained by the UI to trigger sounds
  outcome: 'playing' | 'won' | 'lost' = 'playing';
  outcomeReason = '';
  cash = START_CASH;
  day = 1; month = 1; year = 1;
  dayT = 0;
  speed = 1;                       // 0 paused, 1..3
  admission = 15;
  rating = 350;                    // 0-999 like RCT
  messages: Msg[] = [];
  /** Every way in and out. Guests arrive at one and may leave by whichever is nearer. */
  entrances: [number, number][] = [];
  /** What each gate looks like: the ferry wharf, or the heritage gatehouse. */
  entranceKinds: ('wharf' | 'gate')[] = [];
  get entrance(): [number, number] { return this.entrances[0] ?? [0, 0]; }
  pathDist = new Int16Array(GRID * GRID);  // BFS steps to entrance along paths
  totalEarned = 0; totalSpentMonthly = 0;
  monthIncome = 0; monthExpense = 0;
  lastMonthIncome = 0; lastMonthExpense = 0;
  guestsSinceStart = 0;
  educatedTotal = 0;          // times a guest learned something
  released = 0;               // animals sent back to the wild
  conservation = 0;           // conservation credits earned
  time = 0;
  private breedT = 0;

  get keepers(): Staff[] { return this.staff.filter(s => s.role === 'keeper'); }

  constructor(mode: GameMode = 'scenario', scenarioId: ScenarioId = 'taronga-new') {
    this.mode = mode;
    this.scenario = scenarioDef(scenarioId);
    this.site = this.scenario.site;
    this.cash = mode === 'sandbox' ? 250000 : this.scenario.startCash;
    for (let i = 0; i < GRID * GRID; i++) {
      this.tiles.push({
        terrain: 'grass', path: false, scenery: null, shop: null, habitatId: -1,
      });
    }
    shapeSite(this.site, this.tiles, this.decor, this.depth, this.playable, this.offsite);

    this.buildEntrance();
    this.buildFerryRoutes();
    this.recomputePaths();
    this.recomputeHabitats();
    this.say(mode === 'sandbox'
      ? `Sandbox at ${siteDef(this.site).name} — everything unlocked, no deadline.`
      : this.scenario.name + ' — check the Goals panel for what you need.', 'info');
  }

  tile(x: number, y: number): Tile { return this.tiles[y * GRID + x]; }
  canBuild(x: number, y: number) { return this.playable[y * GRID + x] === 1; }

  /**
   * Put the front gate where it belongs. On the harbour that means finding the
   * headland's own shoreline and running a ferry wharf out from it, so the
   * jetty is attached to the land rather than floating in the middle of the bay.
   */
  private buildEntrance() {
    const def = siteDef(this.site);
    const [ex] = def.entrance;
    if (this.site !== 'taronga') {
      this.roadGate(ex, def.entrance[1]);
      return;
    }

    // walk north from inside the headland until the land runs out
    let shore = Math.floor(GRID * 0.55);
    for (let y = shore; y >= 0; y--) {
      if (this.tile(ex, y).terrain === 'water') { shore = y + 1; break; }
    }
    // a long pier reaching well out into the harbour, so the arch stands clear
    // of the shore the way a real ferry wharf does
    const wharf = 8;
    const gateY = Math.max(1, shore - wharf);
    this.entrances.push([ex, gateY]);
    this.entranceKinds.push('wharf');
    // three tiles of jetty beyond the gate — the bit the ferry ties up against,
    // so the walkway runs *through* the archway rather than stopping at it
    for (let y = Math.max(0, gateY - 3); y < gateY; y++) {
      this.tile(ex, y).path = true;
      this.playable[y * GRID + ex] = 1;
      this.decor[y * GRID + ex] = 0;
    }
    for (let y = gateY; y <= shore + 6 && y < GRID; y++) {
      const t = this.tile(ex, y);
      t.path = true;
      this.playable[y * GRID + ex] = 1;
      // widen the apron where the wharf meets the land
      if (y >= shore && y <= shore + 1) {
        for (const dx of [-1, 1]) {
          const nx = ex + dx;
          if (nx < 0 || nx >= GRID) continue;
          const n = this.tile(nx, y);
          if (n.terrain !== 'water') { n.path = true; this.decor[y * GRID + nx] = 0; }
        }
      }
      this.decor[y * GRID + ex] = 0;
    }

    // keep the approach to the arch open — nobody wants to arrive facing a tree
    this.clearDecor(ex, gateY, 4);
    for (let y = gateY; y <= shore + 6 && y < GRID; y++) this.clearDecor(ex, y, 2);

    // the road gate at the top of the hill, the way most people actually arrive
    if (def.entrance2) this.roadGate(def.entrance2[0], def.entrance2[1]);
  }

  /**
   * Pick ferry runs by finding the longest unbroken stretch of open water on a
   * handful of rows. Following a single row guarantees the whole run is water,
   * which a straight line between two arbitrary water tiles does not — it would
   * happily cut the corner across the islet.
   */
  private buildFerryRoutes() {
    this.ferryRoutes = [];
    if (this.site !== 'taronga') return;

    const runs: { y: number; from: number; to: number }[] = [];
    for (let y = 2; y < GRID - 2; y++) {
      let start = -1;
      let best: { from: number; to: number } | null = null;
      for (let x = 0; x <= GRID; x++) {
        const open = x < GRID
          && this.tile(x, y).terrain === 'water'
          && this.depth[y * GRID + x] >= 2;      // keep clear of the shallows
        if (open && start < 0) start = x;
        if (!open && start >= 0) {
          const len = x - start;
          if (len >= 26 && (!best || len > best.to - best.from)) best = { from: start, to: x - 1 };
          start = -1;
        }
      }
      if (best) runs.push({ y, from: best.from + 2, to: best.to - 2 });
    }
    if (!runs.length) return;

    // three well-separated lanes across the harbour
    runs.sort((a, b) => (b.to - b.from) - (a.to - a.from));
    const chosen: typeof runs = [];
    for (const r of runs) {
      if (chosen.length >= 3) break;
      if (chosen.every(c => Math.abs(c.y - r.y) >= 5)) chosen.push(r);
    }
    for (const c of chosen) {
      const len = c.to - c.from;
      this.ferryRoutes.push({ x1: c.from, y1: c.y, x2: c.to, y2: c.y, period: len * 3.2 });
    }
  }

  /** Clear the natural planting around a point, so it never blocks a view. */
  private clearDecor(cx: number, cy: number, r: number) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        if (Math.hypot(x - cx, y - cy) <= r) this.decor[y * GRID + x] = 0;
      }
    }
  }

  /** A gate on a map edge with a path running in from it. */
  private roadGate(ex: number, ey: number) {
    this.entrances.push([ex, ey]);
    this.entranceKinds.push('gate');
    const inland = ey > GRID / 2 ? -1 : 1;
    for (let i = 0; i <= 10; i++) {
      const y = ey + i * inland;
      if (y < 0 || y >= GRID) break;
      // a paved forecourt at the gate, narrowing to a path further in
      const width = i <= 1 ? 2 : 0;
      for (let dx = -width; dx <= width; dx++) {
        const x = ex + dx;
        if (x < 0 || x >= GRID) continue;
        const t = this.tile(x, y);
        if (t.terrain === 'water') t.terrain = 'dirt';
        t.path = true;
        this.playable[y * GRID + x] = 1;
        this.decor[y * GRID + x] = 0;
      }
      this.clearDecor(ex, y, i <= 2 ? 4 : 2);
    }
  }

  // ── edge-mounted barriers ────────────────────────────────────────────────
  // Walls live on the lines *between* tiles, not on tiles. Each edge is stored
  // once: horizontal edges by the tile below them, vertical edges by the tile
  // to their right. wallH has one extra row and wallV one extra column so the
  // map's far edges have somewhere to live.
  wallH = new Uint8Array(GRID * (GRID + 1));   // edge on the NORTH side of (x, y)
  wallV = new Uint8Array((GRID + 1) * GRID);   // edge on the WEST side of (x, y)

  /** Canonical storage slot for the edge on side `dir` of tile (x, y). */
  edgeRef(x: number, y: number, dir: number): WallRef {
    switch (dir) {
      case 0: return { h: true, x, y };
      case 1: return { h: false, x: x + 1, y };
      case 2: return { h: true, x, y: y + 1 };
      default: return { h: false, x, y };
    }
  }

  wallRefAt(r: WallRef): WallKind {
    if (r.x < 0 || r.y < 0) return 0;
    if (r.h) return r.x >= GRID || r.y > GRID ? 0 : this.wallH[r.y * GRID + r.x] as WallKind;
    return r.x > GRID || r.y >= GRID ? 0 : this.wallV[r.y * (GRID + 1) + r.x] as WallKind;
  }

  setWallRef(r: WallRef, v: WallKind) {
    if (r.h) this.wallH[r.y * GRID + r.x] = v;
    else this.wallV[r.y * (GRID + 1) + r.x] = v;
  }

  wallAt(x: number, y: number, dir: number): WallKind {
    return this.wallRefAt(this.edgeRef(x, y, dir));
  }

  /** Can something walk from (x,y) to the adjacent tile on side `dir`? */
  private edgeOpen(x: number, y: number, dir: number): boolean {
    return this.wallAt(x, y, dir) === 0;
  }

  /**
   * The straight run of edges from the edge the drag started on to wherever the
   * cursor is now. Dragging locks to the axis of the first edge, so runs come
   * out straight instead of scattering across whichever edge is nearest.
   */
  wallRun(sx: number, sy: number, sdir: number, ex: number, ey: number): WallRef[] {
    const start = this.edgeRef(sx, sy, sdir);
    const out: WallRef[] = [];
    if (start.h) {
      const from = Math.min(start.x, ex), to = Math.max(start.x, ex);
      for (let x = from; x <= to; x++) if (x >= 0 && x < GRID) out.push({ h: true, x, y: start.y });
    } else {
      const from = Math.min(start.y, ey), to = Math.max(start.y, ey);
      for (let y = from; y <= to; y++) if (y >= 0 && y < GRID) out.push({ h: false, x: start.x, y });
    }
    return out;
  }

  /** Build (or upgrade) a run of wall. Returns how many segments changed. */
  buildWallRun(run: WallRef[], gate: boolean, material: BarrierId = 'timber'): number {
    // a barrier is only buildable if at least one side of the edge is yours
    run = run.filter(r => {
      const [ax, ay] = r.h ? [r.x, r.y] : [r.x, r.y];
      const [bx, by] = r.h ? [r.x, r.y - 1] : [r.x - 1, r.y];
      // buildable if either side is your own ground — which includes your ponds,
      // so a dam straddling the boundary can still be fenced across
      const mine = (px: number, py: number) =>
        px >= 0 && py >= 0 && px < GRID && py < GRID && !this.offsite[py * GRID + px];
      return mine(ax, ay) || mine(bx, by);
    });
    if (!run.length) { this.say('You cannot fence off the harbour.', 'bad'); return 0; }
    const want = packWall(material, gate);
    const def = BARRIERS.find(b => b.id === material)!;
    let built = 0;
    for (const r of run) {
      const have = this.wallRefAt(r);
      if (have === want) continue;
      // replacing an existing barrier only charges the difference in value
      const oldDef = wallDef(have);
      const price = Math.max(0, def.cost + (gate ? COSTS.gate : 0) - (oldDef ? oldDef.cost : 0));
      if (!this.charge(price)) break;
      this.setWallRef(r, want);
      built++;
    }
    if (built) this.recomputeHabitats();
    return built;
  }

  removeWall(r: WallRef): boolean {
    const have = this.wallRefAt(r);
    if (!have) return false;
    const def = wallDef(have);
    this.setWallRef(r, 0);
    this.cash += Math.round((def?.cost ?? COSTS.fence) * COSTS.bulldozeRefund);
    this.recomputeHabitats();
    return true;
  }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }

  say(text: string, kind: Msg['kind'] = 'info') {
    this.messages.push({ text, t: this.time, kind });
    if (this.messages.length > 60) this.messages.shift();
  }

  // ── construction ─────────────────────────────────────────────────────────
  /** Guard for every build route. Says why, once, rather than failing silently. */
  private offLimits(x: number, y: number): boolean {
    if (this.canBuild(x, y)) return true;
    this.say(this.tile(x, y).terrain === 'water'
      ? 'That is open water — you cannot build on the harbour.'
      : 'That is across the water. You can look, but not build there.', 'bad');
    return false;
  }

  private charge(amount: number): boolean {
    if (this.cash < amount) { this.say("Can't afford that!", 'bad'); return false; }
    this.cash -= amount;
    this.monthExpense += amount;
    return true;
  }

  buildPath(x: number, y: number): boolean {
    if (!this.offLimits(x, y)) return false;
    const t = this.tile(x, y);
    if (t.path || t.shop || t.terrain === 'water' || t.habitatId >= 0) return false;
    if (!this.charge(COSTS.path)) return false;
    t.path = true; t.scenery = null;
    this.decor[y * GRID + x] = 0;
    this.recomputePaths();
    return true;
  }

  paintTerrain(x: number, y: number, terrain: TerrainId): boolean {
    if (!this.offLimits(x, y)) return false;
    const t = this.tile(x, y);
    if (t.terrain === terrain || t.path || t.shop) return false;
    if (!this.charge(COSTS.terrain)) return false;
    t.terrain = terrain;
    if (terrain === 'water') t.scenery = null;
    this.recomputeHabitats();
    return true;
  }

  buildScenery(x: number, y: number, id: SceneryId): boolean {
    if (!this.offLimits(x, y)) return false;
    const t = this.tile(x, y);
    if (t.path || t.shop || t.scenery || t.terrain === 'water') return false;
    const def = SCENERY.find(s => s.id === id)!;
    if (!this.charge(def.cost)) return false;
    t.scenery = id;
    this.decor[y * GRID + x] = 0;
    this.recomputeHabitats();
    return true;
  }

  buildShop(x: number, y: number, id: ShopId): boolean {
    if (!this.offLimits(x, y)) return false;
    const t = this.tile(x, y);
    if (t.path || t.shop || t.terrain === 'water' || t.habitatId >= 0) return false;
    // must touch a path so guests can use it
    const touchesPath = this.neighbors(x, y).some(([nx, ny]) => this.tile(nx, ny).path);
    if (!touchesPath) { this.say('Shops must be built next to a path.', 'bad'); return false; }
    const def = SHOPS.find(s => s.id === id)!;
    if (!this.charge(def.cost)) return false;
    t.shop = id; t.scenery = null;
    this.decor[y * GRID + x] = 0;
    return true;
  }

  bulldoze(x: number, y: number): boolean {
    const t = this.tile(x, y);
    if ([x, y].toString() === this.entrance.toString()) { this.say("Can't demolish the entrance!", 'bad'); return false; }
    let refund = 0;
    if (t.shop) { refund = SHOPS.find(s => s.id === t.shop)!.cost; t.shop = null; }
    else if (t.scenery) { refund = SCENERY.find(s => s.id === t.scenery)!.cost; t.scenery = null; }
    else if (t.path) { refund = COSTS.path; t.path = false; }
    else return false;
    this.cash += Math.round(refund * COSTS.bulldozeRefund);
    this.recomputePaths();
    this.recomputeHabitats();
    return true;
  }

  buyAnimal(speciesId: string, habitatId: number): boolean {
    const def = SPECIES.find(s => s.id === speciesId)!;
    const hab = this.habitats.get(habitatId);
    if (!hab) return false;
    if (this.rating < def.unlockRating) {
      this.say(`${def.name}s unlock at a zoo rating of ${def.unlockRating}.`, 'bad');
      return false;
    }
    if (!hab.hasGate) { this.say('That habitat needs a gate so keepers can get in!', 'bad'); return false; }
    if (def.needsWater && hab.water === 0) { this.say(`${def.name}s need water in their habitat!`, 'bad'); return false; }
    if (!this.charge(def.cost)) return false;
    const [tx, ty] = hab.tiles[Math.floor(Math.random() * hab.tiles.length)];
    // arrive as young adults of mixed sex, and at varied ages so they don't all die at once
    this.animals.push({
      id: uid(), species: speciesId, x: tx + 0.5, y: ty + 0.5, tx: tx + 0.5, ty: ty + 0.5,
      habitatId, hunger: 20, state: 'idle', stateT: 1 + Math.random() * 2,
      dir: 1, frame: 0, frameT: 0, welfare: 50,
      age: def.matureAt + Math.random() * def.lifespan * 0.25,
      sex: this.animals.filter(a => a.species === speciesId).length % 2 === 0 ? 'f' : 'm',
      health: 100, gestation: -1, bornHere: false,
    });
    this.events.push('arrive');
    this.events.push('call:' + speciesId);
    this.say(`A ${def.name} has arrived at the zoo!`, 'good');
    return true;
  }

  /** Species you can actually buy right now. */
  unlocked(def: SpeciesDef): boolean {
    return this.mode === 'sandbox' || this.rating >= def.unlockRating;
  }

  fillTrough(habitatId: number): boolean {
    const hab = this.habitats.get(habitatId);
    if (!hab) return false;
    if (!this.charge(20)) return false;
    hab.food = hab.foodMax;
    return true;
  }

  recaptureAnimal(a: Animal): boolean {
    const def = SPECIES.find(s => s.id === a.species)!;
    // find a habitat that suits it (gate + water if needed)
    let target: Habitat | null = null;
    for (const h of this.habitats.values()) {
      if (h.hasGate && (!def.needsWater || h.water > 0)) { target = h; break; }
    }
    if (!target) { this.say('No suitable habitat to return it to!', 'bad'); return false; }
    if (!this.charge(150)) return false;
    const [tx, ty] = target.tiles[0];
    a.habitatId = target.id;
    a.x = tx + 0.5; a.y = ty + 0.5; a.tx = a.x; a.ty = a.y; a.state = 'idle'; a.stateT = 1;
    this.say(`The ${def.name} has been safely recaptured.`, 'good');
    return true;
  }

  countStaff(role: StaffRole): number { return this.staff.filter(s => s.role === role).length; }

  hireStaff(role: StaffRole): boolean {
    const def = STAFF.find(s => s.role === role)!;
    if (!this.charge(def.wage)) return false;
    const [ex, ey] = this.entrance;
    // give everyone a name that isn't already on the payroll
    const taken = new Set(this.staff.map(s => s.name));
    const free = STAFF_NAMES.filter(n => !taken.has(n));
    const name = (free.length ? free : STAFF_NAMES)[Math.floor(Math.random() * (free.length || STAFF_NAMES.length))];
    this.staff.push({
      id: uid(), name, role, hiredOn: this.time, jobsDone: 0,
      x: ex + 0.5, y: ey - 1 + 0.5, tx: ex + 0.5, ty: ey - 1 + 0.5,
      targetHabitat: -1, dir: 1, frame: 0, frameT: 0,
    });
    this.events.push('arrive');
    this.say(`${name} has joined the team as a ${def.name.toLowerCase()}.`, 'good');
    return true;
  }

  /** Fire one specific person rather than whoever happens to be last. */
  fireStaffMember(id: number): boolean {
    const i = this.staff.findIndex(s => s.id === id);
    if (i < 0) return false;
    const s = this.staff[i];
    this.staff.splice(i, 1);
    this.say(`${s.name} has left the zoo.`, 'info');
    return true;
  }

  /** What this person is doing right now, in plain words. */
  staffTask(s: Staff): string {
    if (s.role === 'keeper') {
      const hab = this.habitats.get(s.targetHabitat);
      if (hab) return `heading to habitat #${hab.id} with feed`;
      return this.habitats.size ? 'on rounds, nothing hungry' : 'no habitats to tend';
    }
    if (s.role === 'caretaker') {
      const n = this.litterTotal();
      return n ? `sweeping — ${n} tile${n > 1 ? 's' : ''} left` : 'paths are spotless';
    }
    if (s.role === 'vet') {
      const sick = this.animals.filter(a => a.health < 70).length;
      return sick ? `treating ${sick} sick animal${sick > 1 ? 's' : ''}` : 'every animal healthy';
    }
    return this.tiles.some(t => t.scenery === 'podium')
      ? 'running keeper talks' : 'idle — needs a Talk Podium';
  }

  /**
   * How stretched each role is, 0 = fine and 1+ = overloaded. Used for the
   * warning in the staff window so hiring is an informed decision.
   */
  staffLoad(role: StaffRole): number {
    const n = this.countStaff(role);
    if (role === 'keeper') {
      const stocked = [...this.habitats.values()].filter(h => this.animals.some(a => a.habitatId === h.id)).length;
      return n === 0 ? (stocked ? 99 : 0) : stocked / (n * 3);
    }
    if (role === 'caretaker') {
      const litter = this.litterTotal();
      return n === 0 ? litter / 8 : litter / (n * 10);
    }
    if (role === 'vet') {
      const sick = this.animals.filter(a => a.health < 70).length;
      return n === 0 ? sick / 1.5 : sick / (n * 4);
    }
    // one educator comfortably works a podium, so only flag them past that
    const podiums = this.tiles.filter(t => t.scenery === 'podium').length;
    return n === 0 ? (podiums ? 99 : 0) : podiums / (n * 1.5);
  }

  fireStaff(role: StaffRole): void {
    const i = this.staff.map(s => s.role).lastIndexOf(role);
    if (i >= 0) {
      this.staff.splice(i, 1);
      this.say(`A ${STAFF.find(s => s.role === role)!.name.toLowerCase()} has been let go.`, 'info');
    }
  }

  hireKeeper(): boolean { return this.hireStaff('keeper'); }
  fireKeeper(): void { this.fireStaff('keeper'); }

  neighbors(x: number, y: number): [number, number][] {
    const out: [number, number][] = [];
    if (x > 0) out.push([x - 1, y]);
    if (x < GRID - 1) out.push([x + 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (y < GRID - 1) out.push([x, y + 1]);
    return out;
  }

  // ── enclosure detection: flood from the map border across OPEN edges ─────
  // Anything the flood can't reach is walled in, so a hole in a wall instantly
  // merges that region back with the outside — which is exactly when animals
  // should escape.
  recomputeHabitats() {
    const outside = new Uint8Array(GRID * GRID);
    const stack: number[] = [];
    const seed = (x: number, y: number) => {
      const idx = y * GRID + x;
      if (!outside[idx]) { outside[idx] = 1; stack.push(idx); }
    };
    for (let i = 0; i < GRID; i++) { seed(i, 0); seed(i, GRID - 1); seed(0, i); seed(GRID - 1, i); }
    // Land you cannot build on — the city across the harbour — counts as outside,
    // so no habitat can form over there. Water is deliberately excluded: a dam or
    // a pond inside a paddock is part of the enclosure, not a hole in it.
    for (let i = 0; i < GRID * GRID; i++) if (this.offsite[i]) seed(i % GRID, (i / GRID) | 0);
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % GRID, y = (idx / GRID) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!this.inBounds(nx, ny) || !this.edgeOpen(x, y, d)) continue;
        if (!outside[ny * GRID + nx]) { outside[ny * GRID + nx] = 1; stack.push(ny * GRID + nx); }
      }
    }

    const oldIdAt = this.tiles.map(t => t.habitatId);
    for (const t of this.tiles) t.habitatId = -1;
    const seen = new Uint8Array(GRID * GRID);
    const newHabitats = new Map<number, Habitat>();
    let fresh = 1000;

    for (let idx = 0; idx < GRID * GRID; idx++) {
      if (outside[idx] || seen[idx]) continue;
      const tiles: [number, number][] = [];
      const st = [idx];
      seen[idx] = 1;
      let hasGate = false;
      let minStrength = 99;
      const terrainCount: Record<TerrainId, number> = { grass: 0, sand: 0, dirt: 0, water: 0 };
      let enrichment = 0;
      let foodMax = 100;
      let hydration = 0;
      const oldIds = new Map<number, number>();

      while (st.length) {
        const i2 = st.pop()!;
        const x = i2 % GRID, y = (i2 / GRID) | 0;
        tiles.push([x, y]);
        const t = this.tiles[i2];
        terrainCount[t.terrain]++;
        if (t.scenery) {
          const sc = SCENERY.find(s2 => s2.id === t.scenery)!;
          enrichment += sc.enrichment;
          foodMax += sc.foodCapacity ?? 0;
          hydration += sc.hydration ?? 0;
        }
        const prev = oldIdAt[i2];
        if (prev >= 0) oldIds.set(prev, (oldIds.get(prev) ?? 0) + 1);
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          const w = this.wallAt(x, y, d);
          if (w) {
            if (wallIsGate(w)) hasGate = true;
            minStrength = Math.min(minStrength, wallDef(w)?.strength ?? 1);
          }
          if (!this.inBounds(nx, ny) || !this.edgeOpen(x, y, d)) continue;
          const n = ny * GRID + nx;
          if (!seen[n]) { seen[n] = 1; st.push(n); }
        }
      }

      // reuse the dominant previous id so animal→habitat links survive edits
      let id = -1, best = 0;
      for (const [oid, count] of oldIds) if (count > best && !newHabitats.has(oid)) { best = count; id = oid; }
      if (id < 0) id = fresh++;
      while (newHabitats.has(id)) id++;
      const old = this.habitats.get(id);
      newHabitats.set(id, {
        id, tiles, hasGate,
        minStrength: minStrength === 99 ? 0 : minStrength,
        food: old?.food ?? 0,
        troughAt: tiles[0],
        water: terrainCount.water,
        foodMax, hydration,
        terrainCount, enrichment,
      });
      for (const [x, y] of tiles) this.tile(x, y).habitatId = id;
    }

    this.habitats = newHabitats;
    for (const a of this.animals) {
      const t = this.tile(Math.floor(a.x), Math.floor(a.y));
      if (t.habitatId >= 0) {
        a.habitatId = t.habitatId;
      } else if (a.habitatId >= 0) {
        a.habitatId = -1;
        const def = SPECIES.find(sp => sp.id === a.species)!;
        this.say(`⚠️ A ${def.name} has ESCAPED its habitat!`, 'bad');
      }
    }
  }

  // ── BFS distance-to-entrance over path tiles (for guests leaving) ────────
  recomputePaths() {
    this.pathDist.fill(-1);
    const q: number[] = [];
    for (const [ex, ey] of this.entrances) {
      if (!this.tile(ex, ey).path) continue;
      const idx = ey * GRID + ex;
      if (this.pathDist[idx] >= 0) continue;
      this.pathDist[idx] = 0;
      q.push(idx);
    }
    if (!q.length) return;
    let head = 0;
    while (head < q.length) {
      const idx = q[head++];
      const x = idx % GRID, y = (idx / GRID) | 0;
      const d = this.pathDist[idx];
      for (const [nx, ny] of this.neighbors(x, y)) {
        const n = ny * GRID + nx;
        if (this.tiles[n].path && this.pathDist[n] < 0) {
          this.pathDist[n] = d + 1;
          q.push(n);
        }
      }
    }
  }

  // ── welfare ──────────────────────────────────────────────────────────────
  speciesInHabitat(habId: number): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of this.animals) if (a.habitatId === habId) m.set(a.species, (m.get(a.species) ?? 0) + 1);
    return m;
  }

  animalWelfare(a: Animal): { total: number; space: number; terrain: number; social: number; food: number; enrich: number } {
    if (a.habitatId < 0) return { total: 0, space: 0, terrain: 0, social: 0, food: 0, enrich: 0 };
    const hab = this.habitats.get(a.habitatId);
    const def = SPECIES.find(s => s.id === a.species)!;
    if (!hab) return { total: 0, space: 0, terrain: 0, social: 0, food: 0, enrich: 0 };
    const pop = [...this.speciesInHabitat(a.habitatId).values()].reduce((s, n) => s + n, 0);
    const same = this.speciesInHabitat(a.habitatId).get(a.species) ?? 0;
    const space = Math.min(1, hab.tiles.length / Math.max(1, pop * def.tilesPerAnimal));
    let terrain = 0;
    const total = hab.tiles.length || 1;
    for (const [tid, w] of Object.entries(def.terrain)) {
      const have = (hab.terrainCount[tid as TerrainId] ?? 0) / total;
      terrain += Math.min(have / (w as number), 1) * (w as number);
    }
    if (def.needsWater && hab.water === 0) terrain *= 0.3;
    const social = Math.min(1, same / def.socialMin);
    const food = 1 - a.hunger / 100;
    const enrich = Math.min(1, hab.enrichment / Math.max(2, pop * 2));
    const t = space * 0.25 + terrain * 0.25 + social * 0.15 + food * 0.25 + enrich * 0.1;
    const hydrated = Math.min(0.06, (hab.hydration ?? 0) * 0.03);   // water troughs
    return { total: Math.min(100, Math.round((t + hydrated) * 100)), space, terrain, social, food, enrich };
  }

  habitatAppeal(habId: number): number {
    let appeal = 0;
    for (const a of this.animals) {
      if (a.habitatId !== habId) continue;
      const def = SPECIES.find(s => s.id === a.species)!;
      appeal += def.appeal * (a.welfare / 100);
    }
    return appeal;
  }

  /** Ageing, illness, breeding and death — the loop that makes welfare matter. */
  private updateLife(d: number) {
    const years = d / YEAR_SECONDS;
    const vets = this.countStaff('vet');
    const dead: Animal[] = [];

    for (const a of this.animals) {
      const def = SPECIES.find(s => s.id === a.species)!;
      a.age += years;

      // health tracks welfare: thriving animals recover, neglected ones decline
      if (a.welfare < 30 || a.hunger > 92) {
        a.health = Math.max(0, a.health - d * (a.hunger > 92 ? 1.2 : 0.6));
      } else if (a.welfare > 60) {
        a.health = Math.min(100, a.health + d * (0.35 + vets * 0.5));
      }
      // old age bites in the last fifth of the lifespan
      if (a.age > def.lifespan * 0.8) {
        a.health = Math.max(0, a.health - d * 0.25 * (a.age / def.lifespan));
      }

      if (a.health <= 0 || a.age > def.lifespan * 1.15) {
        dead.push(a);
        continue;
      }

      // gestation
      if (a.gestation > 0) {
        a.gestation -= years;
        if (a.gestation <= 0) {
          a.gestation = -1;
          this.birth(a, def);
        }
      }
    }

    for (const a of dead) {
      const def = SPECIES.find(s => s.id === a.species)!;
      const old = a.age > def.lifespan * 0.8;
      this.animals.splice(this.animals.indexOf(a), 1);
      this.events.push('death');
      this.say(old
        ? `A ${def.name} has died of old age.`
        : `💀 A ${def.name} has died — its welfare was far too poor.`, 'bad');
    }

    // breeding is checked periodically rather than every frame
    this.breedT -= d;
    if (this.breedT > 0) return;
    this.breedT = 4;
    for (const hab of this.habitats.values()) {
      const here = this.animals.filter(a => a.habitatId === hab.id);
      const capacity = hab.tiles.length;
      for (const [sid, n] of this.speciesInHabitat(hab.id)) {
        const def = SPECIES.find(s => s.id === sid)!;
        if ((n + 1) * def.tilesPerAnimal > capacity) continue;    // no room for another
        const mums = here.filter(a => a.species === sid && a.sex === 'f'
          && a.age >= def.matureAt && a.gestation < 0 && a.welfare > 62 && a.health > 70);
        const dads = here.some(a => a.species === sid && a.sex === 'm' && a.age >= def.matureAt);
        if (!dads || !mums.length) continue;
        if (Math.random() < 0.06) mums[0].gestation = def.lifespan * 0.04;
      }
    }
  }

  private birth(mum: Animal, def: SpeciesDef) {
    this.animals.push({
      id: uid(), species: mum.species, x: mum.x, y: mum.y, tx: mum.x, ty: mum.y,
      habitatId: mum.habitatId, hunger: 10, state: 'idle', stateT: 1,
      dir: 1, frame: 0, frameT: 0, welfare: 60,
      age: 0, sex: Math.random() < 0.5 ? 'f' : 'm', health: 100, gestation: -1, bornHere: true,
    });
    this.events.push('birth');
    this.events.push('call:' + mum.species);
    this.say(`🎉 A ${def.name} was born at the zoo!`, 'good');
  }

  /** Animals whose habitat barrier is too weak will eventually get out. */
  private checkContainment(d: number) {
    for (const a of this.animals) {
      if (a.habitatId < 0) continue;
      const hab = this.habitats.get(a.habitatId);
      const def = SPECIES.find(s => s.id === a.species)!;
      if (!hab || hab.minStrength >= def.strength) continue;
      // the bigger the mismatch, the sooner it happens
      const gap = def.strength - hab.minStrength;
      if (Math.random() < d * 0.004 * gap) {
        a.habitatId = -1;
        this.say(`⚠️ The ${def.name} broke out — its barrier was too weak!`, 'bad');
      }
    }
  }

  // ── simulation tick ──────────────────────────────────────────────────────
  update(dt: number) {
    if (this.speed === 0) return;
    const d = dt * this.speed;
    this.time += d;
    this.dayT += d;
    while (this.dayT >= DAY_LENGTH) {
      this.dayT -= DAY_LENGTH;
      this.advanceDay();
    }
    this.updateAnimals(d);
    this.checkContainment(d);
    this.updateLife(d);
    this.updateLitter(d);
    this.updateTalks(d);
    this.updateRides(d);
    this.checkOutcome();
    this.updateGuests(d);
    this.updateKeepers(d);
    this.maybeSpawnGuest(d);
  }

  private advanceDay() {
    this.day++;
    if (this.day > 30) {
      this.day = 1; this.month++;
      if (this.month > 12) { this.month = 1; this.year++; }
      this.monthlyBills();
    }
    this.updateRating();
  }

  private monthlyBills() {
    let feed = 0;
    for (const a of this.animals) feed += SPECIES.find(s => s.id === a.species)!.feedCostMonthly;
    let upkeep = 0;
    for (const t of this.tiles) if (t.shop) upkeep += SHOPS.find(s => s.id === t.shop)!.upkeepMonthly;
    const wages = this.staff.reduce((n, st) => n + STAFF.find(x => x.role === st.role)!.wage, 0);
    const bill = feed + upkeep + wages;
    this.cash -= bill;
    this.monthExpense += bill;
    this.lastMonthIncome = this.monthIncome;
    this.lastMonthExpense = this.monthExpense;
    this.monthIncome = 0; this.monthExpense = 0;
    this.say(`Monthly bills paid: $${bill} (feed $${feed}, upkeep $${upkeep}, wages $${wages})`, 'info');
    if (this.cash < 0) this.say('⚠️ The zoo is in debt! Guests hate a shabby zoo.', 'bad');
  }

  updateRating() {
    const welfares = this.animals.map(a => a.welfare);
    const avgWelfare = welfares.length ? welfares.reduce((s, w) => s + w, 0) / welfares.length : 0;
    const speciesCount = new Set(this.animals.map(a => a.species)).size;
    const guestHappy = this.guests.length
      ? this.guests.reduce((s, g) => s + g.happiness, 0) / this.guests.length : 50;
    let beauty = 0;
    for (const t of this.tiles) {
      if (t.scenery && t.habitatId < 0) beauty += SCENERY.find(s => s.id === t.scenery)!.beauty;
    }
    for (const arr of [this.wallH, this.wallV]) {
      for (let i = 0; i < arr.length; i++) if (arr[i]) beauty += (wallDef(arr[i])?.beauty ?? 0) * 0.5;
    }
    const escaped = this.animals.filter(a => a.habitatId < 0).length;
    let r = 100
      + Math.min(200, this.animals.length * 12)
      + speciesCount * 25
      + avgWelfare * 2.5
      + guestHappy * 2
      + Math.min(120, beauty * 2)
      + Math.min(90, this.rides.reduce((n, r) => n + (r.stations.length >= 2 ? 30 : 0), 0))
      - escaped * 80
      - this.litterTotal() * 3
      - (this.cash < 0 ? 150 : 0);
    this.rating = Math.max(0, Math.min(999, Math.round(r)));
  }

  // ── animals ──────────────────────────────────────────────────────────────
  private updateAnimals(d: number) {
    for (const a of this.animals) {
      const def = SPECIES.find(s => s.id === a.species)!;
      const hab = a.habitatId >= 0 ? this.habitats.get(a.habitatId) : undefined;
      a.hunger = Math.min(100, a.hunger + d * 0.8);
      // eat from trough
      if (hab && hab.food > 0 && a.hunger > 40 && a.state !== 'eat') {
        a.state = 'eat'; a.stateT = 3;
        const [tx, ty] = hab.troughAt ?? hab.tiles[0];
        a.tx = tx + 0.5; a.ty = ty + 0.5;
      }
      a.stateT -= d;
      if (a.state === 'eat') {
        if (this.moveToward(a, d * 0.8) && hab) {
          const bite = Math.min(hab.food, d * 12);
          hab.food -= bite;
          a.hunger = Math.max(0, a.hunger - bite * 2.2);
          if (a.hunger <= 5 || hab.food <= 0) { a.state = 'idle'; a.stateT = 2 + Math.random() * 3; }
        }
      } else if (a.state === 'walk') {
        if (this.moveToward(a, d * 0.8) || a.stateT <= 0) { a.state = 'idle'; a.stateT = 1 + Math.random() * 4; }
      } else if (a.stateT <= 0) {
        // pick a wander target
        a.state = 'walk'; a.stateT = 8;
        if (hab) {
          const [tx, ty] = hab.tiles[Math.floor(Math.random() * hab.tiles.length)];
          a.tx = tx + 0.5; a.ty = ty + 0.5;
        } else {
          // escaped: wander anywhere walkable
          const nx = Math.max(1, Math.min(GRID - 2, Math.floor(a.x) + Math.floor(Math.random() * 7) - 3));
          const ny = Math.max(1, Math.min(GRID - 2, Math.floor(a.y) + Math.floor(Math.random() * 7) - 3));
          if (this.tile(nx, ny).terrain !== 'water') { a.tx = nx + 0.5; a.ty = ny + 0.5; }
        }
      }
      // starvation → welfare handled below; heavy hunger hurts
      const w = this.animalWelfare(a);
      a.welfare = w.total;
      // animation
      a.frameT += d;
      if (a.frameT > 0.25) { a.frameT = 0; a.frame = a.frame ? 0 : 1; }
      if (a.tx < a.x) a.dir = -1; else if (a.tx > a.x) a.dir = 1;
    }
  }

  private moveToward(e: { x: number; y: number; tx: number; ty: number }, step: number): boolean {
    const dx = e.tx - e.x, dy = e.ty - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return true;
    const s = Math.min(step, dist);
    e.x += (dx / dist) * s;
    e.y += (dy / dist) * s;
    return false;
  }

  // ── guests ───────────────────────────────────────────────────────────────
  private spawnT = 0;
  private maybeSpawnGuest(d: number) {
    this.spawnT -= d;
    if (this.spawnT > 0) return;
    this.spawnT = 2 + Math.random() * 3;
    if (this.guests.length >= GUEST_CAP) return;
    if (this.animals.length === 0) return;
    // demand: rating vs admission price
    const demand = (this.rating / 999) * 1.4 - (this.admission / 60);
    if (Math.random() > Math.max(0.05, demand)) return;
    const open = this.entrances.filter(([x, y]) => this.tile(x, y).path);
    if (!open.length) return;
    const [ex, ey] = open[Math.floor(Math.random() * open.length)];
    const g: Guest = {
      id: uid(),
      name: GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)],
      x: ex + 0.5, y: ey + 0.5, tx: ex + 0.5, ty: ey + 0.5, px: ex, py: ey + 1,
      shirt: Math.floor(Math.random() * GUEST_SHIRTS.length),
      skin: Math.floor(Math.random() * GUEST_SKINS.length),
      cash: 40 + Math.floor(Math.random() * 80),
      hunger: 15 + Math.random() * 20, thirst: 15 + Math.random() * 20,
      bladder: Math.random() * 20, energy: 100,
      happiness: 60 + Math.random() * 20,
      state: 'walk', stateT: 0, dir: 1, frame: 0, frameT: 0,
      seen: new Set(), learned: new Set(), thoughts: [], bought: 0,
    };
    if (g.cash < this.admission) return;   // priced out
    g.cash -= this.admission;
    this.cash += this.admission;
    this.monthIncome += this.admission;
    this.totalEarned += this.admission;
    this.guestsSinceStart++;
    this.events.push('guest');
    this.guests.push(g);
  }

  private think(g: Guest, t: string) {
    if (g.thoughts[g.thoughts.length - 1] === t) return;
    g.thoughts.push(t);
    if (g.thoughts.length > 5) g.thoughts.shift();
  }

  private updateGuests(d: number) {
    const toRemove: Guest[] = [];
    for (const g of this.guests) {
      // needs decay
      g.hunger = Math.min(100, g.hunger + d * 0.55);
      g.thirst = Math.min(100, g.thirst + d * 0.7);
      g.bladder = Math.min(100, g.bladder + d * 0.4);
      g.energy = Math.max(0, g.energy - d * 0.16);
      let drain = 0;
      if (g.hunger > 70) { drain += d * 0.8; this.think(g, "I'm hungry!"); }
      if (g.thirst > 70) { drain += d * 0.9; this.think(g, "I'm thirsty!"); }
      if (g.bladder > 80) { drain += d * 1.0; this.think(g, 'I need the dunny!'); }
      if (g.energy < 20) { drain += d * 0.5; this.think(g, "I'm knackered..."); }
      const litterHere = this.litter[Math.floor(g.y) * GRID + Math.floor(g.x)];
      if (litterHere > 20) { drain += d * 0.7; this.think(g, 'This place is filthy.'); }
      g.happiness = Math.max(0, Math.min(100, g.happiness - drain));
      // escaped animal nearby → panic
      for (const a of this.animals) {
        if (a.habitatId < 0 && Math.hypot(a.x - g.x, a.y - g.y) < 3) {
          g.happiness = Math.max(0, g.happiness - d * 6);
          this.think(g, 'AAAH! A loose animal!');
        }
      }
      g.frameT += d;
      if (g.frameT > 0.2) { g.frameT = 0; g.frame = g.frame ? 0 : 1; }

      if (g.state === 'view' || g.state === 'buy') {
        g.stateT -= d;
        if (g.stateT <= 0) g.state = 'walk';
      } else {
        const arrived = this.moveToward(g, d * 1.1);
        if (g.tx < g.x - 0.01) g.dir = -1; else if (g.tx > g.x + 0.01) g.dir = 1;
        if (arrived) this.guestArrive(g, toRemove);
      }
      // decide to leave
      if (g.state !== 'leave' && (g.happiness < 25 || (g.cash < 5 && g.hunger > 60) || g.seen.size >= this.habitats.size + 2)) {
        g.state = 'leave';
        this.think(g, g.happiness < 30 ? "I'm going home. Rubbish zoo." : 'What a great day out!');
      }
    }
    for (const g of toRemove) this.guests.splice(this.guests.indexOf(g), 1);
  }

  private guestArrive(g: Guest, toRemove: Guest[]) {
    const cx = Math.floor(g.x), cy = Math.floor(g.y);
    // leaving, and reached any of the gates?
    if (g.state === 'leave' && this.entrances.some(([ex, ey]) => cx === ex && cy === ey)) {
      toRemove.push(g);
      return;
    }

    // an education board beside the path teaches about the habitat it faces
    for (let d = 0; d < 4; d++) {
      const sx = cx + DIRS[d][0], sy = cy + DIRS[d][1];
      if (!this.inBounds(sx, sy) || this.tile(sx, sy).scenery !== 'sign') continue;
      // a board teaches about any habitat within a couple of tiles — the path
      // usually sits between the board and the fence
      for (const [hx2, hy2] of NEARBY) {
        const nx2 = sx + hx2, ny2 = sy + hy2;
        if (!this.inBounds(nx2, ny2)) continue;
        const habId = this.tile(nx2, ny2).habitatId;
        if (habId < 0 || g.learned.has(habId)) continue;
        if (!this.animals.some(a => a.habitatId === habId)) continue;
        g.learned.add(habId);
        this.educatedTotal++;
        g.happiness = Math.min(100, g.happiness + 7);
        g.state = 'view'; g.stateT = 2;
        const names = [...this.speciesInHabitat(habId).keys()]
          .map(id => SPECIES.find(s2 => s2.id === id)!.name);
        this.think(g, `I never knew that about ${names[0] ?? 'them'}s!`);
        return;
      }
    }

    // a bench next door is worth a sit-down when your legs have gone
    if (g.energy < 45 && g.state !== 'leave') {
      for (let d = 0; d < 4; d++) {
        const bx = cx + DIRS[d][0], by = cy + DIRS[d][1];
        if (this.inBounds(bx, by) && this.tile(bx, by).scenery === 'bench') {
          g.state = 'buy'; g.stateT = 3;              // sits for a moment
          g.energy = Math.min(100, g.energy + 55);
          g.happiness = Math.min(100, g.happiness + 4);
          this.think(g, 'Ahh, a sit-down.');
          return;
        }
      }
    }

    // look around from this path tile
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!this.inBounds(nx, ny)) continue;
      const nt = this.tile(nx, ny);

      // viewing animals over a barrier into a habitat
      const barrier = wallDef(this.wallAt(cx, cy, d));
      if (barrier?.seeThrough && nt.habitatId >= 0 && g.state !== 'leave') {
        const habId = nt.habitatId;
        if (!g.seen.has(habId)) {
          const appeal = this.habitatAppeal(habId);
          if (appeal > 0) {
            g.seen.add(habId);
            g.state = 'view'; g.stateT = 2.5;
            g.happiness = Math.min(100, g.happiness + 5 + appeal);
            const names = [...this.speciesInHabitat(habId).keys()]
              .map(id => SPECIES.find(s2 => s2.id === id)!.name);
            this.think(g, `Wow, ${names[0] ?? 'animals'}s! Amazing!`);
            return;
          }
        }
      }

      // shops
      if (nt.shop && g.state !== 'leave') {
        const def = SHOPS.find(s2 => s2.id === nt.shop)!;
        const need =
          // a tired guest will stop for a feed even if they aren't especially hungry
          def.satisfies === 'hunger' ? Math.max(g.hunger, 100 - g.energy) :
          def.satisfies === 'thirst' ? g.thirst :
          def.satisfies === 'bladder' ? g.bladder : (100 - g.happiness) * 0.6;
        if (need > 55 && g.cash >= def.price) {
          g.cash -= def.price;
          g.bought += def.price;
          this.cash += def.price;
          this.monthIncome += def.price;
          this.totalEarned += def.price;
          // a feed and a sit-down also puts a bit of energy back in the legs
          if (def.satisfies === 'hunger') {
            g.hunger = 5;
            g.energy = Math.min(100, g.energy + 35);
            this.think(g, 'That kangaroo pie was ripper!');
          }
          if (def.satisfies === 'thirst') {
            g.thirst = 0;
            g.energy = Math.min(100, g.energy + 15);
            this.think(g, 'Ahh, refreshing.');
          }
          if (def.satisfies === 'hunger' || def.satisfies === 'thirst') this.dropLitter(g);
          if (def.satisfies === 'bladder') { g.bladder = 0; }
          if (def.satisfies === 'souvenir') { g.happiness = Math.min(100, g.happiness + 12); this.think(g, 'Cute plushie!'); }
          g.happiness = Math.min(100, g.happiness + 4);
          g.state = 'buy'; g.stateT = 1.5;
          return;
        }
      }
    }

    // choose next path tile
    const options: [number, number][] = [];
    let leaveBest: [number, number] | null = null;
    let leaveDist = Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!this.inBounds(nx, ny) || !this.tile(nx, ny).path) continue;
      if (!this.edgeOpen(cx, cy, d)) continue;
      options.push([nx, ny]);
      const pd = this.pathDist[ny * GRID + nx];
      if (pd >= 0 && pd < leaveDist) { leaveDist = pd; leaveBest = [nx, ny]; }
    }
    if (options.length === 0) return; // stranded, wait
    let next: [number, number];
    if (g.state === 'leave' && leaveBest) {
      next = leaveBest;
    } else {
      const fwd = options.filter(([nx, ny]) => !(nx === g.px && ny === g.py));
      next = (fwd.length ? fwd : options)[Math.floor(Math.random() * (fwd.length ? fwd.length : options.length))];
    }
    g.px = cx; g.py = cy;
    g.tx = next[0] + 0.5; g.ty = next[1] + 0.5;
  }

  /** Litter builds up where guests eat and drags the whole zoo down. */
  private updateLitter(d: number) {
    // caretakers sweep whatever tile they are standing on
    for (const st of this.staff) {
      if (st.role !== 'caretaker') continue;
      const idx = Math.floor(st.y) * GRID + Math.floor(st.x);
      if (this.litter[idx] > 0) {
        const before = this.litter[idx];
        this.litter[idx] = Math.max(0, before - d * 40);
        if (before > 0 && this.litter[idx] === 0) st.jobsDone++;
      }
    }
  }

  litterTotal(): number {
    let n = 0;
    for (let i = 0; i < this.litter.length; i++) n += this.litter[i] > 0 ? 1 : 0;
    return n;
  }

  private dropLitter(g: Guest) {
    const x = Math.floor(g.x), y = Math.floor(g.y);
    // a bin within a tile or two and they do the right thing
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (this.inBounds(nx, ny) && this.tile(nx, ny).scenery === 'bin') return;
      }
    }
    this.litter[y * GRID + x] = Math.min(100, this.litter[y * GRID + x] + 45);
  }

  // ── staff: keepers feed, caretakers sweep, vets tend the sick ────────────
  /** The gated, stocked habitat most in need of a feed, or null. */
  private hungriestHabitat(): Habitat | null {
    let best: Habitat | null = null;
    let bestFood = 55;
    for (const h of this.habitats.values()) {
      if (!h.hasGate || !h.troughAt) continue;
      if (!this.animals.some(a => a.habitatId === h.id)) continue;
      const pct = (h.food / h.foodMax) * 100;
      if (pct < bestFood) { bestFood = pct; best = h; }
    }
    return best;
  }

  private updateKeepers(d: number) {
    for (const k of this.staff) {
      k.frameT += d;
      if (k.frameT > 0.22) { k.frameT = 0; k.frame = k.frame ? 0 : 1; }
      // A keeper with nothing on its plate re-checks every tick, so it turns
      // back the moment a trough runs low instead of finishing its stroll first.
      if (k.role === 'keeper' && k.targetHabitat < 0) {
        const hungry = this.hungriestHabitat();
        if (hungry?.troughAt) {
          k.targetHabitat = hungry.id;
          k.tx = hungry.troughAt[0] + 0.5;
          k.ty = hungry.troughAt[1] + 0.5;
        }
      }
      if (k.tx < k.x - 0.01) k.dir = -1; else if (k.tx > k.x + 0.01) k.dir = 1;
      const arrived = this.moveToward(k, d * 1.0);
      if (!arrived) continue;
      const hab = this.habitats.get(k.targetHabitat);
      if (hab && Math.floor(k.x) === hab.troughAt?.[0] && Math.floor(k.y) === hab.troughAt?.[1]) {
        hab.food = hab.foodMax;   // refill (feed billed monthly)
        k.jobsDone++;
        k.targetHabitat = -1;
      }
      if (k.role === 'caretaker') {
        // head for the dirtiest reachable path tile
        let worst = 0, target: [number, number] | null = null;
        for (let i = 0; i < this.litter.length; i++) {
          if (this.litter[i] > worst && this.pathDist[i] >= 0) {
            worst = this.litter[i];
            target = [i % GRID, (i / GRID) | 0];
          }
        }
        if (target) { k.tx = target[0] + 0.5; k.ty = target[1] + 0.5; }
        else this.patrolPaths(k);
        continue;
      }
      if (k.role === 'educator') {
        // find a podium to stand behind
        let podium: [number, number] | null = null;
        for (let i = 0; i < GRID * GRID; i++) {
          if (this.tiles[i].scenery === 'podium') { podium = [i % GRID, (i / GRID) | 0]; break; }
        }
        if (podium) { k.tx = podium[0] + 0.5; k.ty = podium[1] + 0.5; }
        else this.patrolPaths(k);
        continue;
      }
      if (k.role === 'vet') {
        // stand with the sickest animal; presence speeds its recovery
        const sick = this.animals.filter(a => a.health < 70 && a.habitatId >= 0)
          .sort((p, q) => p.health - q.health)[0];
        if (sick) { k.tx = sick.x; k.ty = sick.y; } else this.patrolPaths(k);
        continue;
      }
      if (k.targetHabitat < 0 || !hab) {
        const best = this.hungriestHabitat();
        if (best?.troughAt) {
          k.targetHabitat = best.id;
          k.tx = best.troughAt[0] + 0.5;
          k.ty = best.troughAt[1] + 0.5;
        } else {
          this.patrolPaths(k);
        }
      }
    }
  }

  private talkT = 0;

  /**
   * Educators stand at a podium and run talks. A talk lifts every guest within
   * earshot and counts toward the zoo's education record.
   */
  private updateTalks(d: number) {
    const educators = this.staff.filter(s => s.role === 'educator');
    if (!educators.length) return;
    this.talkT -= d;
    if (this.talkT > 0) return;
    this.talkT = 18;
    for (const ed of educators) {
      const at = this.tile(Math.floor(ed.x), Math.floor(ed.y));
      if (at.scenery !== 'podium') continue;         // only talks from a podium
      let crowd = 0;
      for (const g of this.guests) {
        if (Math.hypot(g.x - ed.x, g.y - ed.y) > 4.5) continue;
        crowd++;
        g.happiness = Math.min(100, g.happiness + 14);
        this.educatedTotal++;
        this.think(g, 'That keeper talk was brilliant!');
      }
      if (crowd) {
        ed.jobsDone++;
        this.events.push('talk');
        this.say(`🎤 A keeper talk drew a crowd of ${crowd}.`, 'good');
      }
    }
  }

  /** Send a captive-bred animal back to the wild. The point of the whole zoo. */
  canRelease(a: Animal): string | null {
    const def = SPECIES.find(s => s.id === a.species)!;
    if (!a.bornHere) return 'Only animals born here can be released.';
    if (a.age < def.matureAt) return 'Too young — must be fully grown.';
    if (a.health < 70) return 'Not healthy enough to survive in the wild.';
    if (a.welfare < 65) return 'Welfare too low — it would not cope out there.';
    return null;
  }

  releaseToWild(a: Animal): boolean {
    if (this.canRelease(a)) return false;
    const def = SPECIES.find(s => s.id === a.species)!;
    this.animals.splice(this.animals.indexOf(a), 1);
    this.released++;
    this.conservation += def.appeal * 10;
    this.rating = Math.min(999, this.rating + 15);
    this.events.push('release');
    this.say(`🌏 A zoo-bred ${def.name} has been released back into the wild!`, 'good');
    return true;
  }

  // ── guest transport ──────────────────────────────────────────────────────
  /** Total length of a ride's route, in tiles. */
  rideLength(r: Ride): number {
    let n = 0;
    for (let i = 1; i < r.stations.length; i++) {
      n += Math.hypot(r.stations[i][0] - r.stations[i - 1][0], r.stations[i][1] - r.stations[i - 1][1]);
    }
    return n;
  }

  /** A point along the route, given distance travelled from the first station. */
  ridePoint(r: Ride, dist: number): [number, number] {
    let d = Math.max(0, dist);
    for (let i = 1; i < r.stations.length; i++) {
      const [ax, ay] = r.stations[i - 1], [bx, by] = r.stations[i];
      const seg = Math.hypot(bx - ax, by - ay);
      if (d <= seg || i === r.stations.length - 1) {
        const t = seg === 0 ? 0 : Math.min(1, d / seg);
        return [ax + (bx - ax) * t, ay + (by - ay) * t];
      }
      d -= seg;
    }
    return r.stations[0];
  }

  /** Add a station to a line, starting a new one if `rideId` is -1. */
  addStation(type: TransportId, x: number, y: number, rideId: number): number {
    const def = TRANSPORT.find(t => t.id === type)!;
    const t = this.tile(x, y);
    if (!this.canBuild(x, y)) { this.offLimits(x, y); return rideId; }
    if (t.shop || t.path || t.scenery || t.habitatId >= 0 || t.terrain === 'water') {
      this.say('Stations need clear ground outside a habitat.', 'bad');
      return rideId;
    }
    const touchesPath = this.neighbors(x, y).some(([nx, ny]) => this.tile(nx, ny).path);
    if (!touchesPath) { this.say('A station must touch a path so guests can reach it.', 'bad'); return rideId; }

    // only continue the line in progress if it's the same kind of ride —
    // otherwise picking a different vehicle silently extended the old one
    let ride = this.rides.find(r => r.id === rideId && r.type === type);
    let cost = def.stationCost;
    if (ride) {
      const last = ride.stations[ride.stations.length - 1];
      cost += Math.round(Math.hypot(x - last[0], y - last[1]) * def.trackPerTile);
    }
    if (!this.charge(cost)) return rideId;

    if (!ride) {
      ride = { id: uid(), type, stations: [[x, y]], vehicles: [], rides: 0 };
      this.rides.push(ride);
      this.say(`${def.name} station placed. Click again to run track to the next station.`, 'info');
    } else {
      ride.stations.push([x, y]);
      if (ride.vehicles.length === 0) {
        ride.vehicles.push({ at: 0, dir: 1, riders: 0, wait: 0 });
        if (this.rideLength(ride) > 12) ride.vehicles.push({ at: this.rideLength(ride) / 2, dir: -1, riders: 0, wait: 0 });
        this.say(`${def.name} is open for business.`, 'good');
        this.events.push('ride:' + def.id);
      }
    }
    return ride.id;
  }

  /** Demolish the station on this tile, healing the line back together. */
  removeStationAt(x: number, y: number): boolean {
    for (const r of this.rides) {
      const i = r.stations.findIndex(([sx, sy]) => sx === x && sy === y);
      if (i < 0) continue;
      const def = TRANSPORT.find(t => t.id === r.type)!;
      r.stations.splice(i, 1);
      this.cash += Math.round(def.stationCost * COSTS.bulldozeRefund);
      if (r.stations.length < 2) {
        r.vehicles.length = 0;                       // nothing left to run between
        if (r.stations.length === 0) {
          this.rides.splice(this.rides.indexOf(r), 1);
          this.say(`${def.name} line removed.`, 'info');
          return true;
        }
        this.say(`${def.name} closed — a line needs two stations.`, 'info');
      } else {
        // keep the vehicles on the shortened route
        const len = this.rideLength(r);
        for (const v of r.vehicles) v.at = Math.min(v.at, len);
        this.say(`${def.name} station removed.`, 'info');
      }
      return true;
    }
    return false;
  }

  removeRide(rideId: number): boolean {
    const i = this.rides.findIndex(r => r.id === rideId);
    if (i < 0) return false;
    const r = this.rides[i];
    const def = TRANSPORT.find(t => t.id === r.type)!;
    this.cash += Math.round((def.stationCost * r.stations.length) * COSTS.bulldozeRefund);
    this.rides.splice(i, 1);
    return true;
  }

  /** Which ride station, if any, is on this tile. */
  stationAt(x: number, y: number): Ride | null {
    for (const r of this.rides) {
      if (r.stations.some(([sx, sy]) => sx === x && sy === y)) return r;
    }
    return null;
  }

  private updateRides(d: number) {
    for (const r of this.rides) {
      if (r.stations.length < 2) continue;
      const def = TRANSPORT.find(t => t.id === r.type)!;
      const len = this.rideLength(r);
      for (const v of r.vehicles) {
        if (v.wait > 0) { v.wait -= d; continue; }
        v.at += def.speed * d * v.dir;
        if (v.at >= len) { v.at = len; v.dir = -1; this.arriveAtStation(r, def, v); }
        else if (v.at <= 0) { v.at = 0; v.dir = 1; this.arriveAtStation(r, def, v); }
      }
    }
  }

  /** Pick up whoever is waiting, drop off whoever was aboard. */
  private arriveAtStation(r: Ride, def: typeof TRANSPORT[number], v: Ride['vehicles'][number]) {
    v.wait = 2.5;
    const [sx, sy] = this.ridePoint(r, v.at);
    // riders get off here, happier for the trip
    v.riders = 0;
    // and whoever is loitering within a tile of the platform gets on
    let taken = 0;
    for (const g of this.guests) {
      if (taken >= def.capacity) break;
      if (g.state === 'leave' || g.cash < def.fare) continue;
      if (Math.hypot(g.x - sx, g.y - sy) > 1.6) continue;
      // carry them to the far end of the line
      const far = v.dir === 1 ? this.ridePoint(r, 0) : this.ridePoint(r, this.rideLength(r));
      g.x = far[0] + 0.5; g.y = far[1] + 0.5;
      g.tx = g.x; g.ty = g.y;
      g.px = -1; g.py = -1;
      g.cash -= def.fare;
      g.bought += def.fare;
      this.cash += def.fare;
      this.monthIncome += def.fare;
      this.totalEarned += def.fare;
      g.happiness = Math.min(100, g.happiness + 12);
      g.energy = Math.min(100, g.energy + 25);
      this.think(g, `The ${def.name.toLowerCase()} was a great way to see the place.`);
      // a scenic route counts as having seen everything it passes
      if (def.viewsAnimals) {
        for (const hab of this.habitats.values()) {
          const near = hab.tiles.some(([hx, hy]) =>
            r.stations.some(([stx, sty]) => Math.hypot(hx - stx, hy - sty) < 6));
          if (near && !g.seen.has(hab.id) && this.animals.some(a => a.habitatId === hab.id)) {
            g.seen.add(hab.id);
            g.happiness = Math.min(100, g.happiness + this.habitatAppeal(hab.id) * 0.5);
          }
        }
      }
      r.rides++;
      taken++;
    }
    if (taken) { v.riders = taken; this.events.push('cash'); }
    if (taken || Math.random() < 0.5) this.events.push('ride:' + def.id);
  }

  /** Wander the path network when there's nothing specific to do. */
  private patrolPaths(k: Staff) {
    const paths: [number, number][] = [];
    for (let i = 0; i < GRID * GRID && paths.length < 400; i++) {
      if (this.pathDist[i] >= 0) paths.push([i % GRID, (i / GRID) | 0]);
    }
    if (paths.length) {
      const [nx, ny] = paths[Math.floor(Math.random() * paths.length)];
      k.tx = nx + 0.5; k.ty = ny + 0.5;
    }
  }

  // ── scenario objectives ──────────────────────────────────────────────────
  objectiveProgress(): { id: string; label: string; target: number; current: number; done: boolean }[] {
    const welfare = this.animals.length
      ? this.animals.reduce((s, a) => s + a.welfare, 0) / this.animals.length : 0;
    const kept = new Set(this.animals.map(a => a.species));
    const stocked = [...this.habitats.values()].filter(h => this.animals.some(a => a.habitatId === h.id));
    const values: Record<string, number> = {
      rating: this.rating,
      species: kept.size,
      guests: this.guestsSinceStart,
      welfare: Math.round(welfare),
      educated: this.educatedTotal,
      released: this.released,
      // recreate-style goals
      signature: siteDef(this.site).signature.filter(id => kept.has(id)).length,
      habitats: stocked.length,
      bigpens: stocked.filter(h => h.tiles.length >= 40).length,
      rides: this.rides.filter(r => r.stations.length >= 2).length,
    };
    return this.scenario.objectives.map((o: { id: string; label: string; target: number }) => ({
      ...o, current: values[o.id] ?? 0, done: (values[o.id] ?? 0) >= o.target,
    }));
  }

  private checkOutcome() {
    // only the scenario can be won or lost; sandbox and tutorial just run
    if (this.mode !== 'scenario' || this.outcome !== 'playing') return;
    if (this.cash < this.scenario.bankruptAt) {
      this.outcome = 'lost';
      this.outcomeReason = `The zoo went bankrupt at $${Math.round(this.cash).toLocaleString()}.`;
      this.events.push('lose');
      this.speed = 0;
      return;
    }
    const prog = this.objectiveProgress();
    if (prog.every(p => p.done)) {
      this.outcome = 'won';
      this.outcomeReason = `Every objective met in Year ${this.year}. ${siteDef(this.site).name} is thriving.`;
      this.events.push('win');
      this.speed = 0;
      return;
    }
    if (this.year >= this.scenario.deadlineYear) {
      this.outcome = 'lost';
      const missed = prog.filter(p => !p.done).map(p => p.label.toLowerCase());
      this.outcomeReason = `Time is up. Still short on: ${missed.join(', ')}.`;
      this.events.push('lose');
      this.speed = 0;
    }
  }

  // ── things that need the player's attention ──────────────────────────────
  alerts(): Alert[] {
    const out: Alert[] = [];
    for (const a of this.animals) {
      const def = SPECIES.find(s => s.id === a.species)!;
      if (a.habitatId < 0) out.push({ kind: 'bad', text: `${def.name} is loose in the zoo!`, at: [a.x, a.y] });
      else if (a.health < 40) out.push({ kind: 'bad', text: `${def.name} is sick and may die`, at: [a.x, a.y] });
      else if (a.welfare < 35) out.push({ kind: 'warn', text: `${def.name} welfare is only ${a.welfare}%`, at: [a.x, a.y] });
    }
    for (const hab of this.habitats.values()) {
      const pop = this.animals.filter(a => a.habitatId === hab.id);
      if (!pop.length) continue;
      const at = hab.tiles[0];
      if (!hab.hasGate) out.push({ kind: 'bad', text: `Habitat #${hab.id} has no gate`, at });
      if (hab.food < 15) out.push({ kind: 'warn', text: `Habitat #${hab.id} is out of food`, at });
      const needed = Math.max(...pop.map(a => SPECIES.find(s => s.id === a.species)!.strength));
      if (hab.minStrength < needed) {
        out.push({ kind: 'bad', text: `Habitat #${hab.id} barrier is too weak (${hab.minStrength}/${needed})`, at });
      }
    }
    const litter = this.litterTotal();
    if (litter > 12) out.push({ kind: 'warn', text: `${litter} tiles of litter — hire a caretaker` });
    if (this.cash < 0) out.push({ kind: 'bad', text: `In debt: $${Math.round(this.cash).toLocaleString()}` });
    for (const st of STAFF) {
      const load = this.staffLoad(st.role);
      if (load > 1.4) {
        out.push({ kind: load > 3 ? 'bad' : 'warn',
          text: this.countStaff(st.role)
            ? `${st.name}s are stretched — hire another`
            : `No ${st.name.toLowerCase()}s on staff` });
      }
    }
    return out.slice(0, 25);
  }

  // ── save / load ──────────────────────────────────────────────────────────
  /** Everything needed to rebuild this zoo, as a plain object. */
  saveData(): Record<string, unknown> {
    return {
      v: 5,
      mode: this.mode,
      scenario: this.scenario.id,
      tiles: this.tiles.map(t => [t.terrain, t.path ? 1 : 0, t.scenery, t.shop]),
      decor: Array.from(this.decor),
      wallH: Array.from(this.wallH),
      wallV: Array.from(this.wallV),
      animals: this.animals.map(a => [a.species, a.x, a.y, a.habitatId, a.hunger, a.age, a.sex, a.health, a.gestation, a.bornHere ? 1 : 0]),
      staff: this.staff.map(s2 => [s2.role, s2.name, s2.jobsDone]),
      litter: Array.from(this.litter),
      rides: this.rides.map(r => [r.type, r.stations, r.rides]),
      outcome: this.outcome,
      cash: this.cash, day: this.day, month: this.month, year: this.year,
      admission: this.admission, rating: this.rating,
      guestsSinceStart: this.guestsSinceStart, totalEarned: this.totalEarned,
      educatedTotal: this.educatedTotal, released: this.released, conservation: this.conservation,
      habFood: [...this.habitats.values()].map(h => [h.id, h.food]),
    };
  }

  static slotKey(slot: number) { return `taronga-tycoon-save-${slot}`; }
  static readonly SLOTS = 3;

  save(slot = 0, quiet = false): boolean {
    try {
      localStorage.setItem(Game.slotKey(slot), JSON.stringify({
        ...this.saveData(),
        savedAt: Date.now(),
        label: `${siteDef(this.site).name} · ${this.scenario.name}`,
      }));
    } catch {
      this.say('Could not save — browser storage is full or blocked.', 'bad');
      return false;
    }
    if (!quiet) this.say(`Saved to slot ${slot + 1}.`, 'good');
    return true;
  }

  /** A one-line summary of each slot for the save/load window. */
  static slotInfo(slot: number): {
    label: string; date: string; rating: number; guests: number; savedAt: number;
  } | null {
    const raw = localStorage.getItem(Game.slotKey(slot));
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        label: d.label ?? 'Saved zoo',
        date: `${months[(d.month ?? 1) - 1]} ${d.day ?? 1}, Year ${d.year ?? 1}`,
        rating: d.rating ?? 0,
        guests: d.guestsSinceStart ?? 0,
        savedAt: d.savedAt ?? 0,
      };
    } catch {
      return null;
    }
  }

  static deleteSlot(slot: number) { localStorage.removeItem(Game.slotKey(slot)); }

  /** The slot saved most recently, for the Continue button. */
  static latestSlot(): number | null {
    let best: number | null = null;
    let when = -1;
    for (let i = 0; i < Game.SLOTS; i++) {
      const info = Game.slotInfo(i);
      if (info && info.savedAt > when) { when = info.savedAt; best = i; }
    }
    return best;
  }

  /** The whole zoo as a text file the player can keep or move between machines. */
  toJSON(): string { return JSON.stringify(this.saveData(), null, 1); }

  static fromJSON(text: string): Game | null {
    try {
      return Game.fromData(JSON.parse(text));
    } catch {
      return null;
    }
  }

  static load(slot = 0): Game | null {
    const raw = localStorage.getItem(Game.slotKey(slot));
    if (!raw) return null;
    try {
      return Game.fromData(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private static fromData(data: any): Game | null {
    try {
      // walls moved from tiles onto tile edges in v2; older zoos can't be converted
      if (data.v !== 5) {
        localStorage.removeItem('taronga-tycoon-save');
        return null;
      }
      const g = new Game(data.mode ?? 'scenario', data.scenario ?? 'taronga-new');
      g.messages = [];
      data.tiles.forEach((t: any[], i: number) => {
        g.tiles[i].terrain = t[0]; g.tiles[i].path = !!t[1];
        g.tiles[i].scenery = t[2]; g.tiles[i].shop = t[3];
      });
      g.wallH.set(data.wallH);
      g.wallV.set(data.wallV);
      g.recomputePaths();
      g.recomputeHabitats();
      for (const [id, food] of data.habFood ?? []) {
        const h = g.habitats.get(id); if (h) h.food = food;
      }
      for (const a of data.animals) {
        const def = SPECIES.find(sp => sp.id === a[0])!;
        g.animals.push({
          id: uid(), species: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2],
          habitatId: g.tile(Math.floor(a[1]), Math.floor(a[2])).habitatId,
          hunger: a[4], state: 'idle', stateT: 1, dir: 1, frame: 0, frameT: 0, welfare: 50,
          age: a[5] ?? def.matureAt, sex: a[6] ?? 'f', health: a[7] ?? 100, gestation: a[8] ?? -1,
          bornHere: !!a[9],
        });
      }
      for (const entry of data.staff ?? []) {
        const [role, name, jobs] = Array.isArray(entry) ? entry : [entry, 'Kel', 0];
        const [ex, ey] = g.entrance;
        g.staff.push({
          id: uid(), name, role, hiredOn: 0, jobsDone: jobs ?? 0,
          x: ex + 0.5, y: ey - 1 + 0.5, tx: ex + 0.5, ty: ey - 1 + 0.5,
          targetHabitat: -1, dir: 1, frame: 0, frameT: 0,
        });
      }
      if (data.litter) g.litter.set(data.litter);
      if (data.decor) g.decor.set(data.decor);
      for (const [type, stations, count] of data.rides ?? []) {
        const ride: Ride = { id: uid(), type, stations, vehicles: [], rides: count ?? 0 };
        if (stations.length >= 2) {
          ride.vehicles.push({ at: 0, dir: 1, riders: 0, wait: 0 });
          const len = g.rideLength(ride);
          if (len > 12) ride.vehicles.push({ at: len / 2, dir: -1, riders: 0, wait: 0 });
        }
        g.rides.push(ride);
      }
      g.outcome = data.outcome ?? 'playing';
      g.cash = data.cash; g.day = data.day; g.month = data.month; g.year = data.year;
      g.admission = data.admission; g.rating = data.rating;
      g.guestsSinceStart = data.guestsSinceStart ?? 0; g.totalEarned = data.totalEarned ?? 0;
      g.educatedTotal = data.educatedTotal ?? 0; g.released = data.released ?? 0;
      g.conservation = data.conservation ?? 0;
      g.say('Zoo loaded. Welcome back!', 'good');
      return g;
    } catch {
      return null;
    }
  }
}
