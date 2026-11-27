// Level editor: paint cells on a hex grid, set objectives, export the same
// JSON format the game (and Unity) loads. Playtest runs the draft in the
// game via localStorage.
import { T } from './types.js?v=38';
import { Game } from './engine.js?v=38';
import { Renderer } from './render.js?v=38';
import { parseLevel, serializeLevel } from './levels.js?v=38';

const $ = (id) => document.getElementById(id);

const TOOLS = [
  { type: T.EMPTY, label: 'Empty', swatch: '#fffdf6' },
  { type: T.WALL, label: 'Wall', swatch: '#3d405b' },
  { type: T.PLAYER, label: 'Piggy (player)', swatch: '#e5989b' },
  { type: T.ENEMY, label: 'Enemy', swatch: '#6d6875' },
  // Bomb enemy and Digger are disabled for now (Sam, Nov 27 — neither
  // mechanic was ever settled in Unity), so they have no tool here.
  // The kinds, rendering and engine rules stay, so either can be
  // revived by re-adding its line below.
  { type: T.ENDPOINT, label: 'Endpoint', swatch: '#70a83b' },
  { type: T.WAYPOINT, label: 'Waypoint', swatch: '#ffbe00' },
  { type: T.COLLECTABLE, label: 'Diamond', swatch: '#e9a319' },
  { type: T.LURE, label: 'Lure', swatch: '#e76f51' },
  { type: T.PIN, label: 'Pin', swatch: '#9b5de5' },
  { type: T.EDGE, label: 'Edge', swatch: '#2b2d42' },
  { type: T.SNOW, label: 'Snow', swatch: '#dceef5' },
  { type: T.OBSTACLE, label: 'Obstacle', swatch: '#b7b7a4' },
  { type: T.BEDROCK, label: 'Bedrock', swatch: '#1d3557' },
];

let tool = T.WALL;
let game = null;
let renderer = null;
let width = 9;
let height = 9;

function currentDef() {
  return {
    grid: game ? game.def.grid : blankGrid(),
    orientation: 0,
    sleeping: $('sleeping').checked,
    disableStepForward: $('noStep').checked,
    hints: [],
    objectives: readObjectives(),
  };
}

function blankGrid() {
  return Array.from({ length: height }, () => new Array(width).fill(T.EMPTY));
}

function readObjectives() {
  const o = {};
  if ($('reachEdge').checked) o.ReachEdge = true;
  const survive = parseInt($('survive').value, 10);
  if (survive > 0) o.SurvivalTurnCount = survive;
  const collect = [];
  const ep = parseInt($('collectEndpoint').value, 10);
  const col = parseInt($('collectDiamond').value, 10);
  const lure = parseInt($('collectLure').value, 10);
  if (ep > 0) collect.push({ ItemType: T.ENDPOINT, CollectAtLeast: ep, CollectNoMoreThan: 0 });
  if (col > 0) collect.push({ ItemType: T.COLLECTABLE, CollectAtLeast: col, CollectNoMoreThan: 0 });
  if (lure > 0) collect.push({ ItemType: T.LURE, CollectAtLeast: lure, CollectNoMoreThan: 0 });
  if (collect.length) o.CollectItemObjectives = collect;
  return o;
}

function render() {
  const def = currentDef();
  game = new Game().loadLevel(parseLevel(def));
  const canvas = $('board');
  renderer = new Renderer(canvas);
  const wrap = canvas.parentElement;
  renderer.layout(game, Math.min(wrap.clientWidth - 24, 780), Math.min(window.innerHeight - 300, 600));
  renderer.draw(game, { showPaths: true, stagger: false });
  $('jsonOut').value = JSON.stringify(serializeLevel(parseLevel(def)), null, 1);
}

function paintAt(ev) {
  if (!game) return;
  const rect = $('board').getBoundingClientRect();
  const x = (ev.clientX - rect.left) * ($('board').width / rect.width / window.devicePixelRatio);
  const y = (ev.clientY - rect.top) * ($('board').height / rect.height / window.devicePixelRatio);
  const cell = renderer.cellAt(x, y);
  if (!cell) return;
  const def = currentDef();
  def.grid[cell.row][cell.col] = tool;
  // Rebuild the game from the edited grid.
  game = new Game().loadLevel(parseLevel(def));
  renderer.draw(game, { showPaths: true, stagger: false });
  $('jsonOut').value = JSON.stringify(serializeLevel(parseLevel(def)), null, 1);
}

function buildPalette() {
  const pal = $('palette');
  pal.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'btn tool' + (t.type === tool ? ' selected' : '');
    b.innerHTML = `<span class="swatch" style="background:${t.swatch}"></span> ${t.label}`;
    b.addEventListener('click', () => {
      tool = t.type;
      buildPalette();
    });
    pal.appendChild(b);
  }
}

function resizeGrid() {
  width = Math.max(3, Math.min(20, parseInt($('gridW').value, 10) || 9));
  height = Math.max(3, Math.min(20, parseInt($('gridH').value, 10) || 9));
  const def = currentDef();
  const grid = Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => (def.grid[r] && def.grid[r][c] !== undefined ? def.grid[r][c] : T.EMPTY))
  );
  game = new Game().loadLevel(parseLevel({ ...def, grid }));
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  buildPalette();
  render();
  $('board').addEventListener('click', paintAt);
  $('gridW').addEventListener('change', resizeGrid);
  $('gridH').addEventListener('change', resizeGrid);
  for (const id of ['reachEdge', 'survive', 'collectEndpoint', 'collectDiamond', 'collectLure', 'sleeping', 'noStep']) {
    $(id).addEventListener('change', render);
  }
  $('downloadBtn').addEventListener('click', () => {
    const blob = new Blob([$('jsonOut').value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ($('levelName').value.trim() || 'level') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('jsonOut').value);
    $('copyBtn').textContent = 'Copied ✓';
    setTimeout(() => { $('copyBtn').textContent = 'Copy JSON'; }, 1500);
  });
  $('playtestBtn').addEventListener('click', () => {
    localStorage.setItem('stillpoint-editor-draft', $('jsonOut').value);
    window.open('index.html?draft', '_blank');
  });
  $('importBtn').addEventListener('click', () => {
    try {
      const def = parseLevel(JSON.parse($('jsonOut').value));
      width = def.grid[0].length;
      height = def.grid.length;
      $('gridW').value = width;
      $('gridH').value = height;
      $('reachEdge').checked = !!def.objectives.ReachEdge;
      $('survive').value = def.objectives.SurvivalTurnCount || 0;
      $('sleeping').checked = !!def.sleeping;
      $('noStep').checked = !!def.disableStepForward;
      game = new Game().loadLevel(def);
      render();
    } catch (e) {
      alert('Could not parse that JSON: ' + e.message);
    }
  });
  $('fileInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    $('jsonOut').value = await f.text();
    $('importBtn').click();
  });
  window.addEventListener('resize', render);
});
