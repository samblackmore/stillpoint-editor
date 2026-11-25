// Headless tests for the Stillpoint HTML port.
// Run: node --test test/  (or npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Nav, ORIENTATION } from '../js/nav.js';
import { T } from '../js/types.js';
import { Game } from '../js/engine.js';
import { parseLevel } from '../js/levels.js';
import { generateLevel, dailySeed } from '../js/generator.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const STORE = path.join(ROOT, 'levels/store');

function loadStoreLevel(file) {
  return parseLevel(JSON.parse(readFileSync(path.join(STORE, file), 'utf8')));
}

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

// ---------- level store ----------

test('every stored level loads and builds a game', () => {
  const files = readdirSync(STORE).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 200, `expected 200+ levels, got ${files.length}`);
  // tut_3_A.json is a pins-only board with no player (a template in the
  // Unity repo); every other level must have one.
  for (const f of files) {
    const game = new Game().loadLevel(loadStoreLevel(f));
    if (f === 'tut_3_A.json') continue;
    assert.ok(game.players().length >= 1, `${f}: no player`);
    assert.equal(game.status, 'playing');
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

test('tutorial: first steps is won by walking to the pin', () => {
  const game = new Game().loadLevel(loadStoreLevel('tut_0_0.json'));
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
  const game = new Game().loadLevel(loadStoreLevel('tut_0_0_1.json'));
  assert.equal(solve(game, { maxDepth: 10 }), true);
});

test('tutorial: collect the diamond, then pin', () => {
  // tut_0_0_B appears unwinnable under the ported rules (and, by the same
  // rules, in Unity): the piggy reaches a pin in two turns no matter what
  // wall is placed first, and the diamond sits south of it, off every
  // shortest path to a pin. It stays in the store but out of the menu
  // until the rule behind it is understood.
  const game = new Game().loadLevel(loadStoreLevel('tut_0_0_B.json'));
  assert.equal(solve(game, { maxDepth: 10 }), false);
});

test('survival levels are winnable', () => {
  for (const f of ['level0.json', 'level1.json', 'level3.json', 'level5.json', 'break_tut.json']) {
    const game = new Game().loadLevel(loadStoreLevel(f));
    assert.equal(solve(game, { maxDepth: 8 }), true, `${f} should be winnable`);
  }
});

test('rewind restores the previous state', () => {
  const game = new Game().loadLevel(loadStoreLevel('level0.json'));
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
