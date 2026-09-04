// ── Guided first run ───────────────────────────────────────────────────────
// Each step watches the actual simulation rather than tracking clicks, so the
// player can do it any way they like and still be counted as having done it.
import { Game } from './game';

export interface Step {
  id: string;
  title: string;
  body: string;
  highlight?: string;      // id of a toolbar button to draw attention to
  manual?: boolean;        // advanced with the button rather than by doing something
  check?: (g: Game) => boolean;
  hint?: string;           // shown once the player has been on the step a while
}

export const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Taronga Tycoon',
    body: 'You have an empty block of land and $25,000. Have a look around first — '
        + '<b>drag</b> to pan, <b>scroll</b> to zoom, and <b>Q</b> / <b>E</b> spin the view. '
        + 'The wooden arch at the bottom is your front gate.',
    manual: true,
  },
  {
    id: 'path',
    title: 'Lay a path',
    body: 'Guests only walk on paths, so everything starts here. Pick the <b>🚶 Path</b> tool and '
        + '<b>drag</b> to extend the walkway leading up from the entrance arch.',
    highlight: 'tool-path',
    check: g => g.tiles.filter(t => t.path).length >= 16,
    hint: 'Hold the mouse down and drag across several tiles to lay a run at once.',
  },
  {
    id: 'barrier',
    title: 'Fence off a paddock',
    body: 'Choose <b>🚧 Barrier</b>. Click near the <i>edge</i> of a tile beside your path and '
        + '<b>drag along that edge</b> to lay a straight wall. Do that four times to box in an '
        + 'area — aim for something at least 5×5.',
    highlight: 'tool-fence',
    check: g => [...g.habitats.values()].some(h => h.tiles.length >= 9),
    hint: 'Barriers sit on the lines between tiles. Each drag lays one straight side, so a pen takes four.',
  },
  {
    id: 'gate',
    title: 'Put in a keeper gate',
    body: 'Your keepers need a way in. Take the <b>🚪 Gate</b> tool and click one segment of the '
        + 'wall you just built.',
    highlight: 'tool-gate',
    check: g => [...g.habitats.values()].some(h => h.hasGate && h.tiles.length >= 9),
    hint: 'Click directly on a piece of wall you have already built, not on empty ground.',
  },
  {
    id: 'animal',
    title: 'Move some animals in',
    body: 'Open <b>🦘 Animals</b>, pick <b>Red Kangaroo</b>, and click twice inside your paddock. '
        + 'Buy <b>two</b> — the game gives you a male and a female, so they can breed later.',
    highlight: 'tool-animal',
    check: g => g.animals.length >= 2,
    hint: 'Click inside the fenced area, not on the wall itself.',
  },
  {
    id: 'keeper',
    title: 'Hire a zookeeper',
    body: 'Animals need feeding. Open the <b>🧑‍🌾 Staff</b> window and hire a <b>Zookeeper</b> — they '
        + 'top up the food trough on their own from now on.',
    highlight: 'btn-staff',
    check: g => g.countStaff('keeper') >= 1,
  },
  {
    id: 'shop',
    title: 'Give guests somewhere to spend',
    body: 'Take <b>🏪 Shops</b> and put a <b>Bush Tucker Kiosk</b> on a tile touching your path. '
        + 'Admission alone will not pay the bills.',
    highlight: 'tool-shop',
    check: g => g.tiles.some(t => t.shop !== null),
    hint: 'A shop must be placed on bare ground next to a path — not on the path itself.',
  },
  {
    id: 'guests',
    title: 'Open the gates',
    body: 'That is a working zoo. Press <b>▶</b> and wait for your first visitors to walk up the path. '
        + 'They can only see animals from a path that runs alongside the barrier, so leave viewing lanes.',
    highlight: 'btn-play',
    check: g => g.guestsSinceStart >= 1,
    hint: 'Make sure your path actually connects back to the entrance arch.',
  },
  {
    id: 'done',
    title: "You're running a zoo",
    body: 'From here: check <b>🎯 Goals</b> for what the scenario wants, watch <b>🔔 Alerts</b> for '
        + 'anything going wrong, and click any animal to see exactly what its habitat is missing. '
        + 'Breed animals well enough and you can release them back into the wild.',
    manual: true,
  },
];
