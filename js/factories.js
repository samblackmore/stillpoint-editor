// Factories page — a card per generator factory, with icon chips for
// what it contains. Data comes from factories/index.json + one JSON per
// factory; saved edits and custom factories come from the same
// localStorage keys the menu's factory editor uses.
const THEME_KEY = 'stillpoint-header-theme';
const FACTORY_OVERRIDE_KEY = 'stillpoint-factory-overrides';
const CUSTOM_FACTORY_KEY = 'stillpoint-custom-factories';

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

// Header colour toggle (same as the menu page).
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

// ---- Icons (inline SVG, 14px) ----
const svg = (inner, fill) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" ${fill ? `fill="${fill}"` : ''}>${inner}</svg>`;
const ICONS = {
  circle: (color) => svg(`<circle cx="8" cy="8" r="6"/>`, color),
  diamond: () => svg(`<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>`, '#44d6a0'),
  hexRing: (color) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" fill="none" stroke="${color}" stroke-width="2"/></svg>`,
  grid: () => svg(`<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/>`, 'currentColor'),
  wall: () => svg(`<polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6"/>`, 'rgba(255,255,255,0.4)'),
  clock: () =>
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.4 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  order: () =>
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  edge: () =>
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
};

// A min–max range: equal ends show as ×N ("×1"), different ends as "1–3".
const rangeText = (r) => (r.min === r.max ? `×${r.min}` : `${r.min}–${r.max}`);
const sizeText = (w, h) => {
  const fw = w.min === w.max ? `${w.min}` : `${w.min}–${w.max}`;
  const fh = h.min === h.max ? `${h.min}` : `${h.min}–${h.max}`;
  return `${fw} × ${fh}`;
};
const itemText = (it) => {
  const t = rangeText(it);
  return it.mustCollectAtLeast > 0 ? `${t} · ≥${it.mustCollectAtLeast}` : t;
};

function chipsFor(s) {
  const chips = [];
  const chip = (icon, text, label) =>
    chips.push(`<span class="chip" title="${escapeHtml(label)}">${icon}<span>${escapeHtml(text)}</span></span>`);
  chip(ICONS.grid(), sizeText(s.width, s.height), `Grid size: ${sizeText(s.width, s.height)}`);
  chip(ICONS.circle('#ffc700'), `×${s.playerCount}`, `Players: ${s.playerCount}`);
  if (s.enemyCount.max > 0) {
    chip(ICONS.circle('#f57a81'), rangeText(s.enemyCount), `Enemies: ${s.enemyCount.min} to ${s.enemyCount.max}`);
  }
  if (s.endPoints.max > 0) {
    chip(ICONS.hexRing('#44d6a0'), itemText(s.endPoints), `Endpoints: ${s.endPoints.min} to ${s.endPoints.max}`);
  }
  if (s.lures.max > 0) {
    chip(ICONS.hexRing('#f57a81'), rangeText(s.lures), `Lures: ${s.lures.min} to ${s.lures.max}`);
  }
  if (s.collectables.max > 0) {
    chip(ICONS.diamond(), itemText(s.collectables), `Diamonds: ${s.collectables.min} to ${s.collectables.max}`);
  }
  chip(ICONS.wall(), `${rangeText(s.wallSeedCount)} · ${s.wallDensity}`,
    `Wall seeds: ${s.wallSeedCount.min} to ${s.wallSeedCount.max}, ${s.wallDensity} density`);
  if (s.survivalTurnCount.max > 0) {
    const t = s.survivalTurnCount;
    chip(ICONS.clock(), t.min === t.max ? `${t.min} turns` : `${t.min}–${t.max} turns`,
      `Survive: ${t.min} to ${t.max} turns`);
  }
  if (s.orderObjective) chip(ICONS.order(), 'ordered', 'Diamonds must be collected in order');
  if (s.edgeTop || s.edgeBottom || s.edgeLeft || s.edgeRight) {
    chip(ICONS.edge(), 'edge border', 'The board is ringed with edge cells');
  }
  return chips.join('');
}

function cardHtml(factory, { edited = false, custom = false } = {}) {
  const s = factory.settings;
  const badges = [];
  if (edited) badges.push('<span class="tag-edited">edited</span>');
  if (custom) badges.push('<span class="tag-custom">custom</span>');
  if (factory.generatable === false) badges.push('<span class="tag-dead">not generatable</span>');
  const actions = factory.generatable === false
    ? `<p class="factory-note">${escapeHtml((factory.gaps && factory.gaps[0]) || 'Not generatable.')}</p>`
    : `<div class="factory-actions"><a class="btn primary" href="index.html?random&amp;factory=${encodeURIComponent(factory.id)}">Generate →</a></div>`;
  return `<article class="factory-card">
    <h3><span class="factory-color" style="--fc:${escapeHtml(factory.color || '#5F869F')}"></span><a href="index.html?factory=${encodeURIComponent(factory.id)}">${escapeHtml(factory.name)}</a>${badges.join('')}</h3>
    <p class="factory-theme">${escapeHtml(factory.theme || '')}</p>
    <div class="factory-chips">${chipsFor(s)}</div>
    ${actions}
  </article>`;
}

async function load() {
  let index = { factories: [] };
  try {
    index = await fetch('factories/index.json').then((r) => r.json());
  } catch { /* no factories yet */ }
  const overrides = readStore(FACTORY_OVERRIDE_KEY);
  const custom = readStore(CUSTOM_FACTORY_KEY);

  const docs = [];
  for (const entry of index.factories) {
    try {
      const doc = await fetch(`factories/${encodeURIComponent(entry.id)}.json`).then((r) => r.json());
      if (overrides[doc.id]) doc.settings = overrides[doc.id];
      docs.push({ doc, edited: !!overrides[doc.id] });
    } catch { /* skip a missing factory file */ }
  }
  const story = docs.filter(({ doc }) => !doc.id.startsWith('ai-'));
  const ai = docs.filter(({ doc }) => doc.id.startsWith('ai-'));
  $('storyGrid').innerHTML = story.map(({ doc, edited }) => cardHtml(doc, { edited })).join('');
  $('aiGrid').innerHTML = ai.map(({ doc, edited }) => cardHtml(doc, { edited })).join('');

  const customs = Object.values(custom);
  if (customs.length) {
    $('customSection').hidden = false;
    $('customEmpty').hidden = true;
    $('customGrid').innerHTML = customs
      .map((doc) => cardHtml(doc, { custom: true }))
      .join('');
  }
}

load();
