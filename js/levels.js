// Level loading: parse the Unity level JSON format (grid rows are
// space-separated type integers, row 0 = top) into the shape the engine
// expects. Accepts either the raw JSON or an already-parsed object.
export function parseLevel(raw) {
  let def = typeof raw === 'string' ? JSON.parse(raw) : raw;
  // Some files are wrapped in the LevelMeta shape ({ layout: {...}, stats }).
  if (def.layout) def = def.layout;
  const grid = def.grid.map((row) =>
    (typeof row === 'string' ? row.trim().split(/\s+/) : row).map((v) => parseInt(v, 10))
  );
  return {
    grid,
    orientation: def.orientation ?? 0,
    sleeping: !!def.sleeping,
    hidePathOnStart: !!def.hidePathOnStart,
    disableStepForward: !!def.disableStepForward,
    startWithCellsHidden: !!def.startWithCellsHidden,
    hints: (def.hints || []).map((h) => ({ X: h.X ?? h.x, Y: h.Y ?? h.y })),
    objectives: normalizeObjectives(def.objectives || {}),
    name: def.name || null,
    id: def.id || null,
  };
}

function normalizeObjectives(o) {
  const normalized = {
    ReachEdge: !!o.ReachEdge,
    ReachOldTimer: !!o.ReachOldTimer,
    SurvivalTurnCount: o.SurvivalTurnCount || 0,
    SurvivalTurnCountBonus: o.SurvivalTurnCountBonus || 0,
    BuildWallsNoMoreThan: o.BuildWallsNoMoreThan || 0,
    CollectItemObjectives: (o.CollectItemObjectives || []).map((c) => ({
      ItemType: c.ItemType,
      CollectAtLeast: c.CollectAtLeast || 0,
      CollectNoMoreThan: c.CollectNoMoreThan || 0,
      IsOptional: !!c.IsOptional,
    })),
    CollectOrder: o.CollectOrder || [],
    CollectOrderIsOwner: !!o.CollectOrderIsOwner,
  };
  // Unity's tutorial controller adds an edge objective to levels whose JSON
  // carries none (the tutorial levels: tut_0_0, tut_edge_*, tut_end_*,
  // level2). Without it the game is won vacuously after one turn, because
  // "all objectives complete" is true of an empty list — in Unity and here
  // (LINQ All / Array.every on []). Default those levels to pin-every-piggy.
  const hasAny =
    normalized.ReachEdge ||
    normalized.ReachOldTimer ||
    normalized.SurvivalTurnCount > 0 ||
    normalized.SurvivalTurnCountBonus > 0 ||
    normalized.BuildWallsNoMoreThan > 0 ||
    normalized.CollectItemObjectives.some((c) => c.CollectAtLeast > 0) ||
    normalized.CollectOrder.length > 0;
  if (!hasAny) normalized.ReachEdge = true;
  return normalized;
}

export async function loadLevelFile(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return parseLevel(await res.json());
}

export function serializeLevel(def) {
  return {
    grid: def.grid.map((row) => row.join(' ')),
    orientation: def.orientation ?? 0,
    sleeping: !!def.sleeping,
    hidePathOnStart: !!def.hidePathOnStart,
    disableStepForward: !!def.disableStepForward,
    startWithCellsHidden: !!def.startWithCellsHidden,
    hints: def.hints || [],
    objectives: def.objectives || {},
  };
}
