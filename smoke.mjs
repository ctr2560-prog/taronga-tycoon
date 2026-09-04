// Headless smoke test of the simulation (no canvas/DOM needed).
import { Game } from './dist-smoke/game.js';
import { SPECIES, SCENERY, SITES, SCENARIOS, GRID } from './dist-smoke/data.js';

const log = [];

// Sites paint their own terrain and put the entrance where the real zoo has it,
// so tests level a patch of ground and route their own path from the gate.
function flatten(g, x0 = 3, y0 = 3, x1 = 74, y1 = 74) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      g.tile(x, y).terrain = 'grass';
      g.playable[y * GRID + x] = 1;      // claim it as buildable ground too
      g.offsite[y * GRID + x] = 0;       // ...and as part of the site
    }
  }
  g.recomputeHabitats();
}
function pathTo(g, x, y) {
  const [ex, ey] = g.entrance;
  const step = y >= ey ? 1 : -1;
  for (let yy = ey; yy !== y + step; yy += step) g.buildPath(ex, yy);
  const lo = Math.min(ex, x), hi = Math.max(ex, x);
  for (let xx = lo; xx <= hi; xx++) g.buildPath(xx, y);
}

const g = new Game();
flatten(g);
const ok = (label, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

// Wall off tiles (10,10)..(14,14) by running walls along its four edges.
const x0 = 10, y0 = 10, x1 = 14, y1 = 14;
const wallRow = (y, dir, m = 'timber') => g.buildWallRun(g.wallRun(x0, y, dir, x1, y), false, m);
const wallCol = (x, dir, m = 'timber') => g.buildWallRun(g.wallRun(x, y0, dir, x, y1), false, m);
wallRow(y0, 0);          // north edge
wallRow(y1, 2);          // south edge
wallCol(x0, 3);          // west edge
wallCol(x1, 1);          // east edge

ok('habitat detected', g.habitats.size === 1, `${g.habitats.size} habitat(s)`);
const hab = [...g.habitats.values()][0];
ok('walls enclose the full 5x5 = 25 tiles', hab.tiles.length === 25, `${hab.tiles.length} tiles`);
ok('no gate yet', hab.hasGate === false);

// turning one wall segment into a gate
g.buildWallRun([g.edgeRef(x0 + 2, y0, 0)], true, 'timber');
ok('habitat has a gate', [...g.habitats.values()][0].hasGate === true);
ok('gate still encloses the habitat', [...g.habitats.values()][0].tiles.length === 25);
ok('a drag lays a straight run', g.wallRun(x0, y0, 0, x1, y0).length === 5,
   String(g.wallRun(x0, y0, 0, x1, y0).length));

// Barrier strength: timber is strength 1, so a croc-grade animal is not contained
ok('timber perimeter is strength 1', [...g.habitats.values()][0].minStrength === 1,
   'minStrength=' + [...g.habitats.values()][0].minStrength);

// Buy animals
const bought = g.buyAnimal('kangaroo', hab.id) && g.buyAnimal('kangaroo', hab.id) && g.buyAnimal('kangaroo', hab.id);
ok('bought 3 kangaroos', bought && g.animals.length === 3, `${g.animals.length} animals`);

// Water-requiring species should be refused without water
const beforeCash = g.cash;
const croc = g.buyAnimal('croc', hab.id);
ok('croc refused (no water)', croc === false && g.cash === beforeCash);

// Paint water then retry
g.paintTerrain(x0 + 1, y0 + 1, 'water');
g.paintTerrain(x0 + 2, y0 + 1, 'water');
ok('water registered in habitat', [...g.habitats.values()][0].water === 2);

// Paths + shops. A path can now run right up against the barrier.
pathTo(g, x0 + 1, y0 - 1);
ok('path runs right alongside the barrier', g.tile(x0 + 1, y0 - 1).path === true);
ok('path BFS connects to entrance', g.pathDist[(y0 - 1) * GRID + (x0 + 1)] > 0,
   'dist=' + g.pathDist[(y0 - 1) * GRID + (x0 + 1)]);

const shopOk = g.buildShop(x0 + 4, y0 - 2, 'food');
ok('shop built beside a path', shopOk === true);
const shopBad = g.buildShop(2, 2, 'drink');
ok('shop refused away from paths', shopBad === false);

g.hireStaff('keeper');
ok('keeper hired', g.countStaff('keeper') === 1);

// Run ~4 simulated minutes at 3x
g.speed = 3;
g.cash = 200000; // isolate mechanics from bankruptcy
// Sample the trough as we go. A snapshot at the end is flaky — the level
// legitimately dips to zero the moment animals finish a feed, before the
// keeper walks back over. What matters is that it gets refilled at all.
let troughPeak = 0;
let hungerPeak = 0;
for (let i = 0; i < 8000; i++) {
  g.update(1 / 30);
  const h = [...g.habitats.values()][0];
  if (h) troughPeak = Math.max(troughPeak, h.food);
  for (const a of g.animals) hungerPeak = Math.max(hungerPeak, a.hunger);
}

ok('game clock advanced', g.day + g.month * 30 + g.year * 360 > 360, `Yr${g.year} M${g.month} D${g.day}`);
ok('guests entered the zoo', g.guestsSinceStart > 0, `${g.guestsSinceStart} all-time, ${g.guests.length} now`);
ok('guests viewed the habitat', g.guests.some(x => x.seen.size > 0) || g.guestsSinceStart > 5);
ok('admission + shop revenue earned', g.totalEarned > 0, '$' + g.totalEarned);
ok('keeper refilled the trough', troughPeak > 50, 'peak=' + Math.round(troughPeak));
ok('animals never went close to starving', hungerPeak < 85, 'worst hunger=' + Math.round(hungerPeak));
ok('animals fed (welfare > 0)', g.animals.every(a => a.welfare > 0),
   'welfare=' + g.animals.map(a => a.welfare).join(','));
ok('animals stayed inside habitat', g.animals.every(a => a.habitatId >= 0));
ok('animals remain on habitat tiles', g.animals.every(a => {
  const t = g.tile(Math.floor(a.x), Math.floor(a.y));
  return t.habitatId === a.habitatId;
}));
ok('guests stay on paths', g.guests.every(x => g.tile(Math.floor(x.x), Math.floor(x.y)).path));
ok('rating responds to the zoo', g.rating > 100, 'rating=' + g.rating);
ok('no NaN in economy', Number.isFinite(g.cash) && Number.isFinite(g.rating));

// A strong animal behind a weak barrier should break out on its own
{
  const g2 = new Game();
  flatten(g2);
  const box = (a, b, c, d2, dir, m) => g2.buildWallRun(g2.wallRun(a, b, dir, c, d2), false, m);
  box(10, 10, 14, 10, 0, 'timber'); box(10, 14, 14, 14, 2, 'timber');
  box(10, 10, 10, 14, 3, 'timber'); box(14, 10, 14, 14, 1, 'timber');
  g2.buildWallRun([g2.edgeRef(12, 10, 0)], true, 'timber');
  g2.paintTerrain(11, 11, 'water');
  g2.cash = 100000;
  g2.hireStaff('keeper');            // otherwise it starves before it can escape
  g2.rating = 900;                   // crocs unlock at 500
  const hab2 = [...g2.habitats.values()][0];
  g2.buyAnimal('croc', hab2.id);
  ok('croc placed behind a timber rail', g2.animals.length === 1);
  g2.speed = 3;
  for (let i = 0; i < 12000 && g2.animals[0]?.habitatId >= 0; i++) g2.update(1 / 30);
  ok('weak barrier lets a strong animal escape', g2.animals[0]?.habitatId < 0);

  // and a stone wall holds it
  const g3 = new Game();
  flatten(g3);
  const box3 = (a, b, c, d2, dir) => g3.buildWallRun(g3.wallRun(a, b, dir, c, d2), false, 'stone');
  box3(10, 10, 14, 10, 0); box3(10, 14, 14, 14, 2); box3(10, 10, 10, 14, 3); box3(14, 10, 14, 14, 1);
  g3.buildWallRun([g3.edgeRef(12, 10, 0)], true, 'stone');
  g3.paintTerrain(11, 11, 'water');
  g3.cash = 100000;
  g3.hireStaff('keeper');
  g3.rating = 900;
  g3.buyAnimal('croc', [...g3.habitats.values()][0].id);
  g3.speed = 3;
  for (let i = 0; i < 12000; i++) g3.update(1 / 30);
  ok('a stone wall holds a croc', g3.animals[0]?.habitatId >= 0);
  ok('stone perimeter is strength 3', [...g3.habitats.values()][0].minStrength === 3);
}

// ── life cycle: breeding, ageing and death ──
{
  const g4 = new Game();
  flatten(g4);
  const box = (a, b, c, d2, dir) => g4.buildWallRun(g4.wallRun(a, b, dir, c, d2), false, 'mesh');
  box(10, 10, 20, 10, 0); box(10, 20, 20, 20, 2); box(10, 10, 10, 20, 3); box(20, 10, 20, 20, 1);
  g4.buildWallRun([g4.edgeRef(12, 10, 0)], true, 'mesh');
  g4.cash = 500000;
  const h4 = [...g4.habitats.values()][0];
  for (let i = 0; i < 4; i++) g4.buyAnimal('kangaroo', h4.id);
  ok('animals have sexes', new Set(g4.animals.map(a => a.sex)).size === 2);
  ok('animals start mature', g4.animals.every(a => a.age > 0));
  g4.hireStaff('keeper');
  g4.buildScenery(12, 12, 'climb'); g4.buildScenery(14, 14, 'logs');
  g4.buildScenery(16, 12, 'pool');  g4.buildScenery(13, 16, 'hammock');
  g4.speed = 3;
  const before = g4.animals.length;
  for (let i = 0; i < 60000 && g4.animals.length <= before; i++) g4.update(1 / 30);
  ok('healthy animals breed', g4.animals.length > before, `${before} -> ${g4.animals.length}`);
  ok('newborns are juveniles', g4.animals.some(a => a.age < 1));

  // an animal left to starve loses health and dies
  const g5 = new Game();
  flatten(g5);
  g5.cash = 500000;
  const box5 = (a, b, c, d2, dir) => g5.buildWallRun(g5.wallRun(a, b, dir, c, d2), false, 'mesh');
  box5(10, 10, 14, 10, 0); box5(10, 14, 14, 14, 2); box5(10, 10, 10, 14, 3); box5(14, 10, 14, 14, 1);
  g5.buildWallRun([g5.edgeRef(12, 10, 0)], true, 'mesh');
  g5.buyAnimal('dingo', [...g5.habitats.values()][0].id);   // no keeper, no food
  g5.speed = 3;
  for (let i = 0; i < 90000 && g5.animals.length; i++) g5.update(1 / 30);
  ok('a starved animal eventually dies', g5.animals.length === 0);
}

// ── unlocks, litter, objectives ──
{
  const g6 = new Game();
  g6.rating = 100;
  ok('exotics start locked', g6.unlocked(SPECIES.find(s2 => s2.id === 'elephant')) === false);
  ok('natives start unlocked', g6.unlocked(SPECIES.find(s2 => s2.id === 'kangaroo')) === true);
  g6.rating = 900;
  ok('exotics unlock at high rating', g6.unlocked(SPECIES.find(s2 => s2.id === 'elephant')) === true);

  const prog = g6.objectiveProgress();
  ok('objectives report progress', prog.length === 6 && prog.every(p => 'current' in p));

  const g7 = new Game();
  g7.cash = -9000;
  g7.update(0.1);
  ok('bankruptcy ends the game', g7.outcome === 'lost', g7.outcomeReason);
}

// ── education and conservation ──
{
  const g8 = new Game();
  flatten(g8);
  g8.cash = 500000;
  const box = (a, b, c, d2, dir) => g8.buildWallRun(g8.wallRun(a, b, dir, c, d2), false, 'mesh');
  box(10, 10, 18, 10, 0); box(10, 18, 18, 18, 2); box(10, 10, 10, 18, 3); box(18, 10, 18, 18, 1);
  g8.buildWallRun([g8.edgeRef(12, 10, 0)], true, 'mesh');
  const h8 = [...g8.habitats.values()][0];
  for (let i = 0; i < 4; i++) g8.buyAnimal('kangaroo', h8.id);
  g8.hireStaff('keeper');
  g8.buildScenery(14, 12, 'climb'); g8.buildScenery(12, 14, 'logs');
  g8.buildScenery(16, 14, 'pool');  g8.buildScenery(15, 16, 'hammock');

  // path up to the fence, with an education board beside it
  pathTo(g8, 12, 9);
  ok('education board goes on a path-side tile', g8.buildScenery(15, 8, 'sign') === true);

  g8.speed = 3;
  for (let i = 0; i < 20000 && g8.educatedTotal === 0; i++) g8.update(1 / 30);
  ok('guests learn from an education board', g8.educatedTotal > 0, 'educated=' + g8.educatedTotal);

  // a zoo-bred animal, grown up, can go back to the wild
  const born = { ...g8.animals[0] };
  const captive = g8.animals.find(a => !a.bornHere);
  ok('bought animals cannot be released', g8.canRelease(captive) !== null);

  g8.animals.push({ ...captive, id: 99999, bornHere: true, age: 99, health: 100, welfare: 90 });
  const bred = g8.animals[g8.animals.length - 1];
  ok('a healthy zoo-bred adult can be released', g8.canRelease(bred) === null, String(g8.canRelease(bred)));
  const relOk = g8.releaseToWild(bred);
  ok('releasing works', relOk && g8.released === 1);
  ok('release earns conservation credits', g8.conservation > 0, 'credits=' + g8.conservation);
  ok('released animal leaves the zoo', !g8.animals.some(a => a.id === 99999));
}

// ── saving ──
{
  // a stand-in for localStorage so the save system can be exercised in node
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const gs = new Game('scenario', 'dubbo-recreate');
  flatten(gs);
  gs.year = 3; gs.rating = 640; gs.educatedTotal = 77;
  const box = (a, b2, c, d2, dir) => gs.buildWallRun(gs.wallRun(a, b2, dir, c, d2), false, 'stone');
  box(20, 40, 28, 40, 0); box(20, 48, 28, 48, 2); box(20, 40, 20, 48, 3); box(28, 40, 28, 48, 1);
  gs.buildWallRun([gs.edgeRef(22, 40, 0)], true, 'stone');
  gs.buyAnimal('kangaroo', gs.tile(24, 44).habitatId);
  gs.hireStaff('keeper');
  gs.cash = 12345;                       // set last, so building does not spend it

  ok('there are three save slots', Game.SLOTS === 3);
  ok('empty slots report nothing', Game.slotInfo(1) === null);
  ok('saving works', gs.save(1) === true);
  const info = Game.slotInfo(1);
  ok('a slot summarises itself', !!info && info.rating === 640 && /Year 3/.test(info.date), JSON.stringify(info));
  ok('the slot names the site and scenario', info.label.includes('Dubbo') && info.label.includes('Recreate'));

  const back = Game.load(1);
  ok('a saved zoo loads', !!back);
  ok('money survives the round trip', back.cash === 12345);
  ok('the scenario survives', back.scenario.id === 'dubbo-recreate' && back.site === 'dubbo');
  ok('animals survive', back.animals.length === 1 && back.animals[0].species === 'kangaroo');
  ok('staff survive with their names', back.staff.length === 1 && back.staff[0].name === gs.staff[0].name);
  ok('walls survive', back.habitats.size === 1);
  ok('slots do not collide', Game.slotInfo(0) === null && Game.slotInfo(2) === null);

  gs.save(2);
  ok('the latest slot is found', Game.latestSlot() === 2, String(Game.latestSlot()));
  Game.deleteSlot(2);
  ok('a slot can be deleted', Game.slotInfo(2) === null && Game.latestSlot() === 1);

  // export / import
  const text = gs.toJSON();
  ok('export produces JSON', text.length > 100 && text.trimStart().startsWith('{'));
  const imported = Game.fromJSON(text);
  ok('a downloaded zoo can be re-imported',
     !!imported && imported.cash === 12345 && imported.animals.length === 1);
  ok('rubbish input is rejected', Game.fromJSON('not a zoo') === null);
  ok('an empty slot loads as nothing', Game.load(2) === null);
}

// ── sites and scenarios ──
{
  ok('two sites exist', SITES.length === 2 && SITES.some(s2 => s2.id === 'dubbo'));
  ok('four scenarios exist', SCENARIOS.length === 4);
  ok('each site has two challenges',
     SITES.every(s2 => SCENARIOS.filter(sc => sc.site === s2.id).length === 2));
  ok('recreate and build differ per site',
     SITES.every(s2 => new Set(SCENARIOS.filter(sc => sc.site === s2.id).map(sc => sc.kind)).size === 2));
  ok('signature rosters differ',
     SITES[0].signature.filter(x => SITES[1].signature.includes(x)).length <= 2);
  ok('every signature species is a real species',
     SITES.every(s2 => s2.signature.every(id => SPECIES.some(sp => sp.id === id))));

  // the harbour site should genuinely be waterfront, the plains site should not
  const tar = new Game('sandbox', 'taronga-new');
  const dub = new Game('sandbox', 'dubbo-new');
  const share = (g2, kind) => g2.tiles.filter(t => t.terrain === kind).length / g2.tiles.length;
  ok('Taronga has a lot of harbour', share(tar, 'water') > 0.2, (share(tar, 'water') * 100).toFixed(0) + '%');
  ok('Dubbo is mostly dry land', share(dub, 'water') < 0.06, (share(dub, 'water') * 100).toFixed(0) + '%');
  ok('Dubbo has far more usable ground',
     (1 - share(dub, 'water')) > (1 - share(tar, 'water')) + 0.15);
  ok('entrances differ per site',
     tar.entrance[0] !== dub.entrance[0] || tar.entrance[1] !== dub.entrance[1]);
  // Taronga's gate is the ferry wharf, so it deliberately stands over water —
  // what matters is that the decking runs back and joins the headland.
  ok('the entrance has a starter path', tar.tile(...tar.entrance).path && dub.tile(...dub.entrance).path);
  ok('the wharf reaches dry land', (() => {
    const [ex, ey] = tar.entrance;
    for (let y = ey; y < ey + 14; y++) {
      if (!tar.tile(ex, y).path) return false;
      if (tar.tile(ex, y).terrain !== 'water') return true;   // made landfall
    }
    return false;
  })());
  ok('the wharf itself is buildable', tar.canBuild(...tar.entrance));
  ok('the city across the water is not buildable',
     [...Array(GRID)].every((_, x) => !tar.canBuild(x, 1)));
  ok('the headland is buildable', tar.canBuild(50, 70));
  ok('the whole Dubbo run is buildable', dub.canBuild(48, 48) && dub.canBuild(20, 30));

  // a natural dam inside a paddock must not break the enclosure
  {
    const gp = new Game('sandbox', 'dubbo-new');
    const box2 = (a, b2, c, d2, dir) => gp.buildWallRun(gp.wallRun(a, b2, dir, c, d2), false, 'mesh');
    box2(20, 40, 28, 40, 0); box2(20, 48, 28, 48, 2);
    box2(20, 40, 20, 48, 3); box2(28, 40, 28, 48, 1);
    gp.tile(24, 44).terrain = 'water';        // a dam right in the middle
    gp.playable[44 * GRID + 24] = 0;          // ...which is not buildable
    gp.recomputeHabitats();
    const hab = [...gp.habitats.values()][0];
    ok('a paddock with a dam in it is still one habitat', gp.habitats.size === 1, String(gp.habitats.size));
    ok('the dam counts as part of the paddock', !!hab && hab.tiles.length === 81 && hab.water >= 1,
       hab ? `${hab.tiles.length} tiles, ${hab.water} water` : 'none');
    ok('a water-needing species can live there', gp.canBuild(24, 43) && hab.water > 0);
  }

  // ferries must stay on the harbour — no sailing over the islet or the shore
  ok('the harbour has ferry runs', tar.ferryRoutes.length >= 2, String(tar.ferryRoutes.length));
  ok('Dubbo has no ferries', dub.ferryRoutes.length === 0);
  ok('every ferry run is entirely on water', tar.ferryRoutes.every(r => {
    const steps = Math.ceil(Math.hypot(r.x2 - r.x1, r.y2 - r.y1)) * 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(r.x1 + (r.x2 - r.x1) * t);
      const y = Math.floor(r.y1 + (r.y2 - r.y1) * t);
      if (tar.tile(x, y).terrain !== 'water') return false;
    }
    return true;
  }));
  ok('ferry runs are worth making', tar.ferryRoutes.every(r => Math.hypot(r.x2 - r.x1, r.y2 - r.y1) >= 20));

  // two ways in and out at the harbour: the ferry wharf and the road gate
  ok('Taronga has two gates', tar.entrances.length === 2, String(tar.entrances.length));
  ok('Dubbo has one gate', dub.entrances.length === 1);
  ok('the road gate is near the bottom edge', tar.entrances[1][1] >= GRID - 6, String(tar.entrances[1][1]));
  ok('the road gate is near the middle', Math.abs(tar.entrances[1][0] - GRID / 2) <= 4);
  ok('both gates have a path', tar.entrances.every(([x, y]) => tar.tile(x, y).path));
  ok('both gates are distance zero from an exit',
     tar.entrances.every(([x, y]) => tar.pathDist[y * GRID + x] === 0));

  // guests should use both, arriving and leaving
  const both = new Game('sandbox');
  flatten(both);
  // join the two gates so the whole network is walkable
  for (let y = both.entrances[0][1]; y <= GRID - 1; y++) both.buildPath(both.entrances[0][0], y);
  for (let x = Math.min(...both.entrances.map(e => e[0])); x <= Math.max(...both.entrances.map(e => e[0])); x++) {
    both.buildPath(x, GRID - 2);
  }
  for (let y = GRID - 2; y <= GRID - 1; y++) both.buildPath(both.entrances[1][0], y);
  const bx = 20, by = 40;
  both.buildWallRun(both.wallRun(bx, by, 0, bx + 6, by), false, 'mesh');
  both.buildWallRun(both.wallRun(bx, by + 6, 2, bx + 6, by + 6), false, 'mesh');
  both.buildWallRun(both.wallRun(bx, by, 3, bx, by + 6), false, 'mesh');
  both.buildWallRun(both.wallRun(bx + 6, by, 1, bx + 6, by + 6), false, 'mesh');
  both.buildWallRun([both.edgeRef(bx + 2, by, 0)], true, 'mesh');
  both.cash = 500000;
  both.buyAnimal('kangaroo', both.tile(bx + 3, by + 3).habitatId);
  both.hireStaff('keeper');
  both.admission = 4;
  both.speed = 3;
  const seen = new Set();
  for (let i = 0; i < 40000 && seen.size < 2; i++) {
    const before = new Set(both.guests.map(g2 => g2.id));
    both.update(1 / 30);
    for (const g2 of both.guests) {
      if (!before.has(g2.id)) {
        // note which gate this one walked in through
        const at = both.entrances.findIndex(([ex, ey]) =>
          Math.abs(g2.x - (ex + 0.5)) < 0.6 && Math.abs(g2.y - (ey + 0.5)) < 0.6);
        if (at >= 0) seen.add(at);
      }
    }
  }
  ok('guests arrive through both gates', seen.size === 2, 'gates used: ' + [...seen].join(','));

  // recreate objectives track the signature roster
  const rec = new Game('scenario', 'taronga-recreate');
  flatten(rec);
  const sig = rec.objectiveProgress().find(o => o.id === 'signature');
  ok('recreate asks for signature species', sig && sig.target === 10 && sig.current === 0);
  const box = (a, b, c, d2, dir) => rec.buildWallRun(rec.wallRun(a, b, dir, c, d2), false, 'mesh');
  box(20, 30, 26, 30, 0); box(20, 36, 26, 36, 2); box(20, 30, 20, 36, 3); box(26, 30, 26, 36, 1);
  rec.buildWallRun([rec.edgeRef(22, 30, 0)], true, 'mesh');
  rec.cash = 500000; rec.rating = 900;
  rec.buyAnimal('koala', rec.tile(23, 33).habitatId);
  ok('housing a signature species counts',
     rec.objectiveProgress().find(o => o.id === 'signature').current === 1);
  rec.buyAnimal('kangaroo', rec.tile(23, 33).habitatId);   // not on Taronga's list
  ok('a non-signature species does not count',
     rec.objectiveProgress().find(o => o.id === 'signature').current === 1);
}

// ── staff as individuals ──
{
  const gs = new Game('sandbox');
  gs.hireStaff('keeper'); gs.hireStaff('keeper');
  gs.hireStaff('caretaker'); gs.hireStaff('vet'); gs.hireStaff('educator');
  ok('every role can be hired', gs.staff.length === 5);
  ok('staff get names', gs.staff.every(p => p.name && p.name.length > 1));
  ok('names are unique', new Set(gs.staff.map(p => p.name)).size === 5);
  ok('each has a readable task', gs.staff.every(p => gs.staffTask(p).length > 4),
     gs.staff.map(p => `${p.name}:${gs.staffTask(p)}`).join(' | '));
  const kel = gs.staff[0];
  ok('a named person can be fired', gs.fireStaffMember(kel.id) && !gs.staff.some(p => p.id === kel.id));
  ok('firing by role still works', gs.fireStaff('vet') === undefined && gs.countStaff('vet') === 0);

  // workload: one keeper covers ~3 habitats, so six should read as stretched
  const g2 = new Game('sandbox');
  flatten(g2);
  ok('no keepers with no animals is fine', g2.staffLoad('keeper') === 0);
  for (let i = 0; i < 6; i++) {
    const x = 4 + i * 6;
    g2.buildWallRun(g2.wallRun(x, 6, 0, x + 4, 6), false, 'mesh');
    g2.buildWallRun(g2.wallRun(x, 10, 2, x + 4, 10), false, 'mesh');
    g2.buildWallRun(g2.wallRun(x, 6, 3, x, 10), false, 'mesh');
    g2.buildWallRun(g2.wallRun(x + 4, 6, 1, x + 4, 10), false, 'mesh');
    g2.buildWallRun([g2.edgeRef(x + 1, 6, 0)], true, 'mesh');
    g2.buyAnimal('kangaroo', g2.tile(x + 2, 8).habitatId);
  }
  ok('six stocked habitats built', g2.habitats.size === 6 && g2.animals.length === 6);
  ok('no keeper reads as badly overloaded', g2.staffLoad('keeper') > 3);
  g2.hireStaff('keeper');
  ok('one keeper is stretched by six habitats', g2.staffLoad('keeper') > 1.4);
  for (let i = 0; i < 3; i++) g2.hireStaff('keeper');
  ok('four keepers cope', g2.staffLoad('keeper') <= 1);
}

// ── transport rides ──
{
  const g9 = new Game('sandbox');
  flatten(g9);
  const [gx] = g9.entrance;                   // stations hug the entrance column
  pathTo(g9, gx, 62);
  ok('station needs to touch a path', g9.addStation('monorail', 2, 2, -1) === -1);
  const rid = g9.addStation('monorail', gx - 1, 58, -1);
  ok('first station starts a line', rid > 0 && g9.rides.length === 1);
  ok('one station has no vehicles yet', g9.rides[0].vehicles.length === 0);
  g9.addStation('monorail', gx - 1, 48, rid);   // clear of the wharf apron
  ok('second station opens the line', g9.rides[0].stations.length === 2 && g9.rides[0].vehicles.length > 0);
  ok('route length measured', Math.round(g9.rideLength(g9.rides[0])) === 10,
     String(Math.round(g9.rideLength(g9.rides[0]))));
  const mid = g9.ridePoint(g9.rides[0], 5);
  ok('midpoint sits between the stations', Math.round(mid[1]) === 53, String(mid));

  // guests should actually ride it and pay a fare
  const box = (a, b, c, d2, dir) => g9.buildWallRun(g9.wallRun(a, b, dir, c, d2), false, 'mesh');
  box(12, 50, 20, 50, 0); box(12, 58, 20, 58, 2); box(12, 50, 12, 58, 3); box(20, 50, 20, 58, 1);
  g9.buildWallRun([g9.edgeRef(14, 50, 0)], true, 'mesh');
  for (let x = gx; x >= 13; x--) g9.buildPath(x, 49);
  const hb = [...g9.habitats.values()][0];
  for (let i = 0; i < 3; i++) g9.buyAnimal('kangaroo', hb.id);
  g9.hireStaff('keeper');
  g9.buildShop(23, 48, 'food');
  const earned0 = g9.totalEarned;
  g9.speed = 3;
  for (let i = 0; i < 40000 && g9.rides[0].rides === 0; i++) g9.update(1 / 30);
  ok('guests board the monorail', g9.rides[0].rides > 0, 'journeys=' + g9.rides[0].rides);
  ok('fares add to takings', g9.totalEarned > earned0);
  ok('demolishing a ride refunds', g9.removeRide(rid) && g9.rides.length === 0);

  // a second line of a different type must not extend the first
  const g11 = new Game('sandbox');
  flatten(g11);
  const [hx] = g11.entrance;
  pathTo(g11, hx, 62);
  const cabId = g11.addStation('cablecar', hx - 1, 58, -1);
  g11.addStation('cablecar', hx - 1, 46, cabId);
  ok('cable car line built', g11.rides.length === 1 && g11.rides[0].stations.length === 2);
  // passing the old line's id but a different type should open a new line
  const monoId = g11.addStation('monorail', hx + 1, 58, cabId);
  ok('a different vehicle starts its own line', g11.rides.length === 2 && monoId !== cabId,
     `rides=${g11.rides.length}`);
  ok('the cable car was left alone', g11.rides[0].stations.length === 2);
  g11.addStation('monorail', hx + 1, 46, monoId);
  ok('the monorail runs separately', g11.rides[1].type === 'monorail' && g11.rides[1].stations.length === 2);

  // stations can be demolished
  const cashBefore = g11.cash;
  ok('a station can be bulldozed', g11.removeStationAt(hx + 1, 46));
  ok('bulldozing refunds', g11.cash > cashBefore);
  ok('a one-station line stops running', g11.rides[1].vehicles.length === 0);
  ok('removing the last station drops the line', g11.removeStationAt(hx + 1, 58) && g11.rides.length === 1);
  ok('bulldozing empty ground finds no station', g11.removeStationAt(2, 2) === false);

  // a mid-line station should heal the route rather than break it
  const g12 = new Game('sandbox');
  flatten(g12);
  const [tx3] = g12.entrance;
  pathTo(g12, tx3, 62);
  let t3 = g12.addStation('train', tx3 - 1, 58, -1);
  g12.addStation('train', tx3 - 1, 54, t3);
  g12.addStation('train', tx3 - 1, 50, t3);
  ok('three-station line', g12.rides[0].stations.length === 3);
  g12.removeStationAt(tx3 - 1, 54);
  ok('middle station removed, line still runs',
     g12.rides[0].stations.length === 2 && g12.rides[0].vehicles.length > 0);
  ok('route re-measured after the removal', Math.round(g12.rideLength(g12.rides[0])) === 8,
     String(Math.round(g12.rideLength(g12.rides[0]))));
}

// ── build menus are split by category ──
{
  const cats = new Set(SCENERY.map(s2 => s2.category));
  ok('scenery is split three ways', cats.size === 3 && cats.has('enrichment') && cats.has('feeding'));
  const g10 = new Game('sandbox');
  flatten(g10);
  const box = (a, b, c, d2, dir) => g10.buildWallRun(g10.wallRun(a, b, dir, c, d2), false, 'mesh');
  box(10, 10, 16, 10, 0); box(10, 16, 16, 16, 2); box(10, 10, 10, 16, 3); box(16, 10, 16, 16, 1);
  const h10 = [...g10.habitats.values()][0];
  ok('a bare habitat holds 100 food', h10.foodMax === 100, String(h10.foodMax));
  g10.buildScenery(12, 12, 'feeder');
  ok('a feeding station deepens the trough', [...g10.habitats.values()][0].foodMax === 190,
     String([...g10.habitats.values()][0].foodMax));
}

// Escape detection: knock one segment out of the wall
g.removeWall(g.edgeRef(x0 + 3, y0, 0));
ok('a hole in the wall dissolves the habitat', g.habitats.size === 0, `${g.habitats.size} habitat(s)`);
ok('animals marked escaped', g.animals.every(a => a.habitatId < 0));

console.log(log.join('\n'));
const failures = log.filter(l => l.startsWith('FAIL'));
console.log(`\n${log.length - failures.length}/${log.length} checks passed`);
process.exit(failures.length ? 1 : 0);
