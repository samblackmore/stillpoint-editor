// Game engine — a port of the Unity turn loop (UnitController +
// GameStateController + World.GetCellsInPath), simplified where noted.
//
// One turn:
//   1. The player taps a cell to preview a wall build (or a wall removal).
//      Every character's path is recomputed against that hypothetical grid
//      and drawn, exactly like Unity's PreviewTurns.
//   2. Tapping the same cell again commits: the wall is placed/removed and
//      every character advances one step along its path.
//   3. Enemies adjacent to a player catch it; a player stepping on the
//      Edge is lost (unless reaching the edge is the objective); pickups
//      are collected; objectives are checked.
//   4. Rewind pops a snapshot of the whole state (Unity rewinds
//      incrementally; snapshots are simpler and exact for these grid sizes).
//
// Deliberately simplified in this first version (see README):
//   - No abilities (Freeze, Pull, Bomb warmup). Bombs are approximated:
//     a player ending a turn next to one dies.
//   - No flood spreading when a character has no path; it simply stays put.
//   - No fog: the whole board is visible.
import { T, RULES, ITEM_TYPES, STATIC_ITEM_TYPES, CHARACTER_KINDS } from './types.js?v=4';
import { Nav, ORIENTATION } from './nav.js?v=4';

const key = (row, col) => `${row},${col}`;

export class Game {
  constructor() {
    this.status = 'playing';
    this.winReason = null;
    this.loseReason = null;
  }

  loadLevel(def) {
    this.def = def;
    this.height = def.grid.length;
    this.width = def.grid[0].length;
    this.orientation = def.orientation ?? ORIENTATION.HORIZONTAL;
    this.terrain = [];
    this.items = new Map(); // "row,col" -> { type, order }
    this.chars = [];
    let id = 0;
    let collectableOrder = 0;
    for (let r = 0; r < this.height; r++) {
      this.terrain.push([]);
      for (let c = 0; c < this.width; c++) {
        const type = def.grid[r][c];
        if (type in CHARACTER_KINDS) {
          this.terrain[r].push(T.EMPTY);
          this.chars.push({
            id: id++,
            kind: CHARACTER_KINDS[type],
            type,
            row: r,
            col: c,
            alive: true,
            finished: false,
            sleeping: false,
            path: [],
            target: null,
            oldPath: null,
          });
        } else if (ITEM_TYPES.has(type) || STATIC_ITEM_TYPES.has(type)) {
          this.terrain[r].push(T.EMPTY);
          // Collectables get an order (row-major) for CollectOrder levels.
          this.items.set(key(r, c), {
            type,
            order: type === T.COLLECTABLE ? collectableOrder++ : 0,
          });
        } else {
          this.terrain[r].push(type);
        }
      }
    }
    this.turn = 0;
    this.wallsBuilt = 0;
    this.collected = { [T.ENDPOINT]: 0, [T.COLLECTABLE]: 0, [T.LURE]: 0 };
    this.collectOrderIndex = 0;
    this.history = [];
    this.previewState = null;
    this.status = 'playing';
    this.winReason = null;
    this.loseReason = null;
    // Sleeping levels: enemies start asleep (Unity: SleepUntilWithinRange).
    const sleepingLevel = !!def.sleeping;
    for (const ch of this.chars) {
      ch.sleeping = sleepingLevel && RULES[ch.kind].sleepRange >= 0 && ch.kind !== 'player';
    }
    this.nav = new Nav(this.height, this.width, this.orientation, (r, c) =>
      this.typesAt(r, c, this.terrain)
    );
    this.recomputePaths();
    return this;
  }

  // All object types on a cell, as Unity's NavInfo sees them.
  typesAt(row, col, terrain = this.terrain) {
    const types = [];
    const t = terrain[row][col];
    if (t !== T.EMPTY) types.push(t);
    const item = this.items.get(key(row, col));
    if (item !== undefined) types.push(item.type);
    for (const ch of this.chars) {
      if (ch.alive && ch.row === row && ch.col === col) types.push(ch.type);
    }
    return types;
  }

  players() {
    return this.chars.filter((c) => c.kind === 'player');
  }

  npcs() {
    return this.chars.filter((c) => c.kind !== 'player');
  }

  // Port of World.GetCellsInPath: when the board has both an Edge and an
  // attractor (Lure/EndPoint), first try to reach an attractor with the
  // Edge blocked; otherwise take the most-attractive path, or the nearest
  // when there is nothing to be attracted to.
  computePathFor(ch, terrain = this.terrain) {
    const rules = RULES[ch.kind];
    if (!rules.searching.length) return { target: null, path: null };
    const nav = terrain === this.terrain ? this.nav : new Nav(this.height, this.width, this.orientation, (r, c) =>
      this.typesAt(r, c, terrain)
    );
    const typesAt = (r, c) => this.typesAt(r, c, terrain);
    const anyEdge = terrain.flat().includes(T.EDGE);
    const anyAttractors = [...this.items.values()].some((it) => it.type === T.LURE || it.type === T.ENDPOINT);
    const oldPath = ch.oldPath;
    if (anyEdge && anyAttractors) {
      const blockingWithEdge = { ...rules.blocking };
      if (!(T.EDGE in blockingWithEdge)) blockingWithEdge[T.EDGE] = -1;
      const res = this.pathWith(nav, typesAt, rules, ch, blockingWithEdge, oldPath, terrain);
      if (res.target) return res;
    }
    return this.pathWith(nav, typesAt, rules, ch, rules.blocking, oldPath, terrain);
  }

  pathWith(nav, typesAt, rules, ch, blocking, oldPath, terrain) {
    // Nav was constructed with this.typesAt bound to this.terrain; for a
    // hypothetical terrain we need a fresh Nav over it.
    const navFor = terrain === this.terrain
      ? nav
      : new Nav(this.height, this.width, this.orientation, typesAt);
    const anyAttractors = [...this.items.values()].some((it) => it.type === T.LURE || it.type === T.ENDPOINT);
    const res = anyAttractors
      ? navFor.pathToMostAttractive(rules.searching, blocking, ch.row, ch.col, rules.searchDistance, oldPath)
      : navFor.pathToNearest(rules.searching, blocking, ch.row, ch.col, rules.searchDistance);
    return res;
  }

  recomputePaths(terrain = this.terrain) {
    for (const ch of this.chars) {
      if (!ch.alive || ch.finished || ch.sleeping) {
        ch.path = [];
        ch.target = null;
        continue;
      }
      const res = this.computePathFor(ch, terrain);
      ch.path = res.path || [];
      ch.target = res.target || null;
    }
  }

  // Wake sleeping enemies whose wake range now contains a player.
  updateSleep() {
    for (const ch of this.chars) {
      if (!ch.sleeping) continue;
      const range = RULES[ch.kind].sleepRange;
      if (range < 0) continue;
      for (const p of this.players()) {
        if (!p.alive) continue;
        const d = this.nav.distance(ch.row, ch.col, p.row, p.col);
        if (d >= 0 && d <= range) {
          ch.sleeping = false;
          break;
        }
      }
    }
  }

  // ---- Preview / commit (tap to preview, tap again to commit) ----

  canBuildAt(row, col) {
    const t = this.terrain[row][col];
    if (t !== T.EMPTY && t !== T.SNOW) return false;
    if (this.items.has(key(row, col))) return false;
    if (this.chars.some((c) => c.alive && c.row === row && c.col === col)) return false;
    return true;
  }

  preview(row, col) {
    if (this.status !== 'playing') return null;
    if (this.previewState && this.previewState.row === row && this.previewState.col === col) {
      return this.commit();
    }
    let action = null;
    if (this.terrain[row][col] === T.WALL) action = 'remove';
    else if (this.canBuildAt(row, col)) action = 'build';
    else {
      this.previewState = null;
      this.recomputePaths();
      return null;
    }
    const hypo = this.terrain.map((r) => r.slice());
    hypo[row][col] = action === 'build' ? T.WALL : T.EMPTY;
    const paths = new Map();
    for (const ch of this.chars) {
      if (!ch.alive || ch.finished || ch.sleeping) continue;
      const res = this.computePathFor(ch, hypo);
      paths.set(ch.id, res.path || []);
    }
    this.previewState = { row, col, action, paths, hypo };
    return this.previewState;
  }

  clearPreview() {
    this.previewState = null;
    this.recomputePaths();
  }

  snapshot() {
    return JSON.parse(JSON.stringify({
      terrain: this.terrain,
      items: [...this.items.entries()],
      chars: this.chars.map((c) => ({
        row: c.row, col: c.col, alive: c.alive, finished: c.finished, sleeping: c.sleeping,
      })),
      turn: this.turn,
      wallsBuilt: this.wallsBuilt,
      collected: this.collected,
      collectOrderIndex: this.collectOrderIndex,
    }));
  }

  restore(snap) {
    // Deep-copy: the snapshot must survive being restored from repeatedly
    // (a solver replays the same snapshot many times), so never alias its
    // arrays — a commit mutates this.terrain in place.
    this.terrain = snap.terrain.map((row) => row.slice());
    this.items = new Map(snap.items.map(([k, v]) => [k, { ...v }]));
    snap.chars.forEach((s, i) => Object.assign(this.chars[i], s));
    this.turn = snap.turn;
    this.wallsBuilt = snap.wallsBuilt;
    this.collected = snap.collected;
    this.collectOrderIndex = snap.collectOrderIndex;
    this.status = 'playing';
    this.winReason = null;
    this.loseReason = null;
    this.previewState = null;
    this.recomputePaths();
  }

  commit() {
    if (this.status !== 'playing') return false;
    if (!this.previewState) return false;
    this.history.push(this.snapshot());
    const { row, col, action, paths } = this.previewState;
    this.terrain[row][col] = action === 'build' ? T.WALL : T.EMPTY;
    if (action === 'build') this.wallsBuilt++;
    // Advance along the paths previewed against the hypothetical grid
    // (Unity commits the previewed paths, not freshly computed ones).
    for (const ch of this.chars) {
      const p = paths.get(ch.id);
      if (p) {
        ch.oldPath = ch.path;
        ch.path = p;
      }
    }
    this.previewState = null;
    this.turn++;
    this.advanceTurn();
    return true;
  }

  // One turn with no wall change (the step-forward button).
  stepForward() {
    if (this.status !== 'playing') return false;
    if (this.def.disableStepForward) return false;
    this.history.push(this.snapshot());
    this.turn++;
    this.advanceTurn();
    return true;
  }

  rewind() {
    const snap = this.history.pop();
    if (!snap) return false;
    this.restore(snap);
    return true;
  }

  advanceTurn() {
    this.updateSleep();
    // Players first, then NPCs (Unity advances _allCharacters in load order;
    // players are listed first in the level grids we ship).
    const movers = [...this.players(), ...this.npcs()];
    for (const mover of movers) {
      if (!mover.alive || mover.finished || mover.sleeping) continue;
      if (!mover.path || mover.path.length === 0) continue; // no path: stays put
      const next = mover.path[0];
      // Blocked if another living character currently sits on the next cell.
      if (this.chars.some((c) => c !== mover && c.alive && c.row === next.row && c.col === next.col)) {
        continue;
      }
      if (this.terrain[next.row][next.col] === T.WALL) {
        // Digger behaviour: destroy the wall and move into the cell.
        if (!RULES[mover.kind].canMoveAfterDestroyWall) continue;
        this.terrain[next.row][next.col] = T.EMPTY;
      }
      mover.oldPath = mover.path;
      mover.row = next.row;
      mover.col = next.col;
      mover.path = mover.path.slice(1);
      this.onArrive(mover);
    }

    // Enemies (and bombs, approximated) catch adjacent players.
    for (const p of this.players()) {
      if (!p.alive || p.finished) continue;
      const dangerCells = this.adjacentOpenCells(p.row, p.col);
      for (const ch of this.chars) {
        if (!ch.alive || ch.kind === 'player') continue;
        if (ch.kind === 'enemy' || ch.kind === 'bomb') {
          if (dangerCells.some(([r, c]) => ch.row === r && ch.col === c)) {
            p.alive = false;
            p.killedBy = ch.kind;
          }
        }
      }
    }

    // Re-path before judging the end: a player that just collected its
    // target may have a new one, and only a genuinely pathless player ends it.
    this.recomputePaths();
    this.checkEnd();
  }

  // The player's own cell plus adjacent cells reachable without crossing a
  // wall — the same flood Unity uses for the catch check (distance 0: the
  // flood still includes the immediate neighbours, see Navigation.Search).
  adjacentOpenCells(row, col) {
    const cells = [[row, col]];
    const flooded = this.nav.flood([T.EMPTY], { [T.WALL]: -1 }, row, col, 0);
    for (const f of flooded) {
      if (f.row !== row || f.col !== col) cells.push([f.row, f.col]);
    }
    return cells;
  }

  onArrive(mover) {
    const k = key(mover.row, mover.col);
    if (mover.kind === 'player') {
      const item = this.items.get(k);
      if (item !== undefined && ITEM_TYPES.has(item.type)) {
        this.items.delete(k);
        if (this.collectOrderApplies(item)) {
          this.collected[item.type]++;
        }
        // Collecting out of order doesn't count (CollectOrder levels).
      }
      const terrain = this.terrain[mover.row][mover.col];
      if (RULES.player.stopOn.includes(terrain)) {
        mover.finished = true;
      }
      if (terrain === T.EDGE) {
        // Unity: a player that steps on the Edge is lost in the void.
        mover.alive = false;
        mover.killedBy = 'edge';
      }
    }
  }

  collectOrderApplies(item) {
    const order = this.def.objectives?.CollectOrder;
    if (!order || order.length === 0) return true;
    if (item.type !== T.COLLECTABLE) return true;
    const expected = order[this.collectOrderIndex];
    if (item.order === expected) {
      this.collectOrderIndex++;
      return true;
    }
    return false;
  }

  // ---- Objectives / win / lose ----

  // Objective evaluation, ported from ObjectivesBox.Refresh().
  //
  // ReachEdge is *not* about Edge cells: in Unity it completes when every
  // player is standing on a Pin, and fails when every player has stopped
  // (finished or pathless) without all being pinned. Edge terrain is a
  // hazard — a player stepping on it dies.
  objectiveList() {
    const o = this.def.objectives || {};
    const list = [];
    const players = this.players();
    const pinned = players.filter(
      (p) => p.alive && this.terrain[p.row][p.col] === T.PIN
    ).length;
    const stopped = players.filter(
      (p) => p.finished || !p.alive || p.path.length === 0
    ).length;
    if (o.ReachEdge) {
      const failed = players.some((p) => !p.alive) || (stopped === players.length && pinned !== players.length);
      list.push({
        id: 'edge', label: 'Pin every piggy',
        done: players.length > 0 && pinned === players.length,
        failed,
        progress: `${pinned}/${players.length} pinned`,
      });
    }
    if (o.ReachOldTimer) {
      const onTimer = players.some((p) => {
        const item = this.items.get(key(p.row, p.col));
        return p.alive && item?.type === T.OLDTIMER;
      });
      list.push({
        id: 'oldtimer', label: 'Reach the Old Timer',
        done: onTimer,
      });
    }
    if (o.SurvivalTurnCount > 0) {
      list.push({
        id: 'survive', label: `Survive ${o.SurvivalTurnCount} turns`,
        done: this.turn >= o.SurvivalTurnCount && players.every((p) => p.alive),
        progress: `${Math.min(this.turn, o.SurvivalTurnCount)}/${o.SurvivalTurnCount}`,
      });
    }
    if (o.SurvivalTurnCountBonus > 0) {
      list.push({
        id: 'survive-bonus', label: `Bonus: survive ${o.SurvivalTurnCountBonus} turns`,
        done: this.turn >= o.SurvivalTurnCountBonus && players.every((p) => p.alive),
        optional: true,
        progress: `${Math.min(this.turn, o.SurvivalTurnCountBonus)}/${o.SurvivalTurnCountBonus}`,
      });
    }
    // Unity only creates an objective for CollectAtLeast > 0.
    for (const c of o.CollectItemObjectives || []) {
      if (!(c.CollectAtLeast > 0)) continue;
      const have = this.collected[c.ItemType] || 0;
      const need = c.CollectAtLeast;
      const max = c.CollectNoMoreThan || 0;
      list.push({
        id: `collect-${c.ItemType}`,
        label: `Collect ${need > 0 ? `at least ${need} ` : ''}${nameOf(c.ItemType)}${max > 0 ? ` (no more than ${max})` : ''}`,
        done: have >= need,
        failed: max > 0 && have > max,
        optional: !!c.IsOptional,
        progress: `${have}/${need}`,
      });
    }
    if (o.BuildWallsNoMoreThan > 0) {
      // Unity: complete at exactly N walls, failed past N.
      list.push({
        id: 'walls', label: `Build exactly ${o.BuildWallsNoMoreThan} walls`,
        done: this.wallsBuilt === o.BuildWallsNoMoreThan,
        failed: this.wallsBuilt > o.BuildWallsNoMoreThan,
        progress: `${this.wallsBuilt}/${o.BuildWallsNoMoreThan}`,
      });
    }
    if (o.TrapObjectives?.some((t) => t > 0)) {
      list.push({
        id: 'trap', label: 'Trap objective (not ported yet)',
        done: false, unsupported: true,
      });
    }
    return list;
  }

  requiredObjectives() {
    return this.objectiveList().filter((o) => !o.optional && !o.unsupported);
  }

  allObjectivesComplete() {
    return this.requiredObjectives().every((o) => o.done);
  }

  anyObjectiveFailed() {
    return this.objectiveList().some((o) => o.failed);
  }

  checkEnd() {
    const playersGone = this.players().every(
      (p) => p.finished || !p.alive || p.path.length === 0
    );
    if (this.allObjectivesComplete()) {
      this.status = 'won';
      this.winReason = 'All objectives complete';
      return;
    }
    if (this.anyObjectiveFailed() || playersGone) {
      this.status = 'lost';
      const dead = this.players().find((p) => !p.alive);
      this.loseReason = dead
        ? dead.killedBy === 'edge'
          ? 'The piggy wandered off the edge'
          : dead.killedBy === 'bomb'
            ? 'The piggy was caught by a bomb'
            : 'The piggy was caught'
        : 'The piggy has nowhere left to go';
    }
  }
}

function nameOf(type) {
  return { [T.ENDPOINT]: 'endpoints', [T.COLLECTABLE]: 'diamonds', [T.LURE]: 'lures' }[type] || 'items';
}
