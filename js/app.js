// App wiring for index.html: menu (daily, random), play view,
// tap-to-preview / tap-to-commit input, HUD, best scores in localStorage.
import { Game } from './engine.js?v=46';
import { Renderer } from './render.js?v=46';
import { parseLevel } from './levels.js?v=46';
import { generateLevel, dailySeed, DEFAULT_CONFIG } from './generator.js?v=46';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'stillpoint-html-best';
const DONE_KEY = 'stillpoint-html-done';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
const done = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'));

let game = null;
let renderer = null;
let currentMeta = null; // {id, name, kind}
let rafId = null;
// The finish flag's in-flight timer (null when no multi-turn run is
// active). While set, the other game buttons and board taps are locked.
let finishTimer = null;

function saveProgress() {
  localStorage.setItem(BEST_KEY, JSON.stringify(best));
  localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
}

function showMenu() {
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
  $('menuView').style.display = 'block';
  $('playView').style.display = 'none';
  if (rafId) cancelAnimationFrame(rafId);
  document.title = 'Stillpoint — HTML prototype';
  // Back to the default blue in the phone browser chrome and the page.
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = '#4f6d82';
  setPageBg('#4f6d82');
  renderCrumbs(null);
}

// Breadcrumbs (Sam, Nov 27): the header is no longer a big title + nav
// — it's the path to where you are, so the game gets the vertical
// space. Home is a little house icon; tapping it goes home. The last
// crumb is the current page. Tapping "Random" generates a fresh seed,
// and tapping a factory name generates a fresh level in that factory.
function shortFactoryName(name) {
  // "Stage 3 — Waypoints" -> "Waypoints"; "Survival 1" stays as-is.
  const parts = String(name).split('—');
  return (parts.length > 1 ? parts[parts.length - 1] : name).trim();
}

function renderCrumbs(meta) {
  const nav = $('crumbs');
  const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 12h-3v9h-5v-6h-4v6H5v-9H2Z" fill="currentColor"/></svg>';
  const sep = '<span class="crumb-sep" aria-hidden="true">›</span>';
  const homeLink = `<a href="index.html" class="crumb home" aria-label="Home">${homeIcon}</a>`;
  const homeCurrent = `<span class="crumb home current" aria-current="page" aria-label="Home">${homeIcon}</span>`;
  const link = (href, label) => `<a href="${href}" class="crumb">${escapeHtml(label)}</a>`;
  const current = (label) => `<span class="crumb current" aria-current="page">${escapeHtml(label)}</span>`;
  if (!meta) {
    nav.innerHTML = homeCurrent;
    return;
  }
  let crumbs = homeLink;
  if (meta.kind === 'daily') {
    crumbs += sep + link('?daily', 'Daily') + sep + current(meta.seed);
  } else if (meta.kind === 'random') {
    if (meta.factory) {
      crumbs += sep + link('factories.html', 'Factories')
        + sep + link(`?random&factory=${encodeURIComponent(meta.factory)}`, shortFactoryName(meta.factoryName || meta.factory))
        + sep + current(`seed ${meta.seed}`);
    } else {
      crumbs += sep + link('?random', 'Random') + sep + current(`seed ${meta.seed}`);
    }
  } else if (meta.kind === 'draft') {
    crumbs += sep + link('editor.html', 'Editor') + sep + current('Draft');
  }
  nav.innerHTML = crumbs;
}

// The URL for a random level: the seed is part of it, so a refresh or
// a shared link replays this exact level (never a bare ?random).
function randomLevelUrl(factoryId, seed) {
  return `?random${factoryId ? `&factory=${encodeURIComponent(factoryId)}` : ''}&seed=${encodeURIComponent(seed)}`;
}

// The big Random button on the home screen plays with the last-used
// factory (or the Default config) — a fresh seed every tap.
function updateRandomHomeLink() {
  let factory = 'default';
  try { factory = localStorage.getItem(LAST_FACTORY_KEY) || 'default'; } catch { /* private mode */ }
  $('randomHomeBtn').href = factory !== 'default'
    ? `?random&factory=${encodeURIComponent(factory)}`
    : '?random';
}

// The page background follows the level's own background colour, so the
// whole document — the menu flash on load, the overscroll on a phone,
// any margin around the board — matches the board instead of staying
// the default blue. Reset by showMenu.
function setPageBg(color) {
  document.documentElement.style.setProperty('--bg', color);
}

function showPlay() {
  $('menuView').style.display = 'none';
  $('playView').style.display = 'flex';
  document.title = `${currentMeta?.name || 'Level'} — Stillpoint`;
}

function renderMenu() {
  updateRandomHomeLink();
}

// ---- Play ----

function startLevel(def, meta) {
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
  currentMeta = meta;
  game = new Game().loadLevel(def);
  game.hintsShown = false; // Unity only shows hints on demand (H / ? button)
  showPlay();
  // The phone browser chrome matches the level's background colour.
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = def.color || '#4f6d82';
  // So does the page background, and the breadcrumbs follow the level.
  setPageBg(def.color || '#4f6d82');
  renderCrumbs(meta);
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
    // Unity's objectives panel: hollow circle / green check, label in
    // white, numbers in yellow. A failed objective gets a red ✗ (and
    // red text); an optional one is dimmed, as Unity shows it at 0.4
    // alpha.
    li.className = [o.done ? 'done' : '', o.failed ? 'failed' : '', o.optional ? 'optional' : ''].filter(Boolean).join(' ');
    const mark = document.createElement('span');
    mark.className = o.done ? 'obj-check' : o.failed ? 'obj-fail' : '';
    mark.textContent = o.done ? '✓ ' : o.failed ? '✗ ' : '○ ';
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
  const flagRunning = finishTimer !== null;
  $('undoBtn').disabled = game.history.length === 0 || game.movesAnimating() || flagRunning;
  // The finish flag is Unity's 🏁 button: it runs while the game is in
  // play and no wall is being previewed (in preview mode the only way
  // to commit is tapping the previewed cell again). Levels with
  // disableFinishFlag hide it entirely, as Unity does.
  const flagBtn = $('flagBtn');
  flagBtn.style.display = game.def.disableFinishFlag ? 'none' : '';
  flagBtn.disabled = game.status !== 'playing' || !!game.previewState || game.movesAnimating() || flagRunning;
  // Step-forward also waits for the slides to land.
  $('stepBtn').disabled = !!game.def.disableStepForward || game.movesAnimating() || flagRunning;
  $('restartBtn').disabled = flagRunning;
  // Hint button: only when the level has hints; it pulses gently until
  // the player asks for them (Unity's hint button does the same).
  const hintBtn = $('hintBtn');
  const hasHints = (game.def.hints || []).length > 0;
  hintBtn.style.display = hasHints ? '' : 'none';
  hintBtn.classList.toggle('pulse', hasHints && !game.hintsShown);
  const banner = $('statusBanner');
  if (game.status === 'won') {
    banner.className = 'banner win';
    // On a factory level the win screen is also the way on: tapping
    // anywhere advances to the next level from the same factory, so
    // say so (Sam, Nov 27). Other levels have no tap-to-continue, so
    // the line stays off there.
    banner.textContent = `🎉 ${game.winReason || 'Level complete!'} — ${game.turn} moves.${currentMeta?.factory ? ' Tap anywhere to continue.' : ''}`;
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

// The finish flag (Unity: MenuController.FinishFlagButtonPressed ->
// UnitController.CommitTurns / CommitTurnsUntilWinOrLose): take turns
// with no move animation — characters jump to their next cell — one
// every 0.1s (Unity's MoveDelayNoAnimation), until the game ends, a
// player collects a waypoint (endpoint), a player reaches a pin, or
// 100 turns pass (Unity's MAX_TURNS). While it runs the other game
// buttons are disabled, like Unity's DisableGameButtonsWhileMoving.
// Previewing is not a way in: in preview mode the only way to commit
// is tapping the previewed cell again.
function startFinishFlag() {
  if (!game || game.status !== 'playing') return;
  if (game.def.disableFinishFlag || game.previewState) return;
  if (game.movesAnimating() || finishTimer !== null) return;
  let turns = 0;
  const MAX_TURNS = 100;
  const tick = () => {
    finishTimer = null;
    if (!game || game.status !== 'playing') { updateHUD(); return; }
    const took = game.stepForward({ animate: false, force: true });
    turns++;
    updateHUD();
    if (!took || game.status !== 'playing' || game.turnEvents.endpoint || game.turnEvents.pin || turns >= MAX_TURNS) return;
    finishTimer = setTimeout(tick, 100);
  };
  finishTimer = setTimeout(tick, 100);
  updateHUD();
}

// On a factory level, tapping anywhere after a win advances to the
// next level from the same factory (Sam, Nov 27). A fresh random seed
// each time; the factory doc is re-read so edited factories (localStorage
// overrides) carry over. The URL is kept in sync (replaceState, no
// reload) so a refresh replays the same level. If the factory can't
// generate (e.g. The End), stay on the win screen.
async function nextFactoryLevel() {
  const factoryId = currentMeta?.factory;
  if (!factoryId || !game || game.status !== 'won') return;
  const factory = await loadFactory(factoryId);
  if (!factory) return;
  const seed = String(Math.floor(Math.random() * 1e9));
  const cfg = { ...DEFAULT_CONFIG, ...factory.settings };
  const res = generateLevel(seed, cfg, factory.color || null);
  if (!res) return;
  try {
    history.replaceState(null, '', randomLevelUrl(factoryId, seed));
  } catch { /* file:// or sandboxed: the URL just doesn't update */ }
  startLevel(res.level, { id: `gen-${seed}`, name: `Random level — seed ${seed} (${factory.name})`, kind: 'random', factory: factoryId, seed, factoryName: factory.name });
}

function onBoardTap(ev) {
  // Unity blocks input while the turn's moves are still animating, and
  // while the finish flag is running its multi-turn.
  if (!game || game.movesAnimating() || finishTimer !== null) return;  const rect = $('board').getBoundingClientRect();
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
  renderMenu();

  if (params.has('daily')) {
    const seed = params.get('daily') || dailySeed();
    const res = generateLevel(seed, await loadConfig());
    if (!res) return showMenu();
    startLevel(res.level, { id: `daily-${seed}`, name: `Daily puzzle — ${seed}`, kind: 'daily', seed });
    return;
  }
  if (params.has('random') || params.has('gen')) {
    const seed = params.get('seed') || String(Math.floor(Math.random() * 1e9));
    const factoryId = params.get('factory');
    let cfg = await loadConfig();
    let factoryName = '';
    let factoryRawName = null;
    let factoryColor = null;
    if (factoryId) {
      const factory = await loadFactory(factoryId);
      if (factory) {
        cfg = { ...DEFAULT_CONFIG, ...factory.settings };
        factoryName = ` (${factory.name})`;
        factoryRawName = factory.name;
        factoryColor = factory.color || null;
      }
    }
    // The level takes its factory's chapter colour as its background.
    const res = generateLevel(seed, cfg, factoryColor);
    if (!res) return showMenu();
    // A bare ?random (or ?random&factory=) rolls a fresh seed — put it
    // in the URL so a refresh or a shared link replays this exact
    // level, the way the seed input and tap-anywhere chaining do.
    // A seed given in the URL is already there, so leave it alone.
    if (!params.get('seed')) {
      try {
        history.replaceState(null, '', randomLevelUrl(factoryId, seed));
      } catch { /* file:// or sandboxed: the URL just doesn't update */ }
    }
    startLevel(res.level, { id: `gen-${seed}`, name: `Random level — seed ${seed}${factoryName}`, kind: 'random', factory: factoryId || null, seed, factoryName: factoryRawName });
    return;
  }
  if (params.has('draft')) {
    const raw = localStorage.getItem('stillpoint-editor-draft');
    if (!raw) return showMenu();
    startLevel(parseLevel(JSON.parse(raw)), { id: 'draft', name: 'Editor draft (playtest)', kind: 'draft' });
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
  // The editor lives inside the collapsed "Random level options", so
  // open it — this is also the factories page's ?factory= entry point.
  $('randomOptions').open = true;
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
  // Tap anywhere after a win on a factory level to play the next one
  // from the same factory. Buttons and links keep their own actions
  // (undo the win, restart, navigate away) — only taps on the board,
  // the banner and the level strip advance.
  $('playView').addEventListener('click', (ev) => {
    if (!game || game.status !== 'won' || !currentMeta?.factory) return;
    if (ev.target.closest('button, a, input, select, textarea')) return;
    nextFactoryLevel();
  });
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
    // Unity binds the finish flag to F (KeyBindings.FinishFlag).
    if ((ev.key === 'f' || ev.key === 'F') && game) {
      // Don't hijack typing in a text field (the Random seed input).
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
      startFinishFlag();
    }
  });
  $('undoBtn').addEventListener('click', () => {
    if (game?.movesAnimating() || finishTimer !== null) return;
    if (game?.rewind()) updateHUD();
  });
  $('flagBtn').addEventListener('click', () => {
    if (game?.movesAnimating() || finishTimer !== null) return;
    startFinishFlag();
  });
  $('stepBtn').addEventListener('click', () => {
    if (game?.movesAnimating() || finishTimer !== null) return;
    if (game?.stepForward()) updateHUD();
  });
  $('restartBtn').addEventListener('click', () => {
    if (finishTimer !== null) return;
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
    updateRandomHomeLink();
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
