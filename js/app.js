// App wiring for index.html: menu (level list, daily, random), play view,
// tap-to-preview / tap-to-commit input, HUD, best scores in localStorage.
import { Game } from './engine.js?v=5';
import { Renderer } from './render.js?v=5';
import { parseLevel, loadLevelFile } from './levels.js?v=5';
import { generateLevel, dailySeed, DEFAULT_CONFIG } from './generator.js?v=5';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'stillpoint-html-best';
const DONE_KEY = 'stillpoint-html-done';

const best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
const done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'));

let game = null;
let renderer = null;
let currentMeta = null; // {id, name, kind}
let rafId = null;

function saveProgress() {
  localStorage.setItem(BEST_KEY, JSON.stringify(best));
  localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
}

function showMenu() {
  $('menuView').style.display = 'block';
  $('playView').style.display = 'none';
  if (rafId) cancelAnimationFrame(rafId);
  document.title = 'Stillpoint — HTML prototype';
}

function showPlay() {
  $('menuView').style.display = 'none';
  $('playView').style.display = 'block';
  document.title = `${currentMeta?.name || 'Level'} — Stillpoint`;
}

async function loadIndex() {
  try {
    const res = await fetch('levels/index.json');
    return await res.json();
  } catch {
    return { levels: [] };
  }
}

function renderMenu(index) {
  const list = $('levelList');
  list.innerHTML = '';
  for (const lvl of index.levels) {
    const el = document.createElement('a');
    el.className = 'level-item' + (done.has(lvl.id) ? ' done' : '');
    el.href = `?level=${encodeURIComponent(lvl.id)}`;
    const b = best[lvl.id];
    el.innerHTML = `<div class="name">${escapeHtml(lvl.name)}</div>
      <div class="meta">${escapeHtml(lvl.group || '')}${b ? ` · best ${b} moves` : ''}</div>`;
    list.appendChild(el);
  }
  const today = dailySeed();
  $('dailySeed').textContent = today;
  $('dailyLink').href = `?daily=${today}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ---- Play ----

function startLevel(def, meta) {
  currentMeta = meta;
  game = new Game().loadLevel(def);
  showPlay();
  $('levelName').textContent = meta.name;
  $('statusBanner').className = 'banner';
  $('statusBanner').textContent = '';
  $('stepBtn').disabled = !!def.disableStepForward;
  layoutBoard();
  updateHUD();
  if (rafId) cancelAnimationFrame(rafId);
  const loop = () => {
    renderer.draw(game, { showPaths: !def.hidePathOnStart || game.turn > 0 || game.previewState });
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function layoutBoard() {
  const canvas = $('board');
  const wrap = canvas.parentElement;
  const availW = Math.min(wrap.clientWidth, 780);
  const availH = Math.min(window.innerHeight - 260, 640);
  renderer = new Renderer(canvas);
  renderer.layout(game, Math.max(320, availW), Math.max(320, availH));
}

function updateHUD() {
  if (!game) return;
  $('turnLabel').textContent = `Turn ${game.turn}`;
  const list = $('objectives');
  list.innerHTML = '';
  const objs = game.objectiveList();
  if (objs.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Guide the piggy to its goal.';
    list.appendChild(li);
  }
  for (const o of objs) {
    const li = document.createElement('li');
    li.className = o.done ? 'done' : '';
    // Unity's objectives panel: hollow circle / green check, label in
    // white, numbers in yellow.
    const mark = document.createElement('span');
    mark.className = o.done ? 'obj-check' : '';
    mark.textContent = o.done ? '✓ ' : '○ ';
    li.appendChild(mark);
    const label = document.createElement('span');
    label.innerHTML = escapeHtml(o.label).replace(
      /\d+/g, (n) => `<span class="obj-num">${n}</span>`,
    );
    li.appendChild(label);
    if (o.progress) {
      const span = document.createElement('span');
      span.className = 'prog';
      span.textContent = ` ${o.progress}`;
      li.appendChild(span);
    }
    list.appendChild(li);
  }
  $('undoBtn').disabled = game.history.length === 0;
  // GO only does something while a wall preview is showing.
  $('goBtn').disabled = !game.previewState;
  const banner = $('statusBanner');
  if (game.status === 'won') {
    banner.className = 'banner win';
    banner.textContent = `🎉 ${game.winReason || 'Level complete!'} — ${game.turn} moves.`;
    if (currentMeta?.id) {
      done.add(currentMeta.id);
      if (!best[currentMeta.id] || game.turn < best[currentMeta.id]) {
        best[currentMeta.id] = game.turn;
      }
      saveProgress();
    }
  } else if (game.status === 'lost') {
    banner.className = 'banner lose';
    banner.textContent = `💥 ${game.loseReason || 'Level failed.'} Try rewinding a turn or restarting.`;
  } else {
    banner.className = 'banner';
    banner.textContent = '';
  }
}

function onBoardTap(ev) {
  if (!game) return;
  const rect = $('board').getBoundingClientRect();
  const x = (ev.clientX - rect.left) * ($('board').width / rect.width / window.devicePixelRatio);
  const y = (ev.clientY - rect.top) * ($('board').height / rect.height / window.devicePixelRatio);
  const cell = renderer.cellAt(x, y);
  if (!cell) {
    game.clearPreview();
    updateHUD();
    return;
  }
  game.preview(cell.row, cell.col);
  updateHUD();
}

async function startFromParams() {
  const params = new URLSearchParams(location.search);
  const index = await loadIndex();
  renderMenu(index);

  if (params.has('daily')) {
    const seed = params.get('daily') || dailySeed();
    const res = generateLevel(seed, await loadConfig());
    if (!res) return showMenu();
    startLevel(res.level, { id: `daily-${seed}`, name: `Daily puzzle — ${seed}`, kind: 'daily' });
    return;
  }
  if (params.has('random') || params.has('gen')) {
    const seed = params.get('seed') || String(Math.floor(Math.random() * 1e9));
    const res = generateLevel(seed, await loadConfig());
    if (!res) return showMenu();
    startLevel(res.level, { id: `gen-${seed}`, name: `Random level — seed ${seed}`, kind: 'random' });
    return;
  }
  if (params.has('draft')) {
    const raw = localStorage.getItem('stillpoint-editor-draft');
    if (!raw) return showMenu();
    startLevel(parseLevel(JSON.parse(raw)), { id: 'draft', name: 'Editor draft (playtest)', kind: 'draft' });
    return;
  }
  if (params.has('level')) {
    const id = params.get('level');
    const entry = index.levels.find((l) => l.id === id);
    if (!entry) return showMenu();
    const def = await loadLevelFile(entry.file);
    def.id = entry.id;
    def.name = entry.name;
    startLevel(def, { id: entry.id, name: entry.name, kind: 'level' });
    return;
  }
  showMenu();
}

async function loadConfig() {
  try {
    const res = await fetch('generator-config.json');
    const cfg = await res.json();
    return { ...DEFAULT_CONFIG, ...cfg };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ---- Boot ----

document.addEventListener('DOMContentLoaded', () => {
  $('board').addEventListener('click', onBoardTap);
  $('undoBtn').addEventListener('click', () => {
    if (game?.rewind()) updateHUD();
  });
  $('goBtn').addEventListener('click', () => {
    if (game?.commit()) updateHUD();
  });
  $('stepBtn').addEventListener('click', () => {
    if (game?.stepForward()) updateHUD();
  });
  $('restartBtn').addEventListener('click', () => {
    if (game) startLevel(game.def, currentMeta);
  });
  $('closeBtn').addEventListener('click', () => {
    history.pushState(null, '', location.pathname);
    startFromParams();
  });
  $('randomBtn').addEventListener('click', () => {
    const seed = $('randomSeed').value.trim() || String(Math.floor(Math.random() * 1e9));
    location.search = `?random&seed=${encodeURIComponent(seed)}`;
  });
  $('randomSeed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('randomBtn').click();
  });
  window.addEventListener('resize', () => {
    if (game && $('playView').style.display !== 'none') layoutBoard();
  });
  startFromParams();
});
