// ── A ready-made zoo used as the moving backdrop on the title screen ───────
import { Game } from './game';

/** Builds and fast-forwards a small zoo so the menu has something alive behind it. */
export function buildShowcase(): Game {
  const g = new Game('sandbox', 'taronga-new');
  g.rating = 900;                       // unlock everything for the display
  const x0 = 40, y0 = 52, x1 = 50, y1 = 60;

  g.buildWallRun(g.wallRun(x0, y0, 0, x1, y0), false, 'stone');
  g.buildWallRun(g.wallRun(x0, y1, 2, x1, y1), false, 'glass');
  g.buildWallRun(g.wallRun(x0, y0, 3, x0, y1), false, 'glass');
  g.buildWallRun(g.wallRun(x1, y0, 1, x1, y1), false, 'stone');
  g.buildWallRun([g.edgeRef(x0 + 3, y1, 2)], true, 'glass');

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (x < x0 + 3 && y > y0 + 3) g.paintTerrain(x, y, 'water');
      else if ((x + y) % 5 === 0) g.paintTerrain(x, y, 'dirt');
    }
  }

  g.buildScenery(x0 + 4, y0 + 1, 'tree');
  g.buildScenery(x0 + 7, y0 + 1, 'climb');
  g.buildScenery(x0 + 6, y0 + 3, 'logs');
  g.buildScenery(x0 + 2, y0 + 1, 'rock');
  g.buildScenery(x0 + 4, y0 + 4, 'shelter');
  g.buildScenery(x0 + 8, y0 + 5, 'puzzle');

  for (let y = g.entrance[1]; y <= y1 + 1; y++) g.buildPath(g.entrance[0], y);
  for (let x = Math.min(g.entrance[0], x0 - 1); x <= x1 + 1; x++) g.buildPath(x, y1 + 1);
  for (let y = y1 + 1; y >= y0 - 1; y--) g.buildPath(x0 - 1, y);

  g.buildShop(x0 + 1, y1 + 2, 'food');
  g.buildShop(x0 + 3, y1 + 2, 'drink');
  g.buildShop(x0 + 5, y1 + 2, 'toilet');
  g.buildScenery(x0 + 2, y1 + 2, 'bench');
  g.buildScenery(x0 + 4, y1 + 2, 'flowers');
  g.buildScenery(x0 + 6, y1 + 2, 'lamp');
  g.buildScenery(x0, y1 + 2, 'sign');

  const hab = g.tile(x0 + 5, y0 + 2).habitatId;
  for (const id of ['giraffe', 'zebra', 'elephant', 'tiger', 'gorilla', 'kangaroo', 'emu', 'penguin', 'meerkat']) {
    g.buyAnimal(id, hab);
  }
  g.hireStaff('keeper');
  g.hireStaff('caretaker');
  g.hireStaff('educator');
  g.admission = 6;
  g.cash = 500000;

  // run a while so the paths have a crowd on them before the player ever looks
  // the menu camera orbits this point, so tell it where the zoo ended up
  g.showcaseFocus = [(x0 + x1) / 2, (y0 + y1) / 2];
  g.speed = 3;
  for (let i = 0; i < 2600; i++) g.update(1 / 30);
  g.speed = 1;
  g.messages = [];
  return g;
}
