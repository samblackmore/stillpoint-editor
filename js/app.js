// App wiring for index.html: menu (level list, daily, random), play view,
// tap-to-preview / tap-to-commit input, HUD, best scores in localStorage.
import { Game } from './engine.js?v=31';
import { Renderer } from './render.js?v=31';
import { parseLevel, loadLevelFile } from './levels.js?v=31';
import { generateLevel, dailySeed, DEFAULT_CONFIG } from './generator.js?v=31';

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
  // Back to the default blue in the phone browser chrome.
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = '#4f6d82';
}

function showPlay() {
  $('menuView').style.display = 'none';
  $('playView').style.display = 'flex';
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
  game.hintsShown = false; // Unity only shows hints on demand (H / ? button)
  showPlay();
  // The phone browser chrome matches the level's background colour.
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = def.color || '#4f6d82';
  $('levelName').textContent = meta.name;
  $('statusBanner').className = 'banner';
  $('statusBanner').textContent = '';
  $('stepBtn').disabled = !!def.disableStepForward;
  layoutBoard();
  updateHUD();
  if (rafId) cancelAnimationFrame(rafId);
  // The turn's moves animate in the renderer (staggered slides); when
  // the last one lands, refresh the HUD so the buttons re-enable.
  let wasAnimating = false;
  const loop = () => {
    renderer.draw(game, { showPaths: !def.hidePathOnStart || game.turn > 0 || game.previewState });
    const animating = game.movesAnimating();
    if (wasAnimating && !animating) updateHUD();
    wasAnimating = animating;
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function layoutBoard() {
  // The board fills the play view below the header, so size it from the
  // board-wrap's actual box (not a fixed cap) — it grows and shrinks
  // with the viewport.
  const canvas = $('board');
  const wrap = canvas.parentElement;
  const availW = wrap.clientWidth;
  const availH = wrap.clientHeight;
  renderer = new Renderer(canvas);
  renderer.layout(game, Math.max(320, availW), Math.max(320, availH));
}

function updateHUD() {
  if (!game) return;
  $('turnLabel').innerHTML = `Turn <span class="obj-num">${game.turn}</span>`;
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
      span.innerHTML = ` ${escapeHtml(o.progress).replace(
        /\d+/g, (n) => `<span class="obj-num">${n}</span>`,
      )}`;
      li.appendChild(span);
    }
    list.appendChild(li);
  }
  $('undoBtn').disabled = game.history.length === 0 || game.movesAnimating();
  // GO only does something while a wall preview is showing.
  $('goBtn').disabled = !game.previewState || game.movesAnimating();
  // Step-forward also waits for the slides to land.
  $('stepBtn').disabled = !!game.def.disableStepForward || game.movesAnimating();
  // Hint button: only when the level has hints; it pulses gently until
  // the player asks for them (Unity's hint button does the same).
  const hintBtn = $('hintBtn');
  const hasHints = (game.def.hints || []).length > 0;
  hintBtn.style.display = hasHints ? '' : 'none';
  hintBtn.classList.toggle('pulse', hasHints && !game.hintsShown);
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
  // Unity blocks input while the turn's moves are still animating.
  if (!game || game.movesAnimating()) return;
  const rect = $('board').getBoundingClientRect();
  const x = (ev.clientX - rect.left) * ($('board').width / rect.width / window.devicePixelRatio);
  const y = (ev.clientY - rect.top) * ($('board').height / rect.height / window.devicePixelRatio);
  const cell = renderer.cellAt(x, y);
  if (!cell) {
    game.clearPreview();
    updateHUD();
    return;
  }
  // Tapping a hint marker dismisses all hints (HintMarkerTap) instead
  // of previewing a wall there.
  if (game.hintsShown && (game.def.hints || []).some((h) => h.Y === cell.row && h.X === cell.col)) {
    game.hintsShown = false;
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
    const factoryId = params.get('factory');
    let cfg = await loadConfig();
    let factoryName = '';
    let factoryColor = null;
    if (factoryId) {
      const factory = await loadFactory(factoryId);
      if (factory) {
        cfg = { ...DEFAULT_CONFIG, ...factory.settings };
        factoryName = ` (${factory.name})`;
        factoryColor = factory.color || null;
      }
    }
    // The level takes its factory's chapter colour as its background.
    const res = generateLevel(seed, cfg, factoryColor);
    if (!res) return showMenu();
    startLevel(res.level, { id: `gen-${seed}`, name: `Random level — seed ${seed}${factoryName}`, kind: 'random' });
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
  // The factories page links here with ?factory=<id>: preselect that
  // factory in the Random card and open its settings, so the card you
  // tapped is the one you're looking at.
  const factoryId = params.get('factory');
  if (factoryId) {
    const factory = await loadFactory(factoryId);
    if (factory) {
      try { localStorage.setItem(LAST_FACTORY_KEY, factoryId); } catch { /* private mode */ }
      const sel = $('factorySelect');
      if ([...sel.options].some((o) => o.value === factoryId)) sel.value = factoryId;
      showFactoryInEditor(factory);
    }
  }
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

// ---- Factories ----
// A factory is a per-chapter generator preset (factories/<id>.json).
// Saved edits live in localStorage as full settings objects, keyed by
// factory id; custom factories (created with "Save as new") live there
// too, as whole factory docs. The shipped JSON files are never touched
// by the browser — Download JSON is the way back into the repo.
const FACTORY_OVERRIDE_KEY = 'stillpoint-factory-overrides';
const CUSTOM_FACTORY_KEY = 'stillpoint-custom-factories';
const LAST_FACTORY_KEY = 'stillpoint-last-factory';
let factoryIndex = null;

function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}
function writeStore(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* private mode */ }
}

async function loadFactoryIndex() {
  if (factoryIndex) return factoryIndex;
  try {
    const res = await fetch('factories/index.json');
    factoryIndex = await res.json();
  } catch {
    factoryIndex = { factories: [] };
  }
  return factoryIndex;
}

// 'default' is generator-config.json; custom ids come from localStorage;
// anything else is a shipped factories/<id>.json. A saved override
// replaces the shipped settings for that factory.
async function loadFactory(id) {
  const overrides = readStore(FACTORY_OVERRIDE_KEY);
  const custom = readStore(CUSTOM_FACTORY_KEY);
  if (custom[id]) return { ...custom[id], custom: true };
  if (id === 'default') {
    const settings = await loadConfig();
    return {
      id: 'default', name: 'Default',
      theme: 'The plain generator config.',
      settings: overrides.default || settings, custom: false,
    };
  }
  try {
    const res = await fetch(`factories/${encodeURIComponent(id)}.json`);
    const doc = await res.json();
    if (overrides[id]) doc.settings = overrides[id];
    return { ...doc, custom: false };
  } catch {
    return null;
  }
}

async function renderFactorySelect(keepId) {
  const index = await loadFactoryIndex();
  const custom = readStore(CUSTOM_FACTORY_KEY);
  const overrides = readStore(FACTORY_OVERRIDE_KEY);
  const sel = $('factorySelect');
  sel.innerHTML = '';
  const addOpt = (group, id, name) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name + (overrides[id] ? ' (edited)' : '');
    group.appendChild(opt);
  };
  const shipped = document.createElement('optgroup');
  shipped.label = 'Factories';
  addOpt(shipped, 'default', 'Default');
  for (const f of index.factories) addOpt(shipped, f.id, f.name);
  sel.appendChild(shipped);
  const customs = Object.values(custom);
  if (customs.length) {
    const group = document.createElement('optgroup');
    group.label = 'My factories';
    for (const f of customs) addOpt(group, f.id, f.name);
    sel.appendChild(group);
  }
  const want = keepId || localStorage.getItem(LAST_FACTORY_KEY);
  if (want && [...sel.options].some((o) => o.value === want)) sel.value = want;
}

function fillFactoryForm(settings) {
  const set = (id, v) => { $(id).value = v; };
  const setRange = (minId, maxId, r) => { set(minId, r.min); set(maxId, r.max); };
  setRange('fWidthMin', 'fWidthMax', settings.width);
  setRange('fHeightMin', 'fHeightMax', settings.height);
  setRange('fSeedsMin', 'fSeedsMax', settings.wallSeedCount);
  $('fDensity').value = settings.wallDensity;
  set('fPlayers', settings.playerCount);
  setRange('fEnemyMin', 'fEnemyMax', settings.enemyCount);
  setRange('fEndMin', 'fEndMax', settings.endPoints);
  set('fEndMust', settings.endPoints.mustCollectAtLeast);
  setRange('fLureMin', 'fLureMax', settings.lures);
  setRange('fDiamMin', 'fDiamMax', settings.collectables);
  set('fDiamMust', settings.collectables.mustCollectAtLeast);
  setRange('fSurvMin', 'fSurvMax', settings.survivalTurnCount);
  $('fOrder').checked = !!settings.orderObjective;
  $('fEdgeTop').checked = !!settings.edgeTop;
  $('fEdgeBottom').checked = !!settings.edgeBottom;
  $('fEdgeLeft').checked = !!settings.edgeLeft;
  $('fEdgeRight').checked = !!settings.edgeRight;
}

function readFactoryForm(base) {
  const num = (id, fallback) => {
    const v = parseInt($(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  };
  const range = (minId, maxId, r) => {
    const min = num(minId, r.min), max = num(maxId, r.max);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  };
  const items = (minId, maxId, mustId, it) => ({
    ...range(minId, maxId, it),
    mustCollectAtLeast: Math.min(num(mustId, it.mustCollectAtLeast || 0), num(maxId, it.max)),
    canCollectNoMoreThan: it.canCollectNoMoreThan || 0,
  });
  const s = { ...base };
  s.width = range('fWidthMin', 'fWidthMax', base.width);
  s.height = range('fHeightMin', 'fHeightMax', base.height);
  s.wallSeedCount = range('fSeedsMin', 'fSeedsMax', base.wallSeedCount);
  s.wallDensity = $('fDensity').value;
  s.playerCount = Math.max(1, Math.min(2, num('fPlayers', base.playerCount)));
  s.enemyCount = range('fEnemyMin', 'fEnemyMax', base.enemyCount);
  s.endPoints = items('fEndMin', 'fEndMax', 'fEndMust', base.endPoints);
  s.lures = range('fLureMin', 'fLureMax', base.lures);
  s.collectables = items('fDiamMin', 'fDiamMax', 'fDiamMust', base.collectables);
  s.survivalTurnCount = range('fSurvMin', 'fSurvMax', base.survivalTurnCount);
  s.orderObjective = $('fOrder').checked;
  s.edgeTop = $('fEdgeTop').checked;
  s.edgeBottom = $('fEdgeBottom').checked;
  s.edgeLeft = $('fEdgeLeft').checked;
  s.edgeRight = $('fEdgeRight').checked;
  return s;
}

let editingFactory = null;

function showFactoryInEditor(factory) {
  editingFactory = factory;
  const settings = { ...DEFAULT_CONFIG, ...factory.settings };
  const edited = !factory.custom && !!readStore(FACTORY_OVERRIDE_KEY)[factory.id];
  $('factoryEditName').innerHTML = `${escapeHtml(factory.name)}${edited ? ' <span class="tag-edited">edited</span>' : ''}`;
  $('factoryEditTheme').textContent = factory.theme || '';
  fillFactoryForm(settings);
  $('factoryEditor').hidden = false;
  $('factoryResetBtn').textContent = factory.custom ? 'Delete factory' : 'Reset to shipped';
}

async function openFactoryEditor() {
  const factory = await loadFactory($('factorySelect').value);
  if (!factory) return;
  $('factoryEditStatus').textContent = '';
  showFactoryInEditor(factory);
}

// ---- Boot ----

document.addEventListener('DOMContentLoaded', () => {
  $('board').addEventListener('click', onBoardTap);
  // Hints (MenuController.ShowHints): H key or the ? button shows the
  // level's hint markers; tapping one dismisses them (see onBoardTap).
  const showHints = () => {
    if (!game || !(game.def.hints || []).length) return;
    game.hintsShown = true;
    updateHUD();
  };
  $('hintBtn').addEventListener('click', showHints);
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === 'h' || ev.key === 'H') && game) showHints();
  });
  $('undoBtn').addEventListener('click', () => {
    if (game?.movesAnimating()) return;
    if (game?.rewind()) updateHUD();
  });
  $('goBtn').addEventListener('click', () => {
    if (game?.movesAnimating()) return;
    if (game?.commit()) updateHUD();
  });
  $('stepBtn').addEventListener('click', () => {
    if (game?.movesAnimating()) return;
    if (game?.stepForward()) updateHUD();
  });
  $('restartBtn').addEventListener('click', () => {
    if (game) startLevel(game.def, currentMeta);
  });
  // Header colour toggle (white / player yellow), remembered across
  // visits. No close button on the game screen any more — the header
  // nav and the browser back button cover going back.
  const THEME_KEY = 'stillpoint-header-theme';
  const header = $('siteHeader');
  const applyTheme = (theme) => {
    header.classList.toggle('theme-white', theme === 'white');
    header.classList.toggle('theme-yellow', theme === 'yellow');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  };
  $('themeToggle').addEventListener('click', () => {
    applyTheme(header.classList.contains('theme-white') ? 'yellow' : 'white');
  });
  let savedTheme = 'white';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'white'; } catch { /* private mode */ }
  applyTheme(savedTheme === 'yellow' ? 'yellow' : 'white');
  $('randomBtn').addEventListener('click', () => {
    const seed = $('randomSeed').value.trim() || String(Math.floor(Math.random() * 1e9));
    const factory = $('factorySelect').value;
    try { localStorage.setItem(LAST_FACTORY_KEY, factory); } catch { /* private mode */ }
    location.search = `?random&seed=${encodeURIComponent(seed)}${factory !== 'default' ? `&factory=${encodeURIComponent(factory)}` : ''}`;
  });
  $('randomSeed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('randomBtn').click();
  });
  // Factory picker + editor (Random card).
  renderFactorySelect();
  $('factorySelect').addEventListener('change', () => {
    try { localStorage.setItem(LAST_FACTORY_KEY, $('factorySelect').value); } catch { /* private mode */ }
    if (!$('factoryEditor').hidden) openFactoryEditor();
  });
  $('editFactoryBtn').addEventListener('click', () => {
    if ($('factoryEditor').hidden) openFactoryEditor();
    else $('factoryEditor').hidden = true;
  });
  $('factorySaveBtn').addEventListener('click', async () => {
    if (!editingFactory) return;
    const settings = readFactoryForm({ ...DEFAULT_CONFIG, ...editingFactory.settings });
    if (editingFactory.custom) {
      const custom = readStore(CUSTOM_FACTORY_KEY);
      custom[editingFactory.id] = { ...editingFactory, settings };
      writeStore(CUSTOM_FACTORY_KEY, custom);
    } else {
      const overrides = readStore(FACTORY_OVERRIDE_KEY);
      overrides[editingFactory.id] = settings;
      writeStore(FACTORY_OVERRIDE_KEY, overrides);
    }
    editingFactory.settings = settings;
    await renderFactorySelect(editingFactory.id);
    showFactoryInEditor(editingFactory);
    $('factoryEditStatus').textContent = 'Saved — generating from this factory now uses your settings.';
  });
  $('factorySaveAsBtn').addEventListener('click', async () => {
    if (!editingFactory) return;
    const name = prompt('Name for the new factory:', `${editingFactory.name} (copy)`);
    if (!name || !name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'factory';
    const id = `custom-${slug}-${Date.now().toString(36)}`;
    const doc = {
      id, name: name.trim(), chapter: '', theme: `Based on ${editingFactory.name}.`,
      color: editingFactory.color || '#5F869F', sourceLevels: [],
      generatable: true,
      settings: readFactoryForm({ ...DEFAULT_CONFIG, ...editingFactory.settings }),
    };
    const custom = readStore(CUSTOM_FACTORY_KEY);
    custom[id] = doc;
    writeStore(CUSTOM_FACTORY_KEY, custom);
    await renderFactorySelect(id);
    showFactoryInEditor({ ...doc, custom: true });
    $('factoryEditStatus').textContent = `Saved as "${doc.name}" — it now appears under My factories.`;
  });
  $('factoryResetBtn').addEventListener('click', async () => {
    if (!editingFactory) return;
    if (editingFactory.custom) {
      if (!confirm(`Delete the custom factory "${editingFactory.name}"?`)) return;
      const custom = readStore(CUSTOM_FACTORY_KEY);
      delete custom[editingFactory.id];
      writeStore(CUSTOM_FACTORY_KEY, custom);
      $('factoryEditor').hidden = true;
      await renderFactorySelect('default');
      return;
    }
    const overrides = readStore(FACTORY_OVERRIDE_KEY);
    delete overrides[editingFactory.id];
    writeStore(FACTORY_OVERRIDE_KEY, overrides);
    await openFactoryEditor();
    await renderFactorySelect(editingFactory.id);
    $('factoryEditStatus').textContent = 'Reset — back to the shipped settings.';
  });
  $('factoryDownloadBtn').addEventListener('click', () => {
    if (!editingFactory) return;
    const doc = { ...editingFactory, settings: readFactoryForm({ ...DEFAULT_CONFIG, ...editingFactory.settings }) };
    delete doc.custom;
    const blob = new Blob([JSON.stringify(doc, null, 1) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${editingFactory.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('factoryEditStatus').textContent = 'Downloaded — commit the file to factories/ to ship it.';
  });
  window.addEventListener('resize', () => {
    if (game && $('playView').style.display !== 'none') layoutBoard();
  });
  startFromParams();
});
