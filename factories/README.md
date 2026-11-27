# Factories

A factory is a named preset of level-generator settings — one per campaign
chapter, derived from the measured stats of that chapter's hand-made
levels (Unity repo, branch `offline-campaigns`, `StoryModeChapterDefinitions`
in MainGame.unity; analysis 2026-11-27). This is the campaign's original
design coming back: fixed chapter definitions that levels are generated
from, instead of a fixed level list.

## Layout

- `index.json` — the factories in campaign order: 15 story chapters, then
  the 5 AI chapters.
- `<id>.json` — one factory per chapter:
  `id`, `name`, `chapter` (inspector name), `theme`, `color` (curated
  chapter colour), `sourceLevels` (the hand-made levels it was measured
  from), `generatable` (false only for The End), `gaps` (what the chapter
  needs that the generator/port can't express yet), `notes`, and
  `settings`.

## Settings shape

`settings` is exactly the `generator-config.json` shape, so it drops
straight into the generator:

```js
import { generateLevel } from '../js/generator.js';
const factory = await (await fetch('factories/stage-7-enemy.json')).json();
const { level } = generateLevel('some-seed', factory.settings);
```

Ranges are the chapter's observed min–max. `mustCollectAtLeast` is only
set where the chapter's levels actually require collecting that many.

## Things the analysis turned up

- **Waypoints are endpoints.** Code 7 (waypoint) appears in 0 cells across
  all 231 Unity level files — the waypoint experience is delivered by
  endpoint cells (code 5). Factories emit endpoints, never code-7 cells.
- **Edge flags add a border.** Each `edge*` flag adds one row/column to
  the grid, so a factory's width/height are the *inner* grid. The Edge
  factory is 6–7 × 8–9 inside, 8–9 × 10–11 finished.
- **Friends' first three levels are kitchen-sink debug levels** (all ten
  objectives at once). The Friends factory follows the clean levels.
- **Gaps** (objectives the port doesn't have yet): `BuildWallsNoMoreThan`
  (Caverns), `TrapObjectives` (Enemy, Mix), `CollectOrderIsOwner`
  (Friends, Owners), survival bonus turns, `ReachOldTimer`, fog /
  `disableFinishFlag` (The End — not generatable).
- **144 of 231 level files are in no chapter** (cut/older levels); the 87
  chapter levels are the canon set the factories were measured from.
- The dead 9-chapter generated ladder in the scene (`1_ply` →
  `1_ply_attract_2`) is the closest thing to ready-made chapter factories
  in the Unity repo — a plain → collect → ordered → attract progression
  that was never named or wired up.

## Editing

The JSON files are the source of truth — edit them directly. To check a
change, generate a few levels from the factory and confirm the sizes and
counts land in range (the 2026-11-27 check ran 5 seeds per factory).

### Editing in the browser

The Random level card on the menu has a factory picker (Default + all 20
factories + any custom ones) and an "edit it" toggle that opens a form
for the factory's settings: size, wall seeds/density, players, enemies,
endpoints/lures/diamonds (with must-collect), survival turns, order
objective, edge border.

- **Save factory** stores the edited settings in localStorage (an
  override keyed by factory id) — every level generated from that
  factory from then on uses your settings, and the picker marks it
  "(edited)". **Reset to shipped** clears the override.
- **Save as new…** copies the factory into "My factories" under a name
  you choose. Custom factories are stored whole in localStorage; Reset
  on one deletes it.
- **Download JSON** downloads the factory doc (metadata + settings).
  Commit the file to `factories/` to ship it — the browser can't write
  to the repo itself.

Generating with a factory puts it in the URL (`?random&seed=…&factory=<id>`),
so a generated level is shareable along with the factory that made it.
Custom factories in a shared link only work on a browser that has that
custom factory saved.
