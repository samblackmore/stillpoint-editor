# Stillpoint — HTML port

A browser prototype of Stillpoint (the Unity puzzle game in
`escape-piggy-island`), for fast prototyping and playtesting: no Unity
build, just open the page. Same levels, same pathfinding, same turn flow.

Play it: GitHub Pages serves `index.html` from `main`.

## What's in here

- `index.html` — the game: level select, daily puzzle, random levels.
- `editor.html` — a basic level editor that exports the same JSON the game
  (and Unity) loads.
- `js/` — the port. No framework, no build step, plain ES modules:
  - `types.js` — object types (numeric values match Unity's
    `LevelObjectType`) and the per-character pathing rules.
  - `nav.js` — hex-grid Dijkstra search, a direct port of
    `Navigation.cs` (`Search`, `GetPathToMostAttractive`,
    `GetPathToNearest`).
  - `engine.js` — the turn loop, ported from `UnitController` +
    `GameStateController` + `ObjectivesBox`: tap to preview a wall,
    tap again to commit, characters advance one step, catch/edge checks,
    objectives, win/lose, rewind (via state snapshots).
  - `generator.js` — the random level generator, ported from
    `LevelFactory.TryGenerate`. One deliberate change: it runs on a
    seeded RNG, so a level is reproducible from its seed.
  - `render.js` — canvas hex renderer (flat-top hexes, odd-r layout).
  - `levels.js` — level JSON parsing (including the wrapped LevelMeta
    shape some files use).
- `levels/store/` — all 231 hand-made and AI level JSONs copied from the
  Unity repo, as-is. `levels/index.json` lists the curated, verified
  playable set shown in the menu.
- `generator-config.json` — the generator's ranges (width, wall seeds,
  enemy counts, …). Tune it without touching code.

## How to play

Tap a cell to preview a wall there — the piggy and every enemy show
where they'd go. Tap the same cell again to place the wall and take the
turn. Tap a wall to preview removing it. Undo rewinds a turn; Step
forward plays turns with no wall until the level ends.

- **Daily puzzle:** `index.html?daily` (or `?daily=2026-11-26`) — the
  seed is the date, so everyone gets the same level.
- **Random level:** `index.html?random&seed=1234` — share the seed to
  share the level.
- **Editor draft:** paint in `editor.html`, hit Playtest.

## What was ported faithfully

- Hex topology (both orientations), the Dijkstra flood with per-type
  costs, target priority (searching-list order, then distance), and the
  old-path preference that keeps paths stable across previews.
- Character rules exactly as in `Player.cs` / `Enemy.cs` /
  `BombEnemy.cs` / `PullEnemy.cs` / `NeutralDigger.cs` (searching,
  blocking, search distance, sleep range).
- The edge/attractor rule in `World.GetCellsInPath`.
- Objectives as in `ObjectivesBox.Refresh()`: pin-every-piggy
  ("ReachEdge" — it is about pins, not Edge cells), ReachOldTimer,
  survival turns, collect-at-least / no-more-than, build-exactly-N
  walls, collect-in-order.
- The generator's wall-seed clustering, rejection sampling, and
  separation rules.
- Level JSON is interchangeable with Unity: same grid format, same
  type numbers, same row order (row 0 = top).

## Deliberately simplified (first version)

- **No abilities**: Freeze, Pull, and the Bomb warmup/explosion aren't
  ported. Bombs are approximated — a player ending a turn next to one
  dies. PullEnemies and Freeze cells are inert.
- **No flood**: a character with no path simply stays put instead of
  spawning flood.
- **No fog**: the whole board is visible; sleeping enemies still wake
  when a player gets close.
- **Wall removal**: tapping a placed wall previews removing it, which the
  Unity game doesn't offer (there, a placed wall can only be undone with
  rewind). Kept here because it's handy for prototyping.
- **Board visuals match Unity**: level-colour blue background (#4f6d82),
  empty cells as faint white dots, walls as dark translucent hexes, pins as
  faint white rings, edge cells as red crosses, paths as a ribbon plus
  shrinking/fading circles in the character's colour, characters as plain
  solid circles in their prefab colours (player #ffc700, enemy #f57a81),
  diamonds in PastelGreen, safe zone as a white hex outline with a green
  diamond inside — all taken from Cell.prefab / Cell.cs / the prefabs.
  Paths are drawn to the same proportions: the ribbon is 1.1 wide with
  the 1.0 dots fitting inside it, characters are 1.5 across so the piggy
  is unmistakable, dots run faded (0.75 -> 0.3) so they read as "not in
  the world", and they stagger in one by one (80ms per dot for the
  player, instant for enemies) with the ribbon fading in over 0.3s
  after — the RevealPathLoop choreography from Unity, replayed on every
  path recompute. Preview mode (until GO) is Unity's too: the previewed
  wall flashes white (0.4s pulse), the background darkens 0.4 toward
  black, a white ghost-hex outline marks the previewed cell, and every
  empty cell gets a faint white hex outline.
  HUD is Unity-style too: objectives panel top-left, round undo/close
  buttons top-right, big GO button bottom-right to commit a previewed wall.
- **No tutorial speech, camera, or menus** — flat shapes, as intended.
- **Obstacle** is passable slow terrain here; in Unity it's an item a
  character can pick up.
- **Trap objectives** are shown but not evaluated, and
  **Zoom/Pan/PreviewTurn objectives** are ignored.

## Known-broken levels

- `tut_0_0_B` ("Collect the diamond") appears unwinnable under the
  ported rules — the piggy reaches a pin in two turns no matter what wall
  is placed first, and the diamond sits south of it, off every shortest
  path to a pin. It stays in `levels/store/` but out of the menu until
  the rule behind it is understood (it may be broken in Unity too).
- `tut_3_A` has no player at all (a pins-only board, likely a template).

## Tests

`npm test` (or `node --test test/`) runs headless checks: nav parity on
known boards, generator determinism per seed, every stored level loads,
and scripted playthroughs of the tutorial levels.
