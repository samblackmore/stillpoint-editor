// Hex-grid navigation — a direct port of Navigation.cs (Dijkstra flood search).
// Grids use the same layout as the Unity game: rows run top-to-bottom
// (row 0 = top of the JSON grid), columns left-to-right.
//
// Orientation "horizontal" (LevelOrientation.Horizontal = 0, the default):
// flat-top hexes, odd rows shifted right by half a cell. Neighbours:
//   D1 (row-1, col)  D2 (row+1, col)  D3 (row, col+1)  D4 (row, col-1)
//   D5/D6: the parity-dependent diagonals.
// Orientation "vertical" (1): the same topology with rows/columns swapped.
import { T } from './types.js?v=26';

export const ORIENTATION = { HORIZONTAL: 0, VERTICAL: 1 };

export function neighbours(row, col, height, width, orientation) {
  const out = [];
  const put = (r, c) => {
    if (r >= 0 && r < height && c >= 0 && c < width) out.push([r, c]);
  };
  if (orientation === ORIENTATION.HORIZONTAL) {
    put(row - 1, col);
    put(row + 1, col);
    put(row, col + 1);
    put(row, col - 1);
    if (row % 2 === 0) {
      put(row - 1, col - 1);
      put(row + 1, col - 1);
    } else {
      put(row - 1, col + 1);
      put(row + 1, col + 1);
    }
  } else {
    put(row, col - 1);
    put(row, col + 1);
    put(row - 1, col);
    put(row + 1, col);
    if (col % 2 === 0) {
      put(row - 1, col - 1);
      put(row + 1, col - 1);
    } else {
      put(row - 1, col + 1);
      put(row + 1, col + 1);
    }
  }
  return out;
}

// A nav map is built from a `typesAt(row, col)` function returning the list of
// object types on that cell (terrain + items + characters).
export class Nav {
  constructor(height, width, orientation, typesAt) {
    this.height = height;
    this.width = width;
    this.orientation = orientation;
    this.typesAt = typesAt;
  }

  cellKey(row, col) {
    return row * this.width + col;
  }

  // Port of Navigation.Search: Dijkstra flood from (startRow, startCol).
  // `blocking` maps type -> cost (-1 = impassable; absent = 0).
  // A cell is enterable only when every type on it has cost > -1.
  // The step cost into a cell is the highest cost among its types (min 1).
  // `searching` types found on a cell are recorded only when no type on that
  // cell has a cost > 0 (a target behind something costly isn't "found").
  // Returns { found: Map<key, {row, col, type}>, flooded: [{row, col, distance}] }.
  search(searching, blocking, startRow, startCol, searchDistance, stopEarly = false) {
    const H = this.height;
    const W = this.width;
    const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
    const explored = Array.from({ length: H }, () => new Array(W).fill(false));
    const costOf = (type) => (type in blocking ? blocking[type] : 0);

    dist[startRow][startCol] = 0;
    explored[startRow][startCol] = true;

    let foundDistance = searchDistance;
    const found = new Map();
    const flooded = [{ row: startRow, col: startCol, distance: 0 }];
    // The frontier is a plain list, like Unity's — grids here are tiny.
    const frontier = [{ row: startRow, col: startCol }];

    while (frontier.length > 0) {
      // Pop the lowest-distance cell.
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) {
        if (dist[frontier[i].row][frontier[i].col] < dist[frontier[bi].row][frontier[bi].col]) bi = i;
      }
      const current = frontier.splice(bi, 1)[0];
      const curDist = dist[current.row][current.col];

      if (stopEarly && curDist > foundDistance) break;
      if (curDist > searchDistance) break;

      const accessible = [];
      for (const [nr, nc] of neighbours(current.row, current.col, H, W, this.orientation)) {
        const types = this.typesAt(nr, nc);
        if (!types.every((t) => costOf(t) > -1)) continue;
        accessible.push([nr, nc, types]);
      }

      for (const [nr, nc, types] of accessible) {
        const costs = types.map(costOf).sort((a, b) => a - b);
        const highestCost = Math.max(1, costs.length ? costs[costs.length - 1] : 0);
        const distanceCost = curDist + highestCost;

        if (!explored[nr][nc] || distanceCost < dist[nr][nc]) {
          explored[nr][nc] = true;
          dist[nr][nc] = distanceCost;
          frontier.push({ row: nr, col: nc });
          flooded.push({ row: nr, col: nc, distance: distanceCost });
        }
      }

      // Record found targets among the accessible neighbours.
      for (const [nr, nc, types] of accessible) {
        const key = this.cellKey(nr, nc);
        if (found.has(key)) continue;
        const anyBlocking = types.some((t) => costOf(t) > 0);
        if (anyBlocking) continue;
        for (const type of types) {
          if (searching.includes(type)) {
            found.set(key, { row: nr, col: nc, type });
            if (stopEarly && dist[nr][nc] < foundDistance) foundDistance = dist[nr][nc];
            break;
          }
        }
      }
    }

    return { found, flooded, dist };
  }

  // Port of Navigation.GetPathToMostAttractive: pick the found target whose
  // type comes first in `searching`, then the closest. Reconstruct the path
  // by walking back through decreasing distances, preferring to stay near
  // the character's previous path (keeps paths stable across previews).
  // Returns { target, path } with path in movement order (first step first),
  // or { target: null, path: null }.
  pathToMostAttractive(searching, blocking, startRow, startCol, searchDistance, oldPath = null) {
    const result = this.search(searching, blocking, startRow, startCol, searchDistance, false);
    if (result.found.size === 0) return { target: null, path: null, flooded: result.flooded };
    const best = [...result.found.values()].sort(
      (a, b) =>
        searching.indexOf(a.type) - searching.indexOf(b.type) ||
        result.dist[a.row][a.col] - result.dist[b.row][b.col]
    )[0];
    return {
      target: best,
      path: this.reconstruct(result.dist, best.row, best.col, oldPath),
      flooded: result.flooded,
    };
  }

  // Port of Navigation.GetPathToNearest: same, but the flood stops early once
  // a target is found at the shortest distance.
  pathToNearest(searching, blocking, startRow, startCol, searchDistance) {
    const result = this.search(searching, blocking, startRow, startCol, searchDistance, true);
    if (result.found.size === 0) return { target: null, path: null, flooded: result.flooded };
    const best = [...result.found.values()].sort(
      (a, b) =>
        searching.indexOf(a.type) - searching.indexOf(b.type) ||
        result.dist[a.row][a.col] - result.dist[b.row][b.col]
    )[0];
    return {
      target: best,
      path: this.reconstruct(result.dist, best.row, best.col, null),
      flooded: result.flooded,
    };
  }

  reconstruct(dist, endRow, endCol, oldPath) {
    const path = [];
    let r = endRow;
    let c = endCol;
    let count = 0;
    while (dist[r][c] > 0) {
      path.push({ row: r, col: c });
      const curDist = dist[r][c];
      const cands = neighbours(r, c, this.height, this.width, this.orientation).filter(
        ([nr, nc]) => dist[nr][nc] > -1 && dist[nr][nc] < curDist
      );
      if (cands.length === 0) break;
      cands.sort((a, b) => {
        const da = this.oldPathDistance(a, oldPath, count);
        const db = this.oldPathDistance(b, oldPath, count);
        return da - db;
      });
      [r, c] = cands[0];
      count++;
    }
    return path.reverse();
  }

  oldPathDistance([r, c], oldPath, count) {
    // Port of GetNavResult's old-path preference: favour the neighbour
    // closest to where the old path was at this step from the end.
    if (oldPath && oldPath.length > 1 && count < oldPath.length - 1) {
      const pen = oldPath[oldPath.length - count - 2];
      return Math.hypot(pen.col - c, pen.row - r);
    }
    return 0;
  }

  // Port of Navigation.Flood: all cells reachable within `distance` steps.
  flood(floodInto, blocking, startRow, startCol, distance) {
    const result = this.search([], blocking, startRow, startCol, distance, false);
    return result.flooded;
  }

  // Hex distance (shortest path ignoring costs) between two cells.
  distance(r1, c1, r2, c2) {
    const result = this.search([], {}, r1, c1, 9999, false);
    return result.dist[r2][c2];
  }
}
