// ── Taronga Tycoon: data-driven game config ──────────────────────────────

export const GRID = 96;            // world is GRID x GRID tiles
export const TILE_W = 64;          // iso tile width (px at zoom 1)
export const TILE_H = 32;          // iso tile height
export const START_CASH = 25000;
export const DAY_LENGTH = 6;       // real seconds per game day at 1x
export const GUEST_CAP = 140;

export type TerrainId = 'grass' | 'sand' | 'dirt' | 'water';

export interface SpeciesDef {
  id: string;
  name: string;
  emoji: string;          // used in UI lists
  cost: number;
  feedCostMonthly: number;
  appeal: number;         // 1-10, how much guests want to see it
  tilesPerAnimal: number; // habitat space requirement
  socialMin: number;      // minimum group size for full comfort
  terrain: Partial<Record<TerrainId, number>>; // preferred terrain weights, sum ~1
  needsWater: boolean;    // requires at least one water tile in habitat
  strength: number;       // barrier strength needed to hold it (1-3)
  lifespan: number;       // game years — compressed so a life cycle fits a session
  matureAt: number;       // game years before it can breed
  unlockRating: number;   // zoo rating you must reach before it's available
  // ── artwork ──
  art: 'hopper' | 'quadruped' | 'ratite' | 'sprawler' | 'ape' | 'pinniped' | 'penguin' | 'upright';
  artL: number;           // drawn length, px (a guest is 10 wide / 26 tall for scale)
  artH: number;           // drawn height, px
  body: string;
  belly: string;
  accent: string;
  ears?: 'tall' | 'round' | 'big';
  tail?: 'thick' | 'brush' | 'stub' | 'paddle' | 'taper';
  // quadruped proportions, as fractions — a dingo is leggy and lean, a wombat squat
  legs?: number;    // leg length / total height
  girth?: number;   // how deep the barrel is
  head?: number;    // head radius / total height
  snout?: number;   // muzzle length / head radius
  neck?: number;    // neck length multiplier — a giraffe is ~4
  pattern?: 'stripes' | 'spots' | 'ringtail' | 'patch';
  feature?: 'mane' | 'trunk' | 'spikes' | 'horns';
}

export const SPECIES: SpeciesDef[] = [
  { id: 'kangaroo',  name: 'Red Kangaroo',      emoji: '🦘', cost: 900,  feedCostMonthly: 60,  appeal: 6, tilesPerAnimal: 5, socialMin: 3, terrain: { grass: 0.7, dirt: 0.3 },            needsWater: false, strength: 1, lifespan: 8, matureAt: 1.2, unlockRating: 0, art: 'hopper',    artL: 26, artH: 30, body: '#b5651d', belly: '#dcae7a', accent: '#8a4a12', ears: 'tall',  tail: 'thick' },
  { id: 'koala',     name: 'Koala',             emoji: '🐨', cost: 1200, feedCostMonthly: 90,  appeal: 8, tilesPerAnimal: 3, socialMin: 1, terrain: { grass: 0.9, dirt: 0.1 },            needsWater: false, strength: 1, lifespan: 7, matureAt: 1.2, unlockRating: 0, art: 'quadruped', artL: 17, artH: 19, body: '#9aa0a6', belly: '#d6dade', accent: '#5c6166', ears: 'big',   tail: 'stub',  legs: 0.18, girth: 1.0,  head: 0.34, snout: 0.5 },
  { id: 'emu',       name: 'Emu',               emoji: '🪶', cost: 700,  feedCostMonthly: 50,  appeal: 5, tilesPerAnimal: 5, socialMin: 2, terrain: { grass: 0.5, dirt: 0.3, sand: 0.2 }, needsWater: false, strength: 1, lifespan: 9, matureAt: 1.4, unlockRating: 0, art: 'ratite',    artL: 23, artH: 31, body: '#6b5f50', belly: '#8a7c69', accent: '#3f3831' },
  { id: 'wombat',    name: 'Common Wombat',     emoji: '🦡', cost: 800,  feedCostMonthly: 55,  appeal: 6, tilesPerAnimal: 3, socialMin: 1, terrain: { grass: 0.6, dirt: 0.4 },            needsWater: false, strength: 1, lifespan: 8, matureAt: 1.2, unlockRating: 0, art: 'quadruped', artL: 24, artH: 14, body: '#8a7660', belly: '#a89578', accent: '#57493a', ears: 'round', tail: 'stub',  legs: 0.28, girth: 0.95, head: 0.30, snout: 0.7 },
  { id: 'platypus',  name: 'Platypus',          emoji: '🦆', cost: 2500, feedCostMonthly: 140, appeal: 10, tilesPerAnimal: 3, socialMin: 1, terrain: { water: 0.6, grass: 0.2, dirt: 0.2 }, needsWater: true, strength: 2, lifespan: 7, matureAt: 1.2, unlockRating: 350, art: 'sprawler',  artL: 22, artH: 11, body: '#5a4632', belly: '#8a7357', accent: '#c98a3b', tail: 'paddle' },
  { id: 'croc',      name: 'Saltwater Croc',    emoji: '🐊', cost: 2200, feedCostMonthly: 160, appeal: 9, tilesPerAnimal: 7, socialMin: 1, terrain: { water: 0.5, sand: 0.3, dirt: 0.2 }, needsWater: true, strength: 3, lifespan: 12, matureAt: 2.5, unlockRating: 500, art: 'sprawler',  artL: 48, artH: 13, body: '#55703f', belly: '#9aa86a', accent: '#3a5029', tail: 'taper' },
  { id: 'dingo',     name: 'Dingo',             emoji: '🐕', cost: 750,  feedCostMonthly: 70,  appeal: 5, tilesPerAnimal: 4, socialMin: 3, terrain: { dirt: 0.5, grass: 0.3, sand: 0.2 }, needsWater: false, strength: 2, lifespan: 7, matureAt: 1.0, unlockRating: 0, art: 'quadruped', artL: 27, artH: 19, body: '#d9a05b', belly: '#f0d5ac', accent: '#a8763c', ears: 'tall',  tail: 'brush', legs: 0.46, girth: 0.72, head: 0.24, snout: 1.1 },
  { id: 'cassowary', name: 'Cassowary',         emoji: '🦃', cost: 1600, feedCostMonthly: 100, appeal: 8, tilesPerAnimal: 5, socialMin: 1, terrain: { grass: 0.7, dirt: 0.3 },            needsWater: false, strength: 2, lifespan: 9, matureAt: 1.6, unlockRating: 300, art: 'ratite',    artL: 24, artH: 31, body: '#26272e', belly: '#3a3c45', accent: '#2b6cb0' },
  // ── Taronga's exotic collection ──
  { id: 'tiger',     name: 'Sumatran Tiger',    emoji: '🐅', cost: 6000, feedCostMonthly: 380, appeal: 10, tilesPerAnimal: 12, socialMin: 1, terrain: { grass: 0.6, dirt: 0.4 },            needsWater: false, strength: 3, lifespan: 8, matureAt: 1.6, unlockRating: 650, art: 'quadruped', artL: 36, artH: 22, body: '#e08a2e', belly: '#f6e2c0', accent: '#7a4512', ears: 'round', tail: 'brush', legs: 0.40, girth: 0.80, head: 0.26, snout: 0.5, pattern: 'stripes' },
  { id: 'lion',      name: 'African Lion',      emoji: '🦁', cost: 5500, feedCostMonthly: 360, appeal: 10, tilesPerAnimal: 12, socialMin: 2, terrain: { grass: 0.5, dirt: 0.3, sand: 0.2 }, needsWater: false, strength: 3, lifespan: 8, matureAt: 1.5, unlockRating: 600, art: 'quadruped', artL: 36, artH: 23, body: '#d9ab63', belly: '#f2ddb4', accent: '#8f6427', ears: 'round', tail: 'brush', legs: 0.40, girth: 0.80, head: 0.26, snout: 0.6, feature: 'mane' },
  { id: 'giraffe',   name: 'Giraffe',           emoji: '🦒', cost: 7000, feedCostMonthly: 420, appeal: 10, tilesPerAnimal: 14, socialMin: 2, terrain: { grass: 0.6, dirt: 0.4 },            needsWater: false, strength: 2, lifespan: 10, matureAt: 2.0, unlockRating: 700, art: 'quadruped', artL: 32, artH: 50, body: '#e3b168', belly: '#f4e3bd', accent: '#9c6b25', ears: 'round', tail: 'brush', legs: 0.40, girth: 0.38, head: 0.10, snout: 0.9, neck: 4.2, pattern: 'patch', feature: 'horns' },
  { id: 'zebra',     name: 'Plains Zebra',      emoji: '🦓', cost: 3200, feedCostMonthly: 220, appeal: 8, tilesPerAnimal: 9, socialMin: 3, terrain: { grass: 0.7, dirt: 0.3 },              needsWater: false, strength: 2, lifespan: 9, matureAt: 1.5, unlockRating: 450, art: 'quadruped', artL: 32, artH: 24, body: '#f2efe6', belly: '#ffffff', accent: '#26242a', ears: 'tall',  tail: 'brush', legs: 0.48, girth: 0.72, head: 0.20, snout: 1.0, pattern: 'stripes' },
  { id: 'elephant',  name: 'Asian Elephant',    emoji: '🐘', cost: 9000, feedCostMonthly: 600, appeal: 10, tilesPerAnimal: 18, socialMin: 2, terrain: { dirt: 0.5, grass: 0.5 },            needsWater: true,  strength: 3, lifespan: 14, matureAt: 3.0, unlockRating: 800, art: 'quadruped', artL: 44, artH: 34, body: '#8e8a86', belly: '#a5a19c', accent: '#5d5a56', tail: 'stub',  legs: 0.44, girth: 0.95, head: 0.26, snout: 0.15, feature: 'trunk' },
  { id: 'chimp',     name: 'Chimpanzee',        emoji: '🐒', cost: 4800, feedCostMonthly: 300, appeal: 9, tilesPerAnimal: 8, socialMin: 3, terrain: { grass: 0.7, dirt: 0.3 },              needsWater: false, strength: 3, lifespan: 11, matureAt: 2.0, unlockRating: 600, art: 'ape',       artL: 24, artH: 24, body: '#3a3129', belly: '#6b5b4a', accent: '#1f1a15' },
  { id: 'gorilla',   name: 'Lowland Gorilla',   emoji: '🦍', cost: 8000, feedCostMonthly: 480, appeal: 10, tilesPerAnimal: 12, socialMin: 2, terrain: { grass: 0.7, dirt: 0.3 },            needsWater: false, strength: 3, lifespan: 11, matureAt: 2.2, unlockRating: 750, art: 'ape',       artL: 32, artH: 30, body: '#2b2a2e', belly: '#4a4850', accent: '#141317' },
  { id: 'meerkat',   name: 'Meerkat',           emoji: '🦫', cost: 900,  feedCostMonthly: 70,  appeal: 7, tilesPerAnimal: 2, socialMin: 4, terrain: { sand: 0.6, dirt: 0.4 },               needsWater: false, strength: 2, lifespan: 5, matureAt: 0.7, unlockRating: 250, art: 'upright',   artL: 12, artH: 20, body: '#c2a279', belly: '#e3cfae', accent: '#7d6340' },
  { id: 'penguin',   name: 'Little Penguin',    emoji: '🐧', cost: 1400, feedCostMonthly: 110, appeal: 8, tilesPerAnimal: 2, socialMin: 4, terrain: { water: 0.5, sand: 0.3, dirt: 0.2 },   needsWater: true,  strength: 1, lifespan: 7, matureAt: 1.0, unlockRating: 250, art: 'penguin',   artL: 13, artH: 19, body: '#2f4c68', belly: '#f2f0e6', accent: '#1b2c3d' },
  { id: 'sealion',   name: 'Australian Sea Lion', emoji: '🦭', cost: 3000, feedCostMonthly: 260, appeal: 9, tilesPerAnimal: 6, socialMin: 2, terrain: { water: 0.6, sand: 0.4 },            needsWater: true,  strength: 2, lifespan: 8, matureAt: 1.5, unlockRating: 400, art: 'pinniped',  artL: 34, artH: 16, body: '#6f5a44', belly: '#c2ab8c', accent: '#33281c' },
  { id: 'redpanda',  name: 'Red Panda',         emoji: '🐼', cost: 3400, feedCostMonthly: 190, appeal: 9, tilesPerAnimal: 4, socialMin: 1, terrain: { grass: 0.8, dirt: 0.2 },              needsWater: false, strength: 2, lifespan: 6, matureAt: 1.0, unlockRating: 400, art: 'quadruped', artL: 22, artH: 15, body: '#b4562a', belly: '#2e211a', accent: '#e8dcc8', ears: 'round', tail: 'brush', legs: 0.32, girth: 0.86, head: 0.30, snout: 0.5, pattern: 'ringtail' },
  { id: 'tasdevil',  name: 'Tasmanian Devil',   emoji: '😈', cost: 1800, feedCostMonthly: 130, appeal: 8, tilesPerAnimal: 3, socialMin: 1, terrain: { dirt: 0.5, grass: 0.5 },              needsWater: false, strength: 2, lifespan: 5, matureAt: 0.8, unlockRating: 200, art: 'quadruped', artL: 20, artH: 13, body: '#241f1d', belly: '#efe9e2', accent: '#0f0d0c', ears: 'round', tail: 'stub',  legs: 0.30, girth: 0.92, head: 0.32, snout: 0.8 },
  { id: 'echidna',   name: 'Short-beaked Echidna', emoji: '🦔', cost: 1500, feedCostMonthly: 90, appeal: 7, tilesPerAnimal: 2, socialMin: 1, terrain: { dirt: 0.5, grass: 0.3, sand: 0.2 }, needsWater: false, strength: 1, lifespan: 9, matureAt: 1.5, unlockRating: 150, art: 'quadruped', artL: 18, artH: 12, body: '#5a4632', belly: '#6b563e', accent: '#d8b878', ears: 'round', tail: 'stub',  legs: 0.20, girth: 1.0,  head: 0.26, snout: 1.6, feature: 'spikes' },
  { id: 'komodo',    name: 'Komodo Dragon',     emoji: '🦎', cost: 4000, feedCostMonthly: 240, appeal: 9, tilesPerAnimal: 8, socialMin: 1, terrain: { dirt: 0.5, sand: 0.4, grass: 0.1 },   needsWater: false, strength: 3, lifespan: 10, matureAt: 2.0, unlockRating: 500, art: 'sprawler',  artL: 40, artH: 13, body: '#6b6455', belly: '#9a917c', accent: '#443f35', tail: 'taper' },
];

// ── guest transport ───────────────────────────────────────────────────────
export type TransportId = 'monorail' | 'cablecar' | 'train' | 'safari';

export interface TransportDef {
  id: TransportId;
  name: string;
  emoji: string;
  stationCost: number;
  trackPerTile: number;
  fare: number;
  speed: number;          // tiles per second
  capacity: number;       // guests carried per vehicle
  elevated: boolean;      // drawn up on pylons or cables
  viewsAnimals: boolean;  // riders see habitats the route passes
  colour: string;
  blurb: string;
}

export const TRANSPORT: TransportDef[] = [
  { id: 'monorail', name: 'Monorail', emoji: '🚝', stationCost: 900, trackPerTile: 55, fare: 6, speed: 3.4, capacity: 12, elevated: true,  viewsAnimals: false, colour: '#d8dde2',
    blurb: 'Fast elevated link across the zoo. Great for long sites.' },
  { id: 'cablecar', name: 'Cable Car', emoji: '🚠', stationCost: 1100, trackPerTile: 70, fare: 8, speed: 2.0, capacity: 6, elevated: true, viewsAnimals: true,  colour: '#e05b4a',
    blurb: 'Slow, scenic, and riders see the habitats below.' },
  { id: 'train',    name: 'Zoo Train', emoji: '🚂', stationCost: 700, trackPerTile: 40, fare: 5, speed: 2.4, capacity: 16, elevated: false, viewsAnimals: false, colour: '#2e7d32',
    blurb: 'Cheap ground-level loop. Carries a lot of people.' },
  { id: 'safari',   name: 'Safari Trail', emoji: '🚙', stationCost: 1300, trackPerTile: 60, fare: 12, speed: 1.6, capacity: 8, elevated: false, viewsAnimals: true,
    colour: '#b5651d', blurb: 'Drives right past the enclosures — riders see everything it passes.' },
];

export type BarrierId = 'timber' | 'hedge' | 'mesh' | 'glass' | 'stone';

export interface BarrierDef {
  id: BarrierId;
  name: string;
  emoji: string;
  cost: number;         // per edge segment
  strength: number;     // 1 weak, 3 escape-proof
  seeThrough: boolean;  // guests can only view an animal over a see-through barrier
  beauty: number;
  blurb: string;
}

export const BARRIERS: BarrierDef[] = [
  { id: 'timber', name: 'Timber Rail',  emoji: '🪵', cost: 25, strength: 1, seeThrough: true,  beauty: 1,
    blurb: 'Cheap post-and-rail. Fine for roos and emus.' },
  { id: 'hedge',  name: 'Hedge Screen', emoji: '🌿', cost: 45, strength: 1, seeThrough: true,  beauty: 4,
    blurb: 'Looks lovely, holds almost nothing.' },
  { id: 'mesh',   name: 'Wire Mesh',    emoji: '🕸️', cost: 55, strength: 2, seeThrough: true,  beauty: 0,
    blurb: 'Holds most mid-sized animals.' },
  { id: 'glass',  name: 'Glass Wall',   emoji: '🪟', cost: 110, strength: 3, seeThrough: true, beauty: 3,
    blurb: 'Escape-proof and the best view in the zoo.' },
  { id: 'stone',  name: 'Stone Wall',   emoji: '🧱', cost: 80, strength: 3, seeThrough: false, beauty: 2,
    blurb: 'Escape-proof, but guests cannot see over it.' },
];

export type ShopId = 'food' | 'drink' | 'toilet' | 'info';

export interface ShopDef {
  id: ShopId;
  name: string;
  emoji: string;
  cost: number;
  price: number;        // sale price per use
  upkeepMonthly: number;
  satisfies: 'hunger' | 'thirst' | 'bladder' | 'souvenir';
  colour: string;
}

export const SHOPS: ShopDef[] = [
  { id: 'food',   name: 'Bush Tucker Kiosk', emoji: '🍔', cost: 500, price: 12, upkeepMonthly: 40, satisfies: 'hunger',   colour: '#c0392b' },
  { id: 'drink',  name: 'Billabong Drinks',  emoji: '🥤', cost: 400, price: 6,  upkeepMonthly: 30, satisfies: 'thirst',   colour: '#2980b9' },
  { id: 'toilet', name: 'Dunny Block',       emoji: '🚻', cost: 350, price: 1,  upkeepMonthly: 25, satisfies: 'bladder',  colour: '#7f8c8d' },
  { id: 'info',   name: 'Souvenir Stand',    emoji: '🧸', cost: 450, price: 15, upkeepMonthly: 35, satisfies: 'souvenir', colour: '#8e6d3a' },
];

export type SceneryId =
  | 'tree' | 'bush' | 'rock' | 'flowers'
  | 'climb' | 'logs' | 'hammock' | 'shelter' | 'puzzle' | 'pool'
  | 'bench' | 'bin' | 'lamp' | 'sign' | 'podium'
  | 'feeder' | 'waterer' | 'browse';

/** Which build menu an item belongs in. */
export type SceneryCategory = 'enrichment' | 'feeding' | 'scenery';

export interface SceneryDef {
  id: SceneryId;
  name: string;
  emoji: string;
  cost: number;
  enrichment: number;   // counts only inside a habitat
  beauty: number;       // counts only outside one
  blurb: string;
  category: SceneryCategory;
  guestItem?: boolean;  // belongs on a path, not in a habitat
  foodCapacity?: number; // feeding items deepen the habitat's trough
  hydration?: number;    // small standing welfare bonus inside a habitat
}

export const SCENERY: SceneryDef[] = [
  // ── enrichment: goes inside a habitat and lifts animal welfare ──
  { id: 'climb',   name: 'Climbing Frame', emoji: '🧗', cost: 220, enrichment: 8, beauty: 1, category: 'enrichment', blurb: 'Top-tier enrichment for apes and cats.' },
  { id: 'puzzle',  name: 'Feeder Puzzle',  emoji: '🧩', cost: 160, enrichment: 7, beauty: 0, category: 'enrichment', blurb: 'Makes them work for a feed.' },
  { id: 'hammock', name: 'Hammock',        emoji: '🛏️', cost: 140, enrichment: 6, beauty: 1, category: 'enrichment', blurb: 'Somewhere to lounge.' },
  { id: 'pool',    name: 'Plunge Pool',    emoji: '💧', cost: 200, enrichment: 6, beauty: 2, category: 'enrichment', blurb: 'A soak without re-terraforming.' },
  { id: 'shelter', name: 'Den Shelter',    emoji: '🏚️', cost: 180, enrichment: 5, beauty: 1, category: 'enrichment', blurb: 'Shade and a place to retreat.' },
  { id: 'logs',    name: 'Log Pile',       emoji: '🪵', cost: 90,  enrichment: 4, beauty: 1, category: 'enrichment', blurb: 'To climb over and shelter under.' },
  { id: 'rock',    name: 'Boulder',        emoji: '🪨', cost: 50,  enrichment: 2, beauty: 1, category: 'enrichment', blurb: 'A basking spot.' },

  // ── feeding & wellbeing: keeps a habitat fed for longer between keeper visits ──
  { id: 'feeder',  name: 'Feeding Station', emoji: '🍽️', cost: 190, enrichment: 2, beauty: 0, category: 'feeding', foodCapacity: 90, blurb: 'Holds a lot more food, so keepers need to visit far less often.' },
  { id: 'browse',  name: 'Browse Rack',    emoji: '🌾', cost: 110, enrichment: 3, beauty: 0, category: 'feeding', foodCapacity: 45, blurb: 'Hanging greens. Extra food and a bit of enrichment.' },
  { id: 'waterer', name: 'Water Trough',   emoji: '🚰', cost: 120, enrichment: 1, beauty: 0, category: 'feeding', hydration: 1, blurb: 'Clean drinking water. A steady lift to welfare.' },

  // ── zoo surrounds: decoration and guest amenities, outside the habitats ──
  { id: 'tree',    name: 'Gum Tree',      emoji: '🌳', cost: 80,  enrichment: 3, beauty: 3, category: 'scenery', blurb: 'Shade and something to climb.' },
  { id: 'bush',    name: 'Wattle Bush',   emoji: '🌿', cost: 40,  enrichment: 2, beauty: 2, category: 'scenery', blurb: 'Cover to hide in.' },
  { id: 'flowers', name: 'Flower Bed',    emoji: '🌼', cost: 30,  enrichment: 1, beauty: 3, category: 'scenery', blurb: 'Pretty, for the guests.' },
  { id: 'bench',   name: 'Bench',         emoji: '🪑', cost: 60,  enrichment: 0, beauty: 1, category: 'scenery', guestItem: true, blurb: 'Tired guests sit and get their legs back.' },
  { id: 'bin',     name: 'Rubbish Bin',   emoji: '🗑️', cost: 50,  enrichment: 0, beauty: 0, category: 'scenery', guestItem: true, blurb: 'Guests nearby bin their rubbish instead of dropping it.' },
  { id: 'lamp',    name: 'Park Lamp',     emoji: '🏮', cost: 70,  enrichment: 0, beauty: 3, category: 'scenery', guestItem: true, blurb: 'Pure decoration, and guests like it.' },
  { id: 'sign',    name: 'Education Board', emoji: '📖', cost: 130, enrichment: 0, beauty: 1, category: 'scenery', guestItem: true, blurb: 'On a path beside a habitat — guests stop and learn about the species.' },
  { id: 'podium',  name: 'Talk Podium',   emoji: '🎤', cost: 280, enrichment: 0, beauty: 1, category: 'scenery', guestItem: true, blurb: 'Staff an educator here to run keeper talks.' },
];

// ── staff ────────────────────────────────────────────────────────────────
export type StaffRole = 'keeper' | 'caretaker' | 'vet' | 'educator';

export interface StaffDef { role: StaffRole; name: string; emoji: string; wage: number; blurb: string }

export const STAFF: StaffDef[] = [
  { role: 'keeper',    name: 'Zookeeper', emoji: '🧑‍🌾', wage: 300, blurb: 'Refills habitat food troughs. One can cover about three habitats.' },
  { role: 'caretaker', name: 'Caretaker', emoji: '🧹', wage: 220, blurb: 'Sweeps litter off the paths. One handles about ten messy tiles.' },
  { role: 'vet',       name: 'Vet',       emoji: '💉', wage: 380, blurb: 'Speeds recovery for every sick animal in the zoo.' },
  { role: 'educator',  name: 'Educator',  emoji: '🎓', wage: 340, blurb: 'Runs keeper talks from a Talk Podium — big crowd pleaser.' },
];

// ── sites ────────────────────────────────────────────────────────────────
export type SiteId = 'taronga' | 'dubbo';

export interface SiteDef {
  id: SiteId;
  name: string;
  subtitle: string;
  blurb: string;
  entrance: [number, number];
  /** Optional second gate. Taronga has the ferry wharf and the road entrance. */
  entrance2?: [number, number];
  backdrop: 'sydney' | 'plains';
  /** Terrain palette overrides, so Dubbo reads as red country. */
  palette: { grass: string; dirt: string; sand: string; water: string };
  /** Species the real zoo is known for — the Recreate challenge asks for these. */
  signature: string[];
}

export const SITES: SiteDef[] = [
  {
    id: 'taronga',
    name: 'Taronga Sydney',
    subtitle: 'Mosman · 21 hectares on the harbour',
    blurb: 'A steep headland site looking straight across the water at the bridge and the Opera '
         + 'House. Beautiful, and tight — every metre of it has to earn its place.',
    entrance: [46, 24],
    entrance2: [48, 92],
    backdrop: 'sydney',
    palette: { grass: '#5a9e4b', dirt: '#9c7a4f', sand: '#ddc98d', water: '#2f6ea8' },
    signature: ['koala', 'platypus', 'echidna', 'tasdevil', 'penguin',
                'sealion', 'chimp', 'gorilla', 'tiger', 'redpanda'],
  },
  {
    id: 'dubbo',
    name: 'Western Plains, Dubbo',
    subtitle: 'Central NSW · room to roam',
    blurb: 'Red earth and open country, many times the size of the harbour site. Space for herds '
         + 'and a circuit long enough that guests will want a ride.',
    entrance: [48, 90],
    backdrop: 'plains',
    palette: { grass: '#8a9c4a', dirt: '#a85a32', sand: '#c98a52', water: '#3d7dbb' },
    signature: ['lion', 'giraffe', 'zebra', 'elephant', 'meerkat',
                'cassowary', 'emu', 'kangaroo', 'dingo', 'komodo'],
  },
];

export const siteDef = (id: SiteId) => SITES.find(s => s.id === id)!;

// ── scenarios ────────────────────────────────────────────────────────────
export interface Objective { id: string; label: string; target: number }

export type ScenarioId = 'taronga-new' | 'taronga-recreate' | 'dubbo-new' | 'dubbo-recreate';

export interface ScenarioDef {
  id: ScenarioId;
  site: SiteId;
  kind: 'build' | 'recreate';
  name: string;
  brief: string;
  deadlineYear: number;
  bankruptAt: number;
  startCash: number;
  objectives: Objective[];
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'taronga-new', site: 'taronga', kind: 'build',
    name: 'Taronga: From the Ground Up',
    brief: 'An empty headland above Sydney Harbour. Build a zoo the city can be proud of — one '
         + 'that teaches its visitors and breeds animals for release. Five years.',
    deadlineYear: 6, bankruptAt: -5000, startCash: 25000,
    objectives: [
      { id: 'rating',   label: 'Zoo rating',        target: 600 },
      { id: 'species',  label: 'Different species', target: 10 },
      { id: 'guests',   label: 'Guests all-time',   target: 400 },
      { id: 'welfare',  label: 'Average welfare %', target: 70 },
      { id: 'educated', label: 'Guests educated',   target: 200 },
      { id: 'released', label: 'Released to wild',  target: 3 },
    ],
  },
  {
    id: 'taronga-recreate', site: 'taronga', kind: 'recreate',
    name: 'Recreate Taronga Sydney',
    brief: 'Rebuild the real thing: every one of Taronga\'s ten signature species, properly housed '
         + 'on the harbour site, at the welfare standard the zoo actually keeps. Six years.',
    deadlineYear: 7, bankruptAt: -5000, startCash: 60000,
    objectives: [
      { id: 'signature', label: 'Signature species', target: 10 },
      { id: 'habitats',  label: 'Habitats built',    target: 8 },
      { id: 'welfare',   label: 'Average welfare %', target: 78 },
      { id: 'rating',    label: 'Zoo rating',        target: 700 },
      { id: 'educated',  label: 'Guests educated',   target: 300 },
    ],
  },
  {
    id: 'dubbo-new', site: 'dubbo', kind: 'build',
    name: 'Western Plains: From the Ground Up',
    brief: 'Open country and a long perimeter. Build a zoo big enough that guests need a ride to '
         + 'see it all, and keep the herds thriving. Six years.',
    deadlineYear: 7, bankruptAt: -8000, startCash: 40000,
    objectives: [
      { id: 'rating',   label: 'Zoo rating',        target: 620 },
      { id: 'species',  label: 'Different species', target: 12 },
      { id: 'guests',   label: 'Guests all-time',   target: 600 },
      { id: 'welfare',  label: 'Average welfare %', target: 72 },
      { id: 'rides',    label: 'Transport lines',   target: 2 },
      { id: 'released', label: 'Released to wild',  target: 4 },
    ],
  },
  {
    id: 'dubbo-recreate', site: 'dubbo', kind: 'recreate',
    name: 'Recreate Western Plains',
    brief: 'The open-range zoo as it really is: ten signature species in big paddocks, a circuit '
         + 'guests can ride, and the space used properly. Six years.',
    deadlineYear: 7, bankruptAt: -8000, startCash: 90000,
    objectives: [
      { id: 'signature', label: 'Signature species', target: 10 },
      { id: 'habitats',  label: 'Habitats built',    target: 9 },
      { id: 'bigpens',   label: 'Paddocks 40+ tiles', target: 5 },
      { id: 'rides',     label: 'Transport lines',   target: 2 },
      { id: 'welfare',   label: 'Average welfare %', target: 75 },
    ],
  },
];

export const scenarioDef = (id: ScenarioId) => SCENARIOS.find(s => s.id === id)!;

export const COSTS = {
  path: 12,
  fence: 25,
  gate: 60,
  terrain: 8,          // per tile repaint
  bulldozeRefund: 0.4, // fraction refunded
  keeperWage: 300,     // monthly (see STAFF for the others)
};

/** Staff get their own name pool so they read as colleagues, not visitors. */
export const STAFF_NAMES = [
  'Kel', 'Rhonda', 'Baz', 'Trish', 'Mick', 'Nadia', 'Shane', 'Frankie', 'Doug', 'Priya',
  'Wazza', 'Lena', 'Curtis', 'Bindi', 'Hamish', 'Aroha', 'Joel', 'Marnie', 'Sione', 'Elke',
  'Reggie', 'Tanya', 'Ibrahim', 'Cheryl', 'Nate', 'Yuki', 'Gus', 'Petra', 'Dev', 'Roslyn',
];

export const GUEST_NAMES = [
  'Bruce', 'Sheila', 'Mia', 'Jack', 'Olivia', 'Noah', 'Charlotte', 'Oliver', 'Amelia', 'Will',
  'Isla', 'Leo', 'Grace', 'Henry', 'Chloe', 'Archie', 'Ruby', 'Tom', 'Zoe', 'Lachlan',
  'Matilda', 'Cooper', 'Sienna', 'Xavier', 'Evie', 'Banjo', 'Daisy', 'Ned', 'Tahlia', 'Riley',
];
