// Random level generator — a port of LevelFactory.TryGenerate, with the
// one deliberate change that it runs on a seeded RNG (see rng.js) instead of
// UnityEngine.Random, so generated levels are reproducible from a seed.
//
// Wall placement: a few seeds are scattered, then each cell becomes a wall
// with a 1-in-(2 * distance-to-nearest-seed) chance, so walls cluster
// around the seeds. Everything else is placed by rejection sampling with
// minimum-separation rules (LayoutCells), retrying the whole level up to
// 100 times when a placement fails.
import { T } from './types.js?v=8';
import { RNG } from './rng.js?v=8';
import { Nav, ORIENTATION } from './nav.js?v=8';

const DENSITY = { VerySparse: 1.5, Sparse: 1.3, Normal: 1, Dense: 0.75 };

// Sensible defaults (a typical early chapter). The live config lives in
// generator-config.json so it can be tuned without touching code.
export const DEFAULT_CONFIG = {
  width: { min: 6, max: 9 },
  height: { min: 6, max: 9 },
  wallSeedCount: { min: 2, max: 4 },
  wallDensity: 'Normal',
  playerCount: 1,
  enemyCount: { min: 0, max: 2 },
  bombEnemyCount: { min: 0, max: 1 },
  bombEnemy6Count: { min: 0, max: 0 },
  bombEnemy9Count: { min: 0, max: 0 },
  pullEnemyCount: { min: 0, max: 0 },
  diggerCount: { min: 0, max: 1 },
  floodCount: { min: 0, max: 0 },
  endPoints: { min: 1, max: 2, mustCollectAtLeast: 1, canCollectNoMoreThan: 0 },
  lures: { min: 0, max: 1, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
  collectables: { min: 0, max: 2, mustCollectAtLeast: 0, canCollectNoMoreThan: 0 },
  snow: { min: 0, max: 0 },
  survivalTurnCount: { min: 0, max: 0 },
  edgeBottom: false,
  edgeTop: false,
  edgeLeft: false,
  edgeRight: false,
  orderObjective: false,
};

function rv(rng, { min, max }) {
  return rng.rangeInt(min, max);
}

class Layout {
  constructor(rng, width, height) {
    this.rng = rng;
    this.width = width;
    this.height = height;
    this.quadrant = 0;
    this.cells = Array.from({ length: height }, () => new Array(width).fill(T.EMPTY));
  }

  randomBox() {
    return [this.rng.rangeInt(0, this.width - 1), this.rng.rangeInt(0, this.height - 1)];
  }

  randomInnerBox() {
    const tw = Math.floor(this.width / 3);
    const th = Math.floor(this.height / 3);
    return [this.rng.rangeInt(tw, tw * 2 - 1), this.rng.rangeInt(th, th * 2 - 1)];
  }

  randomQuadrant() {
    const available = [0, 1, 2, 3].filter((q) => q !== this.quadrant);
    this.quadrant = available[this.rng.rangeInt(0, 2)];
    const hw = Math.floor(this.width / 2);
    const hh = Math.floor(this.height / 2);
    let minX, maxX, minY, maxY;
    if (this.quadrant === 0) [minX, maxX, minY, maxY] = [0, hw, 0, hh];
    else if (this.quadrant === 1) [minX, maxX, minY, maxY] = [hw, this.width, 0, hh];
    else if (this.quadrant === 2) [minX, maxX, minY, maxY] = [0, hw, hh, this.height];
    else [minX, maxX, minY, maxY] = [hw, this.width, hh, this.height];
    return [this.rng.rangeInt(minX, maxX - 1), this.rng.rangeInt(minY, maxY - 1)];
  }

  // Port of LevelFactory.LayoutCells. Separation distances are measured by
  // Dijkstra flood from the candidate cell, walls excluded.
  layoutCells(type, layoutFn, count, { mustBePlacedOnEmpty = true, separation = null } = {}) {
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 100 && !placed; attempt++) {
        const [x, y] = layoutFn();
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
        if (this.cells[y][x] === type) continue;
        if (mustBePlacedOnEmpty && this.cells[y][x] !== T.EMPTY) continue;
        if (separation) {
          const nav = new Nav(this.height, this.width, ORIENTATION.HORIZONTAL, (r, c) => {
            const t = this.cells[r][c];
            return t === T.EMPTY ? [] : [t];
          });
          const maxDist = Math.max(...Object.values(separation));
          const flooded = nav.flood(
            [],
            { [T.WALL]: -1 },
            y, x, maxDist
          );
          const tooClose = Object.entries(separation).some(([sepType, sepDist]) =>
            flooded.some(
              (f) =>
                this.cells[f.row][f.col] === Number(sepType) && f.distance <= sepDist
            )
          );
          if (tooClose) continue;
        }
        this.cells[y][x] = type;
        placed = true;
      }
      if (!placed) return false;
    }
    return true;
  }
}

function tryGenerate(rng, cfg) {
  const width = rv(rng, cfg.width);
  const height = rv(rng, cfg.height);
  const layout = new Layout(rng, width, height);
  const density = DENSITY[cfg.wallDensity] ?? 1;
  const wallSeeds = Array.from({ length: rv(rng, cfg.wallSeedCount) }, () => layout.randomBox());

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const closest = Math.min(
        ...wallSeeds.map(([sx, sy]) => Math.hypot(sx - x, sy - y))
      );
      const n = Math.round(2 * closest * density);
      layout.cells[y][x] = rng.chanceOneIn(n) ? T.WALL : T.EMPTY;
    }
  }

  // Optional Edge border. Row 0 is the top of the screen (same as the
  // level JSON), so "top" is the first row and "bottom" the last.
  if (cfg.edgeTop) {
    layout.cells.unshift(new Array(layout.width).fill(T.EMPTY));
    layout.height++;
  }
  if (cfg.edgeBottom) {
    layout.cells.push(new Array(layout.width).fill(T.EMPTY));
    layout.height++;
  }
  if (cfg.edgeLeft) {
    for (const row of layout.cells) row.unshift(T.EMPTY);
    layout.width++;
  }
  if (cfg.edgeRight) {
    for (const row of layout.cells) row.push(T.EMPTY);
    layout.width++;
  }
  if (cfg.edgeTop) layout.cells[0].fill(T.EDGE);
  if (cfg.edgeBottom) layout.cells[layout.height - 1].fill(T.EDGE);
  if (cfg.edgeLeft) for (const row of layout.cells) row[0] = T.EDGE;
  if (cfg.edgeRight) for (const row of layout.cells) row[layout.width - 1] = T.EDGE;

  const ok =
    layout.layoutCells(T.PLAYER, () => layout.randomInnerBox(), cfg.playerCount, {
      mustBePlacedOnEmpty: false,
      separation: { [T.EDGE]: 3 },
    }) &&
    layout.layoutCells(T.ENEMY, () => layout.randomBox(), rv(rng, cfg.enemyCount), {
      separation: { [T.PLAYER]: 3 },
    }) &&
    layout.layoutCells(T.PULL, () => layout.randomInnerBox(), rv(rng, cfg.pullEnemyCount), {
      separation: { [T.PLAYER]: 1 },
    }) &&
    layout.layoutCells(T.BOMB, () => layout.randomBox(), rv(rng, cfg.bombEnemyCount), {
      mustBePlacedOnEmpty: false,
      separation: { [T.BOMB6]: 2, [T.BOMB9]: 2, [T.PLAYER]: 1, [T.EDGE]: 1 },
    }) &&
    layout.layoutCells(T.BOMB6, () => layout.randomBox(), rv(rng, cfg.bombEnemy6Count), {
      mustBePlacedOnEmpty: false,
      separation: { [T.BOMB]: 2, [T.BOMB9]: 2, [T.PLAYER]: 1, [T.EDGE]: 1 },
    }) &&
    layout.layoutCells(T.BOMB9, () => layout.randomBox(), rv(rng, cfg.bombEnemy9Count), {
      mustBePlacedOnEmpty: false,
      separation: { [T.BOMB]: 2, [T.BOMB6]: 2, [T.PLAYER]: 1, [T.EDGE]: 1 },
    }) &&
    layout.layoutCells(T.ENDPOINT, () => layout.randomQuadrant(), rv(rng, cfg.endPoints), {
      separation: { [T.EDGE]: 1, [T.PLAYER]: 1 },
    }) &&
    layout.layoutCells(T.LURE, () => layout.randomQuadrant(), rv(rng, cfg.lures), {
      separation: { [T.PLAYER]: 1, [T.ENDPOINT]: 2 },
    }) &&
    layout.layoutCells(T.SNOW, () => layout.randomQuadrant(), rv(rng, cfg.snow)) &&
    layout.layoutCells(T.DIGGER, () => layout.randomBox(), rv(rng, cfg.diggerCount), {
      mustBePlacedOnEmpty: false,
    }) &&
    layout.layoutCells(T.FLOOD, () => layout.randomBox(), rv(rng, cfg.floodCount), {
      separation: { [T.PLAYER]: 3 },
    }) &&
    layout.layoutCells(T.COLLECTABLE, () => layout.randomBox(), rv(rng, cfg.collectables), {
      separation: { [T.EDGE]: 2, [T.COLLECTABLE]: 2 },
    });
  if (!ok) return null;

  const collectObjectives = [];
  const endCount = layout.cells.flat().filter((t) => t === T.ENDPOINT).length;
  const colCount = layout.cells.flat().filter((t) => t === T.COLLECTABLE).length;
  const lureCount = layout.cells.flat().filter((t) => t === T.LURE).length;
  if (endCount > 0) {
    collectObjectives.push({
      ItemType: T.ENDPOINT,
      CollectAtLeast: cfg.endPoints.mustCollectAtLeast,
      CollectNoMoreThan: cfg.endPoints.canCollectNoMoreThan,
    });
  }
  if (colCount > 0) {
    collectObjectives.push({
      ItemType: T.COLLECTABLE,
      CollectAtLeast: cfg.collectables.mustCollectAtLeast,
      CollectNoMoreThan: cfg.collectables.canCollectNoMoreThan,
    });
  }
  if (lureCount > 0) {
    collectObjectives.push({
      ItemType: T.LURE,
      CollectAtLeast: cfg.lures.mustCollectAtLeast,
      CollectNoMoreThan: cfg.lures.canCollectNoMoreThan,
    });
  }

  return {
    grid: layout.cells,
    orientation: 0,
    sleeping: false,
    objectives: {
      SurvivalTurnCount: rv(rng, cfg.survivalTurnCount),
      CollectItemObjectives: collectObjectives,
      CollectOrder: cfg.orderObjective ? shuffledRange(rng, colCount) : [],
    },
  };
}

function shuffledRange(rng, size) {
  const available = Array.from({ length: size }, (_, i) => i);
  const out = [];
  while (out.length < size) {
    out.push(available.splice(rng.rangeInt(0, available.length - 1), 1)[0]);
  }
  return out;
}

// Generate a level from a seed string/number and a config.
// Returns { level, seed } or null after 100 failed attempts.
export function generateLevel(seed, config = DEFAULT_CONFIG) {
  const rng = new RNG(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const level = tryGenerate(rng, config);
    if (level) return { level, seed };
  }
  return null;
}

// Today's daily puzzle seed, local time: "YYYY-MM-DD".
export function dailySeed(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
