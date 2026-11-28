// Headless tests for the Stillpoint HTML port.
// Run: node --test test/  (or npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Nav, ORIENTATION } from '../js/nav.js';
import { T } from '../js/types.js';
import { Game, MOVE_MS, MOVE_SNAP_MS } from '../js/engine.js';
import { Renderer, previewOverlayAlpha } from '../js/render.js';
import { parseLevel } from '../js/levels.js';
import { generateLevel, dailySeed, DEFAULT_CONFIG } from '../js/generator.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';

// The hand-made campaign levels used to live in levels/store/; the repo
// no longer ships them (Nov 27 — it focuses on daily, random,
// factories and editor), so the few levels the tests still need are
// inlined here, copied from the Unity JSONs they came from.
const TUT_0_0 = {
  grid: ['18 18 18', '0 0 0', '0 0 0', '0 0 0', '0 3 0', '0 0 0'],
  objectives: {}, disableStepForward: true, hidePathOnStart: true,
};
const TUT_0_0_1 = {
  grid: ['18 18 18 18', '0 0 0 0', '0 0 0 0', '0 0 1 0', '0 0 0 0', '0 0 0 0', '0 0 3 0'],
  objectives: { BuildWallsNoMoreThan: 3, ReachEdge: true },
};
const TUT_0_0_B = {
  grid: ['18 18 18 18', '0 0 0 0', '0 0 0 3', '0 0 0 0', '0 13 0 0', '0 0 0 0'],
  objectives: { CollectItemObjectives: [{ ItemType: 13, CollectAtLeast: 1 }], ReachEdge: true },
};
const AI_1_4 = {
  grid: ['0 18 0', '0 0 0', '0 0 0', '3 0 0'],
  objectives: { ReachEdge: true },
};
const AI_1_5 = {
  grid: ['18 18 18 18 18', '0 0 0 0 0', '0 13 0 13 0', '0 0 0 0 0', '0 0 3 0 0'],
  objectives: { CollectItemObjectives: [{ ItemType: 13, CollectAtLeast: 2 }], ReachEdge: true },
};
// The five survival-only boards (edge-ringed, no pins).
const SURVIVAL_OBJECTIVES = { SurvivalTurnCount: 5, CollectItemObjectives: [], ZoomObjectives: [] };
const SURVIVAL_LEVELS = [
  { name: 'level0', grid: ['14 14 14 14 14 14 14 14 14', '14 0 1 0 0 0 1 0 14', '14 0 1 1 0 0 0 1 14', '14 0 0 0 0 1 1 0 14', '14 1 0 1 0 0 0 0 14', '14 0 0 1 3 1 0 1 14', '14 0 0 0 0 0 0 1 14', '14 1 1 0 0 0 0 0 14', '14 0 0 0 0 0 0 1 14', '14 14 14 14 14 14 14 14 14'] },
  { name: 'level1', grid: ['14 14 14 14 14 14 14 14 14', '14 0 1 1 0 0 0 0 14', '14 0 1 1 0 0 0 0 14', '14 1 0 0 0 0 0 0 14', '14 1 0 0 0 3 0 1 14', '14 1 0 1 0 0 1 0 14', '14 0 0 0 0 0 0 1 14', '14 0 0 0 1 1 1 0 14', '14 0 0 0 0 0 0 1 14', '14 1 0 0 1 0 0 0 14', '14 14 14 14 14 14 14 14 14'] },
  { name: 'level3', grid: ['14 14 14 14 14 14 14 14 14', '14 0 0 0 0 1 0 1 14', '14 0 0 1 0 0 0 0 14', '14 0 0 0 1 0 0 0 14', '14 1 1 1 0 0 0 0 14', '14 0 1 1 3 1 0 0 14', '14 0 0 1 0 0 0 0 14', '14 0 0 0 0 0 0 0 14', '14 0 0 1 0 0 0 0 14', '14 14 14 14 14 14 14 14 14'] },
  { name: 'level5', grid: ['14 14 14 14 14 14 14 14 14', '14 1 0 0 1 0 1 0 14', '14 0 0 0 1 0 1 0 14', '14 0 0 1 1 1 1 0 14', '14 0 1 0 0 0 0 0 14', '14 1 0 3 0 0 0 0 14', '14 1 0 0 0 0 0 0 14', '14 1 0 0 0 1 1 0 14', '14 1 0 1 0 0 1 1 14', '14 14 14 14 14 14 14 14 14'] },
  { name: 'break_tut', grid: ['14 14 14 14 14 14 14 14 14', '14 0 0 1 0 1 0 0 14', '14 0 1 1 1 1 1 0 14', '14 0 1 1 13 1 1 0 14', '14 1 1 1 0 1 1 0 14', '14 1 3 0 0 0 0 0 14', '14 0 1 1 0 0 0 0 14', '14 0 1 1 1 0 0 0 14', '14 0 0 0 0 0 0 0 14', '14 0 0 0 0 0 0 0 14', '14 14 14 14 14 14 14 14 14'] },
];

// ---------- nav ----------

test('hex neighbours match the Unity topology (horizontal)', () => {
  const nav = new Nav(3, 3, ORIENTATION.HORIZONTAL, () => []);
  // Flood distance is a Dijkstra cost limit, and Unity's Search adds the
  // neighbours of every expanded cell to the flooded list before the
  // pop-check breaks — so a distance-1 flood also contains the boundary
  // ring at distance 2. Assert on distances, not on the flooded list.
  const res = nav.search([], {}, 0, 0, 1, false);
  assert.equal(res.dist[0][0], 0);
  assert.equal(res.dist[1][0], 1);
  assert.equal(res.dist[0][1], 1);
  assert.equal(res.dist[1][1], 2);
  // Centre cell has all six neighbours at distance 1.
  const centre = nav.search([], {}, 1, 1, 1, false);
  const at1 = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (centre.dist[r][c] === 1) at1.push([r, c]);
    }
  }
  assert.equal(at1.length, 6);
});

test('Dijkstra finds the shortest path on an empty board', () => {
  const typesAt = (r, c) => (r === 0 && c === 2 ? [T.PIN] : []);
  const nav = new Nav(5, 5, ORIENTATION.HORIZONTAL, typesAt);
  const res = nav.pathToMostAttractive([T.PIN], {}, 4, 2, 999);
  assert.equal(res.target.type, T.PIN);
  assert.equal(res.path.length, 4);
  assert.deepEqual(res.path[0], { row: 3, col: 2 });
  assert.deepEqual(res.path[3], { row: 0, col: 2 });
});

test('walls block, and a detour is found around them', () => {
  const typesAt = (r, c) => {
    if (r === 0 && c === 2) return [T.PIN];
    if (r === 2 && c === 2) return [T.WALL];
    return [];
  };
  const nav = new Nav(5, 5, ORIENTATION.HORIZONTAL, typesAt);
  const res = nav.pathToMostAttractive([T.PIN], { [T.WALL]: -1 }, 4, 2, 999);
  // Hex detour around one cell costs the same as the straight line — the
  // point is the path goes around the wall, not through it.
  assert.equal(res.path.length, 4);
  assert.ok(!res.path.some((p) => p.row === 2 && p.col === 2));
  assert.deepEqual(res.path[res.path.length - 1], { row: 0, col: 2 });

  // A full wall row with one gap forces a genuinely longer path.
  const typesAt2 = (r, c) => {
    if (r === 0 && c === 2) return [T.PIN];
    if (r === 2 && c !== 4) return [T.WALL];
    return [];
  };
  const nav2 = new Nav(5, 5, ORIENTATION.HORIZONTAL, typesAt2);
  const res2 = nav2.pathToMostAttractive([T.PIN], { [T.WALL]: -1 }, 4, 2, 999);
  assert.ok(res2.path.length > 4);
  assert.ok(res2.path.some((p) => p.row === 2 && p.col === 4));
});

// ---------- generator ----------

test('generator is deterministic per seed', () => {
  const a = generateLevel('2026-11-26');
  const b = generateLevel('2026-11-26');
  assert.deepEqual(a.level, b.level);
  const c = generateLevel('2026-11-27');
  assert.notDeepEqual(a.level, c.level);
});

test('daily seed is a date string', () => {
  assert.match(dailySeed(new Date(2026, 10, 26)), /^\d{4}-\d{2}-\d{2}$/);
});

test('generated levels always load and have a player', () => {
  for (let i = 0; i < 20; i++) {
    const { level } = generateLevel(`test-${i}`);
    const game = new Game().loadLevel(parseLevel(level));
    assert.equal(game.players().length, 1);
    assert.equal(game.status, 'playing');
  }
});

test('generated levels have a pin row and a reach-the-safe-zone ending', () => {
  // Every hand-made level ends on a row of pin rings along the bottom
  // edge (JSON row 0), with ReachEdge sitting alongside the collect
  // objectives — generated levels were missing both, so the piggy had
  // nowhere to pin and the level just ended on the last collect.
  for (let i = 0; i < 20; i++) {
    const { level } = generateLevel(`pins-${i}`);
    assert.ok(level.grid[0].every((t) => t === T.PIN), `seed pins-${i}: bottom row is pins`);
    assert.equal(level.objectives.ReachEdge, true);
  }
});

test('generated survival levels are ringed with edge, enemy pins at the bottom', () => {
  // Unity's five survival-only levels have no pins at all and are ringed
  // with edge cells — but the ObjectivesBox flips a level's pins into
  // enemy pins while a survival timer runs, and Sam (Nov 28) wants the
  // survival factories to use that: enemy pins along the bottom edge
  // only, the other three sides edge. The piggy beelines for the pins
  // and the player walls it off to survive N turns, then walks it onto
  // a (now safe) pin — so survival levels end by reaching the safe zone.
  const cfg = {
    ...DEFAULT_CONFIG,
    survivalTurnCount: { min: 7, max: 7 },
    endPoints: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
    collectables: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
    lures: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
  };
  const { level } = generateLevel('surv-pins', cfg);
  assert.ok(!level.grid.flat().includes(T.PIN), 'no safe pins anywhere');
  assert.ok(level.grid[0].every((t) => t === T.ENEMY_PIN), 'bottom row is enemy pins');
  assert.ok(level.grid[level.grid.length - 1].every((t) => t === T.EDGE), 'top row is edge');
  assert.equal(level.objectives.ReachEdge, true);
  assert.equal(level.objectives.SurvivalTurnCount, 7);
});

test('generated levels carry their factory colour', () => {
  const { level } = generateLevel('colour-test', DEFAULT_CONFIG, '#6F70AC');
  assert.equal(level.color, '#6F70AC');
  // Without a factory, Unity's random chapter colour fills in (v39) —
  // never null. (The HSV ranges are asserted in the v39 test below.)
  assert.match(generateLevel('colour-test-2').level.color, /^#[0-9a-f]{6}$/);
});

test('generated levels load and play', () => {
  for (const seed of ['load-1', 'load-2', 'load-3']) {
    const res = generateLevel(seed, DEFAULT_CONFIG, null);
    assert.ok(res, `seed ${seed} should generate`);
    const game = new Game().loadLevel(res.level);
    assert.ok(game.players().length >= 1, `seed ${seed}: no player`);
    assert.equal(game.status, 'playing');
  }
});

test('diggers and bombs never spawn, even when the config asks for them', () => {
  // Diggers and bombs are disabled in generateLevel (Sam, Nov 27);
  // a config that asks for several of each must still produce none.
  const cfg = { ...DEFAULT_CONFIG,
    diggerCount: { min: 2, max: 2 },
    bombEnemyCount: { min: 2, max: 2 },
    bombEnemy6Count: { min: 1, max: 1 },
    bombEnemy9Count: { min: 1, max: 1 },
  };
  for (const seed of ['no-dig-1', 'no-dig-2', 'no-dig-3']) {
    const res = generateLevel(seed, cfg, null);
    assert.ok(res, `seed ${seed} should generate`);
    const game = new Game().loadLevel(res.level);
    assert.ok(!game.chars.some((c) => c.kind === 'digger' || c.kind === 'bomb'),
      `seed ${seed}: no diggers or bombs`);
  }
});

// ---------- scripted playthroughs ----------

// Depth-first solver over wall placements + step-forward. Walls on the
// player's current path are tried first (they force reroutes), then
// step-forward, then other walls. Returns true when the level is winnable.
function solve(game, { maxDepth = 10, maxNodes = 300000 } = {}) {
  const start = game.snapshot();
  let nodes = 0;
  const seen = new Set();

  function keyOf() {
    return game.terrain.map((r) => r.join('')).join('|') + '#' +
      game.chars.map((c) => `${c.row},${c.col},${c.alive ? 1 : 0},${c.finished ? 1 : 0}`).join(';') + '#' +
      game.turn + '#' + JSON.stringify(game.collected) + '#' + game.collectOrderIndex;
  }

  function dfs(depth) {
    if (game.status === 'won') return true;
    if (game.status === 'lost' || depth >= maxDepth) return false;
    if (++nodes > maxNodes) return false;
    const k = keyOf();
    if (seen.has(k)) return false;
    seen.add(k);
    const snap = game.snapshot();
    const player = game.players()[0];
    const onPath = new Set((player?.path || []).map((p) => `${p.row},${p.col}`));
    const scored = [];
    for (let r = 0; r < game.height; r++) {
      for (let c = 0; c < game.width; c++) {
        if (!game.canBuildAt(r, c)) continue;
        game.restore(snap);
        game.preview(r, c);
        const p2 = game.players()[0];
        const path = game.previewState.paths.get(p2.id) || [];
        const itemBonus = path.some((p) => game.items.has(`${p.row},${p.col}`)) ? 100 : 0;
        const onPathBonus = onPath.has(`${r},${c}`) ? 50 : 0;
        scored.push({ cell: [r, c], score: path.length + itemBonus + onPathBonus });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const actions = [...scored.map((s) => s.cell), null];
    for (const a of actions) {
      game.restore(snap);
      if (a) {
        game.preview(a[0], a[1]);
        game.commit();
      } else {
        game.stepForward();
      }
      if (game.status === 'lost') continue;
      if (dfs(depth + 1)) return true;
    }
    return false;
  }

  game.restore(start);
  return dfs(0);
}

test('levels with no objectives default to reach-the-safe-zone', () => {
  // Unity's tutorial controller adds an edge objective to levels whose JSON
  // carries none; without the default, "all objectives complete" is true
  // of an empty list and the level is won after a single turn.
  const def = parseLevel({ grid: ['18 0', '0 3'], objectives: {} });
  assert.equal(def.objectives.ReachEdge, true);
  const game = new Game().loadLevel(def);
  game.preview(0, 1);
  game.commit();
  assert.equal(game.status, 'playing');
});

test('tutorial: first steps is won by walking to the pin', () => {
  const game = new Game().loadLevel(parseLevel(TUT_0_0));
  // Step-forward is disabled in this tutorial level, so every turn places
  // a wall somewhere harmless while the piggy walks to the pin.
  let guard = 0;
  while (game.status === 'playing' && guard++ < 10) {
    const player = game.players()[0];
    const onPath = new Set(player.path.map((p) => `${p.row},${p.col}`));
    let placed = false;
    for (let r = 0; r < game.height && !placed; r++) {
      for (let c = 0; c < game.width && !placed; c++) {
        if (game.canBuildAt(r, c) && !onPath.has(`${r},${c}`)) {
          game.preview(r, c);
          game.commit();
          placed = true;
        }
      }
    }
    if (!placed) game.stepForward();
  }
  assert.equal(game.status, 'won');
});

test('tutorial: build sparingly needs exactly three walls and a pin', () => {
  const game = new Game().loadLevel(parseLevel(TUT_0_0_1));
  assert.equal(solve(game, { maxDepth: 10 }), true);
});

test('tutorial: collect the diamond, then pin', () => {
  // tut_0_0_B appears unwinnable under the ported rules (and, by the same
  // rules, in Unity): the piggy reaches a pin in two turns no matter what
  // wall is placed first, and the diamond sits south of it, off every
  // shortest path to a pin. Kept as an inline fixture until the rule
  // behind it is understood.
  const game = new Game().loadLevel(parseLevel(TUT_0_0_B));
  assert.equal(solve(game, { maxDepth: 10 }), false);
});

test('survival levels are winnable', () => {
  for (const { name, grid } of SURVIVAL_LEVELS) {
    const game = new Game().loadLevel(parseLevel({ grid, objectives: SURVIVAL_OBJECTIVES }));
    assert.equal(solve(game, { maxDepth: 8 }), true, `${name} should be winnable`);
  }
});

test('rewind restores the previous state', () => {
  const game = new Game().loadLevel(parseLevel({ grid: SURVIVAL_LEVELS[0].grid, objectives: SURVIVAL_OBJECTIVES }));
  const before = game.snapshot();
  // Build any wall, then rewind.
  outer: for (let r = 0; r < game.height; r++) {
    for (let c = 0; c < game.width; c++) {
      if (game.canBuildAt(r, c)) {
        game.preview(r, c);
        game.commit();
        break outer;
      }
    }
  }
  assert.equal(game.turn, 1);
  assert.equal(game.rewind(), true);
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.turn, 0);
});

// ---------- finish flag (v32) ----------

// The app's flag loop, minus the 100ms timer: take no-animation turns
// until the game ends, a waypoint is collected, a pin is reached, or
// 100 turns pass (Unity's CommitTurnsUntilWinOrLose). `force` mirrors
// the app: the flag works even where step-forward is disabled.
function runFlag(game) {
  let turns = 0;
  while (game.status === 'playing' && turns < 100) {
    if (!game.stepForward({ animate: false, force: true })) break;
    turns++;
    if (game.turnEvents.endpoint || game.turnEvents.pin) break;
  }
  return turns;
}

test('no-animation turns jump with no move plan', () => {
  const game = new Game().loadLevel(parseLevel(AI_1_4));
  const next = game.players()[0].path[0];
  assert.equal(game.stepForward({ animate: false }), true);
  assert.equal(game.movePlan.length, 0);
  assert.equal(game.movesAnimating(), false);
  const p = game.players()[0];
  assert.deepEqual([p.row, p.col], [next.row, next.col]);
});

test('turnEvents records an endpoint pickup, then a pin finish', () => {
  // 3x3: pin row at the bottom, an endpoint one cell above the piggy.
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  assert.equal(game.players()[0].path.length, 1);
  game.stepForward({ animate: false });
  assert.equal(game.turnEvents.endpoint, true);
  assert.equal(game.turnEvents.pin, false);
  assert.equal(game.status, 'playing');
  game.stepForward({ animate: false });
  assert.equal(game.turnEvents.pin, true);
  assert.equal(game.status, 'won');
});

test('the flag loop stops at a waypoint', () => {
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  // One turn: the piggy collects the endpoint and the flag stops there,
  // before walking on to the pin.
  assert.equal(runFlag(game), 1);
  assert.equal(game.status, 'playing');
  assert.equal(game.turnEvents.endpoint, true);
});

test('the flag loop stops at a pin and wins', () => {
  const game = new Game().loadLevel(parseLevel(AI_1_4));
  assert.equal(runFlag(game), 3);
  assert.equal(game.status, 'won');
  assert.equal(game.turnEvents.pin, true);
});

test('the flag works where step-forward is disabled', () => {
  // tut_0_0 disables the step button, but Unity's flag calls
  // CommitTurn directly — the piggy walks to the pin in 4 turns and
  // wins, instead of the flag spinning 100 turns doing nothing.
  const game = new Game().loadLevel(parseLevel(TUT_0_0));
  assert.equal(game.stepForward({ animate: false }), false);
  assert.equal(runFlag(game), 4);
  assert.equal(game.status, 'won');
});

// ---------- default camera zoom (v34) ----------

// layout() needs a canvas and window.devicePixelRatio; stub both.
function stubRenderer() {
  globalThis.window = { devicePixelRatio: 1 };
  const canvas = { getContext: () => ({ setTransform() {} }), style: {} };
  return new Renderer(canvas);
}

function contentWidth(renderer, cols) {
  const s = renderer.size;
  return 2 * s * (cols - 1) + 2 * s + s;
}

test('portrait: a 5-wide level looks small (8-cell default zoom)', () => {
  const renderer = stubRenderer();
  const game = new Game().loadLevel(parseLevel(AI_1_5)); // 5x5
  renderer.layout(game, 390, 700);
  // The 8-cell reference width is 578px at the base size, so the scale
  // is 390/578 and the 5-wide content is ~65% of the screen, centred.
  assert.ok(Math.abs(contentWidth(renderer, 5) / 390 - 0.65) < 0.02);
  assert.ok(renderer.size < 34);
  // Centred: the left margin equals the right margin.
  const left = renderer.originX - renderer.size;
  assert.ok(Math.abs(left - (390 - contentWidth(renderer, 5) - left)) < 1);
});

test('portrait: a 9-wide level still fills the screen', () => {
  const renderer = stubRenderer();
  const game = new Game().loadLevel(parseLevel({ grid: SURVIVAL_LEVELS[0].grid, objectives: SURVIVAL_OBJECTIVES })); // 9x10
  renderer.layout(game, 390, 700);
  assert.ok(Math.abs(contentWidth(renderer, 9) / 390 - 1) < 0.02);
});

test('landscape: the old fit behaviour is unchanged', () => {
  const renderer = stubRenderer();
  const game = new Game().loadLevel(parseLevel(AI_1_5)); // 5x5
  renderer.layout(game, 800, 400);
  // No 8-cell reference in landscape: the 1.4x cap binds, as before.
  assert.ok(Math.abs(renderer.size - 34 * 1.4) < 0.01);
});

// ---------- preview overlay flood fade (v35) ----------

test('overlay alpha keeps 0.15 up close and fades to 0 at distance 6', () => {
  assert.equal(previewOverlayAlpha(0), 0.15);
  assert.equal(previewOverlayAlpha(1), 0.15);
  assert.ok(Math.abs(previewOverlayAlpha(3) - 0.09) < 1e-9); // 0.15 * (1 - 2/5)
  assert.equal(previewOverlayAlpha(6), 0);
  assert.ok(previewOverlayAlpha(7) < 0); // beyond the fade: skipped by the renderer
});

test('flood distance detours around walls (not as the crow flies)', () => {
  // 4x4, a wall column at col 1 rows 0-2 with a gap at (3,1).
  const nav = new Nav(4, 4, ORIENTATION.HORIZONTAL, (r, c) => (c === 1 && r < 3 ? [T.WALL] : []));
  const flooded = nav.flood([], { [T.WALL]: -1 }, 0, 0, 9);
  const dist = new Map(flooded.map((f) => [`${f.row},${f.col}`, f.distance]));
  assert.equal(dist.get('0,3'), 7); // around the gap, not the 3-step crow-flies route
  assert.equal(nav.distance(0, 0, 0, 3), 3);
  assert.equal(dist.get('1,1'), undefined); // walls are never flooded
  assert.equal(dist.get('3,1'), 4); // the gap itself is reachable
});

// ---------- slide snap (v36) ----------

test('input comes back when the slide snaps at 98%, not at the full second', () => {
  // 3x3: pin row at the bottom, an endpoint one cell above the piggy.
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  game.stepForward(); // animated: the piggy slides onto the endpoint
  const t0 = game.movePlanAt;
  assert.equal(game.movePlan.length, 1);
  assert.equal(game.movesAnimating(t0 + MOVE_SNAP_MS - 1), true);
  assert.equal(game.movesAnimating(t0 + MOVE_SNAP_MS), false);
  assert.equal(game.movesAnimating(t0 + MOVE_MS), false);
  // The endpoint explosion starts when the slide lands (the snap),
  // not at the full second.
  assert.equal(game.pickupFx.length, 1);
  assert.equal(game.pickupFx[0].at, t0 + MOVE_SNAP_MS);
});

test('a sliding character snaps exactly onto its destination at 98%', () => {
  const renderer = stubRenderer();
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  renderer.layout(game, 390, 700);
  game.stepForward();
  const ch = game.players()[0];
  const t0 = game.movePlanAt;
  const destX = renderer.cellCenterX(ch.row, ch.col);
  const destY = renderer.cellCenterY(ch.row);
  const atSnap = renderer.charPos(game, ch, t0 + MOVE_SNAP_MS);
  assert.ok(Math.abs(atSnap.x - destX) < 1e-9 && Math.abs(atSnap.y - destY) < 1e-9);
  const mid = renderer.charPos(game, ch, t0 + 300);
  assert.ok(Math.hypot(mid.x - destX, mid.y - destY) > 1); // still gliding at 300ms
  assert.equal(renderer.isSliding(game, ch, t0 + MOVE_SNAP_MS - 1), true);
  assert.equal(renderer.isSliding(game, ch, t0 + MOVE_SNAP_MS), false);
});

// ---------- pin routing (v36) ----------

test('a player does not route to a lure along the pin row', () => {
  // 5x4: pin row along the bottom; the only route from the piggy (2,4)
  // to the lure (3,0) runs along the pin row — Unity's Search blocks
  // pin-to-pin steps, so the piggy must not take it.
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18 18 18', '0 1 1 1 0', '0 0 0 1 3', '6 0 0 1 0'],
    objectives: {},
  }));
  const p = game.players()[0];
  assert.equal(p.target.type, T.PIN);
  assert.deepEqual(p.path.map((s) => [s.row, s.col]), [[1, 4], [0, 4]]);
  // The path ends ON a pin (ReachEdge) — it never passes THROUGH one
  // to reach something else.
  const through = p.path.slice(0, -1);
  assert.ok(!through.some((s) => game.terrain[s.row][s.col] === T.PIN));
});

// ---------- path point stays until arrival (v37) ----------

test('the path point stays drawn until the character reaches it', () => {
  const renderer = stubRenderer();
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  renderer.layout(game, 390, 700);
  const ch = game.players()[0];
  // Before the step the path runs to the endpoint only — the piggy
  // re-paths to the pin after collecting it.
  assert.deepEqual(renderer.drawPathFor(game, ch, Date.now()).map((s) => [s.row, s.col]), [[1, 1]]);
  game.stepForward(); // animated: the piggy slides onto the endpoint
  const t0 = game.movePlanAt;
  // The engine consumed the endpoint point and re-pathed to the pin,
  // but while the slide runs the drawn path still starts with it.
  assert.deepEqual(ch.path.map((s) => [s.row, s.col]), [[0, 1]]);
  assert.deepEqual(renderer.drawPathFor(game, ch, t0 + 300).map((s) => [s.row, s.col]), [[1, 1], [0, 1]]);
  // Once the slide snaps, the point is gone — the piggy has arrived.
  assert.deepEqual(renderer.drawPathFor(game, ch, t0 + MOVE_SNAP_MS).map((s) => [s.row, s.col]), [[0, 1]]);
});

// ---------- objective text (v37) ----------

test('the edge objective reads like Unity: reach the safe zone', () => {
  // Unity's ObjectivesBox text for ReachEdge is "reach safe zone" —
  // the pins are the safe zone, and the win screen calls the players
  // "Drifters safe". Not "pin every piggy".
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 5 0', '0 3 0'],
    objectives: {},
  }));
  const edge = game.objectiveList().find((o) => o.id === 'edge');
  assert.equal(edge.label, 'Reach the safe zone');
  assert.equal(edge.progress, '0/1 safe');
});

// ---------- app wiring regression (v38) ----------

test('app.js defines the local helpers it calls', () => {
  // Regression: v37 deleted escapeHtml along with the Levels menu,
  // but updateHUD and the factory editor still call it — startLevel
  // then threw before the draw loop started, so the game board was
  // blank and the objectives list stayed empty.
  const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  for (const name of ['escapeHtml']) {
    assert.ok(src.includes(`function ${name}(`),
      `app.js calls ${name} but does not define it`);
    assert.ok(src.includes(`${name}(`), `app.js never calls ${name}`);
  }
});

// ---------- random chapter colour + header nav (v39) ----------

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

test('generated levels with no factory get Unity\'s random chapter colour', () => {
  // Unity's RNG.RandomChapterColor: hue 0.4-0.9, sat 0.3-0.5, val 0.5-0.7.
  const a = generateLevel('color-1', DEFAULT_CONFIG);
  const b = generateLevel('color-1', DEFAULT_CONFIG);
  assert.ok(a && b);
  assert.match(a.level.color, /^#[0-9a-f]{6}$/);
  assert.equal(a.level.color, b.level.color, 'same seed, same colour');
  const { h, s, v } = hexToHsv(a.level.color);
  assert.ok(h >= 0.4 && h <= 0.9, `hue ${h} in Unity range`);
  assert.ok(s >= 0.3 && s <= 0.5, `sat ${s} in Unity range`);
  assert.ok(v >= 0.5 && v <= 0.7, `val ${v} in Unity range`);
  // A factory colour still wins, and the colour never disturbs the layout:
  // the same seed generates the same grid with or without a colour.
  const withFactory = generateLevel('color-1', DEFAULT_CONFIG, '#6F70AC');
  assert.equal(withFactory.level.color, '#6F70AC');
  assert.deepEqual(withFactory.level.grid, a.level.grid);
});

test('the header is breadcrumbs and the home screen is big buttons', () => {
  // The header lost its big title + nav (v41): it's breadcrumbs now,
  // and the title lives on the home screen above one big button per
  // section. The factory picker and editor survive, collapsed, under
  // "Random level options" so the home screen stays clean.
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('top-nav'), 'no nav list any more');
  assert.ok(!html.includes('data-nav='), 'no data-nav links any more');
  assert.ok(html.includes('id="crumbs"'), 'the header has a crumbs nav');
  assert.ok(!html.includes('play-head'), 'no level-name strip on the player screen');
  assert.ok(!html.includes('id="levelName"'), 'no levelName element');
  assert.ok(html.includes('class="home-title"'), 'the home screen has the title');
  for (const [id, href, label] of [
    ['dailyLink', '?daily', 'Daily'],
    ['randomHomeBtn', '?random', 'Random'],
  ]) {
    assert.ok(html.includes(`id="${id}"`), `home has a ${label} button`);
  }
  assert.ok(html.includes('href="factories.html"'), 'home has a Factories button');
  assert.ok(html.includes('href="editor.html"'), 'home has an Editor button');
  for (const id of ['factorySelect', 'randomSeed', 'randomBtn', 'factoryEditor', 'randomOptions']) {
    assert.ok(html.includes(`id="${id}"`), `the options keep ${id}`);
  }
  for (const page of ['factories.html', 'editor.html']) {
    const pageHtml = readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(pageHtml.includes('class="crumbs"'), `${page} has breadcrumbs`);
    assert.ok(pageHtml.includes('aria-label="Home"'), `${page} crumbs start at Home`);
    assert.ok(!pageHtml.includes('top-nav'), `${page} has no nav list`);
  }
  const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.includes('.crumbs'), 'the crumbs rule exists');
  assert.ok(css.includes('.home-btn'), 'the home-button rule exists');
  assert.ok(!css.includes('.top-nav a.active::after'), 'the dot rule is gone with the nav');
});

// ---------- Unity game buttons (v40) ----------

test('the game buttons match Unity: bottom bar, translucent discs, SVG icons', () => {
  // Unity's GameButtons bar: Rewind left, Finish flag centre, Skip
  // right, 100px up from the bottom; hint top-right, 50x50. The port
  // keeps its restart button top-right with the hint (Sam, Nov 27).
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const bar = html.slice(html.indexOf('class="game-bar"'));
  assert.ok(bar.includes('id="undoBtn"'), 'bar has undo');
  assert.ok(bar.includes('id="flagBtn"'), 'bar has the flag');
  assert.ok(bar.includes('id="stepBtn"'), 'bar has step');
  assert.ok(bar.indexOf('id="undoBtn"') < bar.indexOf('id="flagBtn"')
    && bar.indexOf('id="flagBtn"') < bar.indexOf('id="stepBtn"'),
    'bar order is undo, flag, step (left, centre, right)');
  const hud = html.slice(html.indexOf('class="hud-buttons"'), html.indexOf('class="game-bar"'));
  assert.ok(hud.includes('id="hintBtn"') && hud.includes('id="restartBtn"'),
    'hint and restart stay top-right');
  assert.ok(!hud.includes('id="undoBtn"') && !hud.includes('id="stepBtn"')
    && !hud.includes('id="flagBtn"'), 'the main three are out of the top-right');
  for (const id of ['hintBtn', 'restartBtn', 'undoBtn', 'flagBtn', 'stepBtn']) {
    const btn = html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 900);
    assert.ok(btn.includes('<svg'), `${id} has an SVG icon`);
    assert.ok(!btn.includes('↩') && !btn.includes('▶') && !btn.includes('↻') && !btn.includes('🏁'),
      `${id} has no text glyph`);
  }
  assert.ok(!html.includes('flag-btn'), 'the old big flag button class is gone');
  const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.includes('.game-bar'), 'the bar rule exists');
  assert.ok(css.includes('rgba(255, 255, 255, 0.196)'),
    'the discs use Unity\'s 0.196-alpha white');
});

test('a bare ?random puts the rolled seed in the URL', () => {
  // A breadcrumb or the home Random button rolls a fresh seed — the URL
  // has to carry it, or a refresh / shared link rolls a different level.
  const app = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(app.includes('function randomLevelUrl(factoryId, seed)'),
    'the random-level URL helper exists');
  assert.ok(app.includes('randomLevelUrl(factoryId, seed)'),
    'the helper is used to update the URL');
  assert.ok(app.includes("if (!params.get('seed'))"),
    'the URL is only rewritten when the seed was rolled, not given');
  assert.ok(app.includes('history.replaceState(null, \'\', randomLevelUrl(factoryId, seed))'),
    'the rolled seed is written into the URL');
});

// ---------- diamond sparkle + safe/caught indicators (v43) ----------

test('a diamond pickup sparks when the slide lands, not at the turn start', () => {
  // 3x3: pin row, a diamond one cell above the piggy.
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 13 0', '0 3 0'],
    objectives: {},
  }));
  game.stepForward();
  const t0 = game.movePlanAt;
  assert.equal(game.sparkleFx.length, 1);
  assert.equal(game.sparkleFx[0].at, t0 + MOVE_SNAP_MS);
  // The diamond is gone and counted, and the sparkle clears on undo.
  assert.equal(game.collected[T.COLLECTABLE], 1);
  game.rewind();
  assert.equal(game.sparkleFx.length, 0);
});

test('a player reaching a pin is safe, and a lure catch is caught, at the landing time', () => {
  const pin = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 3 0'],
    objectives: {},
  }));
  pin.stepForward();
  const p = pin.players()[0];
  assert.equal(p.finished, true);
  assert.equal(p.safeAt, pin.movePlanAt + MOVE_SNAP_MS);
  pin.rewind();
  assert.equal(pin.players()[0].finished, false);
  assert.equal(pin.players()[0].safeAt, 0);

  const lure = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 6 0', '0 3 0'],
    objectives: {},
  }));
  lure.stepForward();
  const q = lure.players()[0];
  assert.equal(q.alive, false);
  assert.equal(q.killedBy, 'lure');
  assert.equal(q.caughtAt, lure.movePlanAt + MOVE_SNAP_MS);
});

test('the renderer draws sparkles and safe/caught hexes, and game text is not selectable', () => {
  const render = readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(render.includes('SPARKLE_COUNT = 30'), 'the burst is 30 particles');
  assert.ok(render.includes('SPARKLE_SPEED = 2'), 'the speed is Unity startSpeed 2');
  assert.ok(render.includes('SPARKLE_LIFE_MS = 1000'), 'the lifetime is 1s');
  assert.ok(render.includes('drawSparkles(game, wallNow)'), 'sparkles are drawn');
  assert.ok(render.includes('drawIndicators(game, wallNow)'), 'indicators are drawn');
  assert.ok(render.includes('0.2 + 0.3 * flashTri(now, 1)'),
    'the hex pulses alpha 0.2 <-> 0.5 on a 1s leg');
  assert.ok(!render.includes("strokeStyle = '#44d6a0'"),
    'the old green finished ring is gone — the yellow safe hex marks it');
  const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.includes('user-select: none'), 'game HTML is not selectable');
  assert.ok(css.includes('input, textarea, select'),
    'form fields keep text selection');
});

// ---------- ordered collect (v44) ----------

test('ordered collect: diamonds in order complete the objective', () => {
  // 3-wide: two diamonds stacked above the piggy, pins on top.
  // CollectOrder [1, 0] means the lower diamond (row-major order 1)
  // is first — the piggy meets it first on its way up.
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 13 0', '0 13 0', '0 3 0'],
    objectives: { ReachEdge: true, CollectOrder: [1, 0] },
  }));
  const orderObj = () => game.objectiveList().find((o) => o.id === 'collect-order');
  assert.equal(orderObj().label, 'collect in order');
  assert.equal(orderObj().progress, '0/2');
  assert.equal(orderObj().optional, true);
  assert.equal(orderObj().done, false);
  assert.equal(orderObj().failed, false);
  // The numbers over the diamonds are the 1-based pickup positions.
  assert.equal(game.collectOrderNumber(1), 1);
  assert.equal(game.collectOrderNumber(0), 2);
  game.stepForward(); // onto the order-1 diamond
  assert.equal(game.collected[T.COLLECTABLE], 1);
  assert.equal(game.collectOrderIndex, 1);
  assert.equal(game.collectOrderFailed, false);
  assert.equal(orderObj().progress, '1/2');
  game.stepForward(); // onto the order-0 diamond
  assert.equal(game.collected[T.COLLECTABLE], 2);
  assert.equal(game.collectOrderIndex, 2);
  assert.equal(orderObj().done, true);
  game.stepForward(); // onto the pin — win
  assert.equal(game.status, 'won');
});

test('ordered collect: the wrong diamond first fails the objective, and undo restores it', () => {
  const game = new Game().loadLevel(parseLevel({
    grid: ['18 18 18', '0 13 0', '0 13 0', '0 3 0'],
    objectives: { ReachEdge: true, CollectOrder: [0, 1] },
  }));
  const orderObj = () => game.objectiveList().find((o) => o.id === 'collect-order');
  game.stepForward(); // onto the order-1 diamond, but order 0 was expected
  assert.equal(game.collected[T.COLLECTABLE], 1); // still counts (by removal)
  assert.equal(game.collectOrderIndex, 0);
  assert.equal(game.collectOrderFailed, true);
  assert.equal(orderObj().failed, true);
  assert.equal(game.status, 'playing'); // optional failure doesn't end the level
  game.rewind(); // undo the bad pickup
  assert.equal(game.collectOrderFailed, false);
  assert.equal(game.collectOrderIndex, 0);
  assert.equal(game.collected[T.COLLECTABLE], 0);
  assert.equal(orderObj().failed, false);
  assert.equal(orderObj().progress, '0/2');
});

test('the order numbers are little green circles and the box shows failed/optional', () => {
  const render = readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(render.includes('drawOrderNumber'), 'the order-number draw exists');
  assert.ok(render.includes("s * 0.375, '#44d6a0'"), 'the circle is green, 0.75 across');
  assert.ok(render.includes('x - s * 0.3, y + s * 0.3'), 'the circle sits down-left of the diamond');
  assert.ok(render.includes('if (!game.collectOrderFailed)'), 'the markers hide when the order breaks');
  const app = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(app.includes("o.failed ? '✗ '"), 'a failed objective shows a red ✗');
  assert.ok(app.includes("o.optional ? 'optional'"), 'an optional objective is dimmed');
  const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.includes('.obj-fail'), 'the failed mark is styled');
  assert.ok(css.includes('li.optional'), 'optional objectives are dimmed');
});

test('the editor keeps an imported collect order through re-renders', () => {
  // v44's live check failed here: Import from text parsed the order,
  // then render() rebuilt the objectives from the form controls (which
  // have no order input) and dropped it, so the game never saw it.
  const editor = readFileSync(path.join(ROOT, 'js/editor.js'), 'utf8');
  assert.ok(editor.includes('let importedOrder = []'),
    'the imported order is kept in module state');
  assert.ok(editor.includes('importedOrder = [...(def.objectives.CollectOrder || [])]'),
    'import sets it from the parsed level (and clears a stale one)');
  assert.ok(editor.includes('o.CollectOrder = [...importedOrder]'),
    'readObjectives carries it through every re-render');
  // And the underlying round-trip preserves it (parse -> serialize).
  const def = parseLevel({
    grid: ['18 18 18', '0 13 0', '0 13 0', '0 3 0'],
    objectives: { ReachEdge: true, CollectOrder: [1, 0] },
  });
  assert.deepEqual(def.objectives.CollectOrder, [1, 0]);
});

// ---------- enemy pins (v46) ----------

test('a survival level gets enemy pins along the bottom only', () => {
  const cfg = {
    ...DEFAULT_CONFIG,
    survivalTurnCount: { min: 5, max: 5 },
    endPoints: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
    lures: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
    collectables: { min: 0, max: 0, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
  };
  const { level } = generateLevel('survival-enemy-pins', cfg);
  assert.ok(level, 'a survival level generates');
  const h = level.grid.length;
  const w = level.grid[0].length;
  // JSON row 0 is the bottom edge on screen.
  assert.ok(level.grid[0].every((t) => t === T.ENEMY_PIN), 'the bottom row is enemy pins');
  assert.ok(level.grid[h - 1].every((t) => t === T.EDGE), 'the top row stays edge');
  for (let r = 1; r < h; r++) {
    assert.equal(level.grid[r][0], T.EDGE, 'the left side stays edge');
    assert.equal(level.grid[r][w - 1], T.EDGE, 'the right side stays edge');
  }
  assert.equal(level.objectives.ReachEdge, true, 'survival now ends by reaching a pin');
  assert.equal(level.objectives.SurvivalTurnCount, 5);
});

test('stepping on an enemy pin catches the piggy', () => {
  const game = new Game().loadLevel(parseLevel({
    grid: ['21 21 21', '0 0 0', '0 3 0'],
    objectives: { ReachEdge: true, SurvivalTurnCount: 2 },
  }));
  game.stepForward(); // onto (1,1) — not yet a pin
  assert.equal(game.players()[0].alive, true);
  game.stepForward(); // onto the enemy pin at (0,1)
  const p = game.players()[0];
  assert.equal(p.alive, false);
  assert.equal(p.killedBy, 'enemypin');
  assert.ok(p.caughtAt > 0, 'the red caught hex is timed to the landing');
  assert.equal(game.status, 'lost');
  assert.equal(game.loseReason, 'The piggy was caught on an enemy pin');
});

test('enemy pins turn safe once the survival turns are done, and undo restores them', () => {
  const game = new Game().loadLevel(parseLevel({
    grid: ['21 21 21', '0 0 0', '0 3 0'],
    objectives: { ReachEdge: true, SurvivalTurnCount: 1 },
  }));
  assert.equal(game.terrain[0][1], T.ENEMY_PIN);
  game.stepForward(); // turn 1: the piggy moves to (1,1); the timer completes
  assert.equal(game.terrain[0][1], T.PIN, 'the pins flipped to safe');
  assert.equal(game.status, 'playing');
  game.rewind(); // undo the turn that completed the timer
  assert.equal(game.terrain[0][1], T.ENEMY_PIN, 'undo brings the enemy pins back');
  assert.equal(game.turn, 0);
  game.stepForward(); // turn 1 again: pins flip
  game.stepForward(); // turn 2: onto the (now safe) pin
  assert.equal(game.players()[0].finished, true);
  assert.equal(game.status, 'won');
});

test('the enemy pin is a bigger red ring, not lit by the path', () => {
  const render = readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(render.includes('t === T.ENEMY_PIN'), 'the renderer draws enemy pins');
  assert.ok(render.includes('s * 0.248 * 1.5'), 'the ring is 1.5x a safe pin');
  assert.ok(render.includes('hexA(COLORS.enemy, 0.8)'), 'the ring is red at 0.8 alpha');
  assert.ok(render.includes('game.terrain[step.row]?.[step.col] === T.ENEMY_PIN'),
    'paths skip dots on enemy pins');
  const types = readFileSync(path.join(ROOT, 'js/types.js'), 'utf8');
  assert.ok(types.includes('ENEMY_PIN: 21'), 'enemy pin is a port-only type code');
});
