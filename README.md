# Taronga Tycoon

An isometric zoo-building tycoon game — RollerCoaster Tycoon's chunky pixel look, Planet Zoo's
welfare-driven mechanics. Runs in the browser, no engine, no art assets: every sprite is drawn
procedurally to an offscreen canvas at load.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ — also opens straight from file://, just double-click dist/index.html
npm test         # headless simulation smoke test (24 checks)
```

## Saving

Three save slots, plus **Download this zoo as a file** / **Load a zoo from a file** so a zoo can
leave the browser entirely — slots live in `localStorage`, which clearing site data wipes and which
doesn't follow you to another machine. The game autosaves to Slot 1 every 90 seconds, and
**Continue** on the title screen picks up whichever slot was saved most recently.

## Modes

The game opens on a title screen with a live, simulated zoo drifting behind it. From there:

- **Continue** — reloads your saved zoo (greyed out until there is one).
- **Choose a Zoo** — pick a site, then **New Zoo** (empty ground, your own design) or
  **Build Existing** (rebuild the real zoo, species and all).
- **Sandbox** — pick a site and free-build: no deadline, every species unlocked, $250,000.
- **Guide me as I play** — a toggle rather than a separate mode, so the nine-step walkthrough runs
  on top of whichever game you start. Each step watches the actual simulation rather than tracking
  clicks, so you can do it any way you like; the relevant toolbar button glows, and a hint appears
  if you're stuck for twenty seconds. The setting is remembered.

## Playing

Build a **path** from the entrance, then wall off an area: with the fence tool, click near the tile
edge you want and **drag along it** to lay a straight run. Four drags makes a pen. Put a **🚪 gate**
in one segment (a habitat with no gate can't be stocked — keepers need a way in), then pick a species
with the 🦘 tool and click inside.

Barriers sit on tile *edges*, so they cost no habitat space and a path can run flush against them —
which is how you build viewing lanes.

Five barrier materials trade cost against **strength** (1–3), whether guests can **see through**, and
beauty. Every species needs a barrier rated for it, and a perimeter is only as strong as its weakest
segment — one hedge panel in a tiger enclosure and the tiger eventually gets out. Stone is
escape-proof but opaque, so guests see nothing behind it; glass is escape-proof *and* watchable, at a
price.

Scenery placed **inside** a habitat counts as enrichment and lifts animal welfare; the same item
**outside** counts as beauty and lifts your zoo rating. Climbing frames, feeder puzzles and hammocks
are worth far more to an animal than a bush.

Guests only see animals by walking a path that runs alongside the habitat fence, so leave viewing
lanes. Shops must touch a path. Hire keepers from the 🏞️ Zoo panel and they'll keep troughs filled
on their own; otherwise you're refilling by hand at $20 a go.

- Drag to pan, scroll to zoom, arrow keys/WASD also pan
- **Q / E rotate the view** through four isometric angles (or the ⟲ ⟳ buttons by the minimap)
- Space pauses; 1/2/3 set speed; Esc returns to the Inspect tool
- Drag with a build tool to paint a run of tiles
- Click the minimap to jump the camera there
- Zoo / Finance / Animals / Guests / Log open draggable windows; several can sit open at once
- Autosaves every 90 seconds to localStorage

## Two sites, four challenges

**Taronga Sydney** is a tight bushland headland — pale-trunked gums and sandstone outcrops running
down to a shoreline of pocket beaches and rock shelf, turquoise shallows deepening to open harbour,
ferries working across it, and the city on the far shore. It has two ways in: the **ferry wharf**, whose
gate stands at the seaward end of decking running back onto the headland, and the **road entrance** at the bottom
of the map, drawn as Taronga's 1916 heritage gatehouse — copper dome, terracotta hipped roofs, green
faience frieze and twin arched carriageways, with a paved forecourt in front of it. Guests arrive at either and leave by whichever is nearer, so a path
between the two is worth building. Dubbo has a single road gate.

The far side is built from the view you actually get from up there: a continuous CBD skyline that
steps up toward the middle with Sydney Tower set into it, the Opera House standing on its own flat quay right at
the waterline, the Harbour Bridge spanning a channel cut through the far shore so it crosses open
water rather than grass, a dense tree line along the foreshore, moored yachts, working
ferries (their runs are measured off the actual harbour at load, by finding the longest unbroken
stretch of open water on a handful of rows — a straight line between two water tiles would happily
cut the corner across the islet), and a wooded islet out in the middle of the harbour.

**The city is scenery, not real estate.** Every tile carries a buildable flag, and the far shore and
the harbour itself are set to zero — you can look at the bridge and the Opera House, and they are
hazed back so they read as distance, but nothing can be built there and no habitat can form across
the water. That also means the harbour can't be reclaimed: the water is part of the place. **Western Plains,
Dubbo** is many times larger: red earth, scattered pasture and dams, distant ranges and windmills on
the horizon.

Each site offers two challenges plus a sandbox:

- **Build from scratch** — empty ground, general objectives (rating, species, visitors, welfare,
  education, releases). Dubbo's version also asks for transport lines, because the site is big enough
  that guests need them.
- **Recreate it** — rebuild the real zoo: all ten of that site's signature species, properly housed,
  at the welfare standard the real zoo keeps. Taronga's roster is koalas, platypus, echidna, devils,
  penguins, sea lions, chimps, gorillas, tigers and red pandas; Dubbo's is lions, giraffes, zebras,
  elephants, meerkats, cassowaries, emus, kangaroos, dingoes and Komodo dragons. Dubbo also wants
  five paddocks of 40+ tiles, because open range is the point of the place.

Run past the deadline or below the bankruptcy line and it's over. Better species unlock as your
rating climbs, so an elephant is something you earn.

## Living animals

Animals have an age, a sex and a health score. A healthy, well-housed pair will breed, and juveniles
are drawn smaller until they mature. Neglect an animal and its health falls until it dies, which is
what finally gives the welfare score teeth — a vet on staff slows the decline.

## Education and conservation

An **Education Board** placed on a path near a habitat teaches passing guests about the species; a
**Talk Podium** staffed by an **Educator** runs keeper talks that lift everyone nearby. Animals
*born at your zoo* that reach adulthood in good health can be **released back into the wild**, which
earns conservation credits and rating. It's the objective that turns good husbandry into a win
condition rather than just a number.

## Staff

Four roles, hired from the **🧑‍🌾 Staff** window: **zookeepers** refill habitat troughs,
**caretakers** sweep litter, **vets** speed recovery for sick animals, and **educators** run keeper
talks from a podium. Everyone hired is an individual with a name — click them in the window or on the
map to see what they're doing right now and how many jobs they've completed.

The window also reports how stretched each role is: a keeper covers roughly three habitats and a
caretaker about ten messy tiles, so it tells you when to hire rather than leaving you to guess.

## Sound

Three background tracks (*Bushwalk*, *Canopy*, *Billabong*) cycle as you play, written on a
pentatonic scale over a tom-and-shaker groove. Animals call out in their own voice when they arrive
and occasionally afterwards; rides have their own engine noises; and the crowd wash, chatter and
laughter scale with how many visitors are actually in the park. The speaker button mutes everything,
the note button turns off just the music.

## Transport

Four guest rides — **Monorail**, **Cable Car**, **Zoo Train** and **Safari Trail**. Click to drop a
station beside a path, click again further along to run track to the next one; the line opens once it
has two stations and vehicles start shuttling. Riders pay a fare, arrive rested and happier, and the
Cable Car and Safari Trail also show them every habitat the route passes — which is how you get value
out of a big site where guests would otherwise never walk to the far corner.

Esc finishes a line, and picking a different vehicle starts a fresh one rather than extending the
last. Demolishing a station removes just that station and heals the route back together.

## How it works

| File | Role |
|------|------|
| `src/data.ts` | All tunable content: 22 species, 5 barrier materials, shops, scenery, prices. Add a species here and it appears in the UI, sprite generator and economy automatically. |
| `src/sprites.ts` | Procedural pixel art. Every sprite is pre-rendered once into a canvas cache at startup — nothing is drawn per frame. |
| Animal artwork | Eight body plans (`hopper`, `quadruped`, `ratite`, `sprawler`, `ape`, `pinniped`, `penguin`, `upright`) parameterised per species in `data.ts`, so silhouettes actually differ. A `quadruped` takes `legs`/`girth`/`head`/`snout`/`neck` fractions plus optional `pattern` (stripes, spots, patchwork, ringtail) and `feature` (mane, trunk, spikes, horns) — leggy and lean gives a dingo, squat gives a wombat, a tiny girth and a long neck gives a giraffe. Every sprite gets a 1px dark outline so it reads at any zoom. Sizes are hand-picked pixel dimensions rather than real-world scale: true scale makes a platypus a 7px smudge next to a 4m croc. |
| `src/game.ts` | Simulation: enclosure detection, welfare, guest/animal/keeper state machines, economy. No DOM dependency, which is what makes `npm test` possible. |
| `src/render.ts` | Isometric draw pass and the rotating camera. Ground first, then everything else sorted by depth for painter's order. |
| `src/ui.ts` | Toolbar, flyouts and the draggable windows — plain DOM over the canvas. |
| Build menus | Scenery is split three ways by `category` in `data.ts`: **enrichment** (inside a habitat, lifts welfare), **feeding** (deepens the trough via `foodCapacity`, so keepers visit less often), and **scenery** (zoo surrounds and guest amenities). |
| `src/showcase.ts` | Builds and fast-forwards the zoo that plays behind the title screen. |
| `src/tutorial.ts` | The nine guided steps, each with a `check(game)` predicate. |
| `src/sites.ts` | Ground generation per site, from stylised versions of the real places. Seeded two-octave value noise shapes the coastline and cuts gullies into the slope, then plants the site: gums, scrub, banksia and sandstone on the harbour headland, dead timber and tussock out west. Planting is decoration only — it never counts as enrichment — and is cleared wherever the player builds. A second pass measures each water tile's distance to land, which is what gives the shallows their colour. |
| `src/backdrop.ts` | The landmarks. These sit on real tiles at the far edge of the map rather than being painted as a screen-space band — a band gets completely covered by the map's own tiles the moment you look inland, whereas placing the bridge on the far shore means it stays across the water and turns correctly with the camera. |
| `src/icons.ts` | UI icons, drawn as rectangle lists on a 16×16 grid and rasterised once into data URLs. Emoji were replaced because they render differently on every platform and clash with the pixel art. Menu cards reuse the game's *own* sprites, so the animal on a species card is the animal you actually get. |
| `src/logo.ts` | The supplied logo sits on a white rectangle. Rather than key every white pixel — which would hole the lettering — it flood-fills inward from the border and clears only white connected to the edge. |
| `src/sound.ts` | All audio is synthesised at runtime from oscillators and noise buffers — no binary assets, including the music. Three chiptune tracks run on a look-ahead step sequencer (`setInterval` alone is far too jittery for music, so notes due in the next 200 ms are queued against the audio clock). Animal calls are grouped into voices — roar, trumpet, hoot, growl, boom, chirp, bray, bark, howl, screech, splash — and species map onto one, so a new species inherits a sensible voice. Music and effects run on separate gain buses so they can be muted independently. |

**Guest routing** is a multi-source breadth-first search: every gate seeds the queue at distance
zero, so `pathDist` holds the number of steps to the *nearest* exit rather than to one fixed gate.
A guest deciding to leave just walks downhill on that number, which routes them out the closer way
without any per-guest pathfinding.

**Enclosure detection** is the interesting bit. Rather than tracking walls as edges, a fence occupies
a whole tile, and every frame a build happens the game flood-fills inward from the map border across
non-fence tiles. Anything the flood can't reach is enclosed, and each unreached region becomes a
habitat. Open a hole in a wall and the region merges back with the outside, which is exactly when
animals should escape — so escape detection falls out of the same pass for free.

**Barriers live on tile edges**, not on tiles — the Planet Zoo model. Each edge is stored exactly
once, in `wallH` (horizontal edges, keyed by the tile below) and `wallV` (vertical edges, keyed by
the tile to the right), each with one extra row/column so the map's outer edges have somewhere to
live. `edgeRef(x, y, dir)` converts a (tile, side) pair into that canonical slot, which keeps the
rest of the code free to think in terms of "the north side of this tile".

Drawing them is the fiddly part. A wall's side is stored in world space and mapped to a screen edge
only at draw time via `(dir + rot) % 4`, so four sprites cover all four camera angles. Depth is the
midpoint of the edge in view space — 0.5 past the tile corner for the two back edges, 1.5 for the two
front ones — which puts a wall correctly behind or in front of whatever is standing on the tile.
Entities standing exactly on a boundary can still sort a pixel or two wrong; that's inherent to
depth-sorting an isometric scene with a single scalar, and it isn't visible in practice.

**View rotation** is done in coordinate space, not by redrawing art. A rotation maps world tile
coords onto "view" coords, and the iso projection, depth sort and sprite facing all work in view
space — so one set of sprites covers all four angles. `panByScreen` inverts the same transform, which
is what keeps dragging and the arrow keys feeling identical whichever way the map is turned.

**Welfare** is a weighted score per animal: space (25%), terrain match (25%), food (25%), group size
(15%) and enrichment (10%). Terrain match compares the habitat's actual mix against the species'
preferred weights, so a croc in a dry paddock scores badly even with plenty of room. Welfare feeds
habitat appeal, which feeds guest happiness, which feeds the zoo rating, which drives how many
guests turn up. That's the whole economic loop.

## Development notes

`sprites-preview.html` (dev server only, at `/sprites-preview.html`) draws every animal at 3× with a
guest beside them for scale — the fastest way to check artwork changes. It isn't part of the build.

`npm run demo` builds and writes `dist/demo.html`, which spins up a populated zoo and fast-forwards
a few game-months — useful for eyeballing rendering changes without playing to that point. It's a QA
harness, not part of the shipped game. The game object is on `window.__tt` in the console.
