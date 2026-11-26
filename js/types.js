// Object types — numeric values match the Unity enum (LevelObjectType.cs)
// so level JSON files are interchangeable with the Unity game.
export const T = {
  NONE: -1,
  EMPTY: 0,
  WALL: 1,
  PULL: 2,
  PLAYER: 3,
  ENEMY: 4,
  ENDPOINT: 5,
  LURE: 6,
  WAYPOINT: 7,
  FREEZE: 8,
  FLOOD: 9,
  SNOW: 10,
  BOMB: 11,
  DIGGER: 12,
  COLLECTABLE: 13,
  EDGE: 14,
  BEDROCK: 15,
  BOMB6: 16,
  BOMB9: 17,
  PIN: 18,
  OBSTACLE: 19,
  OLDTIMER: 20,
};

export const TYPE_NAME = Object.fromEntries(
  Object.entries(T).map(([k, v]) => [v, k])
);

// Which types spawn characters (as opposed to terrain / items).
export const CHARACTER_KINDS = {
  [T.PLAYER]: 'player',
  [T.ENEMY]: 'enemy',
  [T.BOMB]: 'bomb',
  [T.BOMB6]: 'bomb',
  [T.BOMB9]: 'bomb',
  [T.PULL]: 'pull',
  [T.DIGGER]: 'digger',
};

// Item types a character can pick up by stepping on the cell. Waypoints
// count too: Unity's Waypoint.CanBePickedUp is true, so the piggy
// collects the waypoint on arrival and moves on to its next target —
// without this the waypoint sat in terrain (code 7) and never rendered
// as an item, and the piggy got stuck re-targeting it.
export const ITEM_TYPES = new Set([T.ENDPOINT, T.COLLECTABLE, T.LURE, T.WAYPOINT]);

// Types that sit on a cell without being collected or moving. The OldTimer
// is an Item in Unity (not a Character): the player paths toward it and the
// ReachOldTimer objective completes when a player stands on its cell.
export const STATIC_ITEM_TYPES = new Set([T.OLDTIMER]);

// Per-character pathing rules, ported from Player.cs / Enemy.cs /
// BombEnemy.cs / PullEnemy.cs / NeutralDigger.cs.
//   searching: target types, in priority order
//   blocking: type -> cost (-1 = impassable, otherwise extra path cost)
//   searchDistance: how far the Dijkstra flood may reach
//   sleepRange: wake when a player is within this distance (-1 = never sleeps)
//   stopOn: cell types the character stops on once reached
//   canMoveAfterDestroyWall: digger-style behaviour (destroys a wall it steps into)
export const RULES = {
  player: {
    searching: [T.PULL, T.WAYPOINT, T.ENDPOINT, T.LURE, T.EDGE, T.PIN, T.OLDTIMER],
    stopOn: [T.PIN],
    blocking: {
      [T.ENEMY]: 10, [T.BOMB]: -1, [T.PLAYER]: 10, [T.DIGGER]: 10,
      [T.FREEZE]: -1, [T.WALL]: -1, [T.OBSTACLE]: 1, [T.BEDROCK]: -1,
    },
    searchDistance: 999,
    sleepRange: -1,
    canMoveAfterDestroyWall: true,
  },
  enemy: {
    searching: [T.LURE, T.PLAYER, T.PULL],
    stopOn: [],
    blocking: {
      [T.COLLECTABLE]: 10, [T.ENDPOINT]: -1, [T.BEDROCK]: -1, [T.EDGE]: -1,
      [T.PIN]: -1, [T.ENEMY]: 10, [T.BOMB]: -1, [T.DIGGER]: -1, [T.WALL]: -1,
    },
    searchDistance: 35,
    sleepRange: 10,
    canMoveAfterDestroyWall: true,
  },
  bomb: {
    searching: [],
    stopOn: [],
    blocking: {
      [T.ENEMY]: -1, [T.BOMB]: -1, [T.DIGGER]: -1, [T.FREEZE]: -1, [T.WALL]: 15,
    },
    searchDistance: 35,
    sleepRange: -1,
    canMoveAfterDestroyWall: false,
  },
  pull: {
    searching: [],
    stopOn: [],
    blocking: {},
    searchDistance: 20,
    sleepRange: -1,
    canMoveAfterDestroyWall: false,
  },
  digger: {
    searching: [T.WALL],
    stopOn: [],
    blocking: {
      [T.BEDROCK]: -1, [T.PLAYER]: -1, [T.ENEMY]: -1, [T.BOMB]: -1, [T.DIGGER]: -1,
    },
    searchDistance: 20,
    sleepRange: -1,
    canMoveAfterDestroyWall: true,
  },
};
