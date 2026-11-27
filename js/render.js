// Canvas renderer: flat circles on a level-colour background, matching the
// Unity board. Row 0 is the BOTTOM: Unity's world Y increases upward
// (World.InitCell: posY = 1.5*row), so JSON row 0 sits at the bottom of
// the screen and the top row is row h-1 — the port was rendering it
// upside-down until this was fixed. Pointy-top odd-r layout, same as
// Unity (LevelOrientation.Horizontal): rows share a y, odd rows are
// offset half a step (the offset keys off the JSON row, not the screen
// row), columns zig-zag. The hex itself is Unity's hex_white sprite —
// a pointy-top hexagon stretched so its width equals its height
// (top/bottom vertices, vertical side edges) — which is exactly what
// tessellates at x-step 2s, y-step 1.5s.
//
// Every colour/size below is taken from the Unity repo, not invented:
//   - Cell.prefab: EmptyColor white a=0.078, WallColor black a=0.196,
//     BedrockColor black a=0.298, WaypointColor PastelGreen a=0.392,
//     PinColor white a=0.196. EmptySprite is a circle, WallSprite a hex,
//     PinSprite a thick ring, WaypointSprite a diamond, EdgeSprite a cross.
//   - Cell.cs sizes (ScaleFactor 2): EmptySize 0.4, WallSize 2.0,
//     PathSize 1.0 shrinking 0.05/step, PinSize 1.0. Path dots fade
//     alpha 1 -> 0.4 (1 - index*0.1, floor 0.4) — the port ran them
//     0.75 -> 0.3 for a while, but measured against the Unity
//     screenshot that made the dots melt into the ribbon, so the whole
//     path read as one thick band; Unity's 1 -> 0.4 is what makes the
//     dots pop over the 0.3 ribbon. The pin ring is NOT 1.0 across:
//     PinSprite is circle_thick, 500px at 800 PPU, so the sprite is
//     only 0.625 units at PinSize 1.0 — the ring's outer diameter is
//     0.62 units with a 0.124-unit stroke (measured from the texture
//     and from the Unity screenshot: 42px ring vs 133px hex).
//     A pin ON a path lights up instead of getting an extra circle:
//     Cell.BecomePathOf scales the pin's own sprite to PinSize*1.4
//     and tints it the path colour (alpha 1 - index*0.1, floor 0.4)
//     — no separate dot is drawn on a pin cell.
//   - Hints (MenuController.ShowHints): the level JSON's hints list
//     (Level.Hints) is NOT shown by default — Unity only shows the
//     markers when the player asks (H key / hint button), and tapping
//     one dismisses them all (HintMarkerTap). Each marker is a white
//     hex outline (HexagonOutlineThin, 512px at 512 PPU = 1.0 unit)
//     at scale 1.8, flashing white between alpha 0.196 and 0.667 on a
//     1s ping-pong lerp (Flash component). The port used to draw them
//     always-on as yellow dot+rings — that was invented, not Unity's.
//   - Waypoints / endpoints / lures (Waypoint, EndPoint, Lure prefabs):
//     all three are the SAME rendering — a hexagon the full size of a
//     wall (prefab root scale 2, so 2.0 units across) divided into six
//     segments (hex_outline_segment_1..6.png), each a solid wedge of
//     the ring: outer hex radius s, inner hex a uniform 0.5x copy of
//     the outer hex (measured row-by-row from the segment sprites:
//     the hole's vertices sit 128px from the sprite centre on every
//     axis, i.e. 0.25 units at 512 PPU, 0.5 units at the prefab's x2
//     scale). The port first drew the inner hex squashed (Rv 0.25s /
//     Rh 0.5s) and the hole read as a rectangle — Sam caught it from a
//     close-up. Each segment carries its own Flash component, so it
//     shimmers on its own interval — seg1 1.0s, seg2 1.2s, seg3 0.8s,
//     seg4 1.4s, seg5 0.6s, seg6 1.6s — alpha ping-ponging 0.392 <-> 0.8
//     (lure 0.784) from a shared start, drifting out of phase. The ONLY
//     difference between the three is the base colour: waypoint
//     (1, 0.745, 0) = #ffbe00, endpoint (0.265, 0.840, 0.629) =
//     #44d6a0, lure (0.961, 0.478, 0.506) = #f57a81. No sprite copy
//     is needed: canvas draws the same six wedges directly, each with
//     its own alpha phase. Inside the hex sits the small green
//     waypoint diamond (WaypointSize 0.6, WaypointColor) — the cell's
//     own sprite when an endpoint is on it (Cell.BecomeEmptyAnimation).
//     Unity's code leaves that diamond green and the path just runs
//     into it (BecomePathOf returns early on item cells, so no dot or
//     ring is ever drawn on one); the port lights the diamond in the
//     path colour instead, as Sam described it — the clearer signal,
//     parallel to how pins light up. The port used to draw the
//     endpoint as a thin white outline and the lure as a red circle
//     with a white dot; both were invented.
//   - Next step: Character.cs flashes the FIRST path cell between the
//     path colour at alpha 0.9 and white, interval 0.5s — a gentle
//     white pulse on the cell the character is about to move to. It
//     stops when the path changes (previousPath.First().Flash(false)).
//     The port flashes the first dot (or the first-step ring) the same
//     way; it follows the preview path too, since the same code sets
//     both.
//   - Character.cs / prefabs: the path ribbon (LineRenderer) is 1.1 world
//     units wide, and its alpha GRADIENT is 1.0 at the character, 0.3
//     after the first dot, fading to 0 at the far end (DrawLine) —
//     measured: the ribbon is 0.55 of a hex wide in both builds, so
//     the "thicker" read was the dot alpha, not the ribbon width.
//     Path dots are 1.0 across (so they fit INSIDE the ribbon), and
//     characters sit at scale 1.5 — clearly bigger than any path dot,
//     which is how you tell the piggy from its path. The player IS
//     full 1.5 in Unity (measured 105px piggy vs 133px hex = 0.79,
//     i.e. 1.5/2 with a ribbon overlap).
//     In canvas units (wall hex ~2.0 across = 2s): ribbon 1.1s wide,
//     dots radius 0.5s shrinking, characters radius 0.75s.
//   - diamond_white is 358x508 in a 512 texture at 512 PPU: the
//     diamond itself is 0.70 wide, 0.99 tall at scale 1. The
//     Collectable prefab is scale 1.5, so its diamond is 1.05 wide
//     x 1.49 tall units — the port drew it 0.67 x 0.84, about 40%
//     too small. The waypoint diamond (WaypointSize 0.6) is 0.42 x
//     0.59 units. drawDiamond takes the Unity prefab scale now.
//   - Character.cs SetPath / MenuController RevealPathLoop: path dots
//     appear one by one with a distance-based delay — Player
//     DrawPathDelay is 5 frames (~80ms) per dot, enemies 0.2 frames
//     (effectively instant) — then the ribbon fades in over 0.3s once
//     the dots are out. The port replays that stagger every time a path
//     recomputes (preview, commit, rewind).
//   - Preview mode (UnitController.ShowGlobalPreview + GameStateController
//     drag overlay): the previewed cell becomes bedrock and FLASHES WHITE
//     — Flash(white, white at 0.6 alpha, 0.2s interval), a 0.4s pulse —
//     the background darkens toward black (World.Darken: 0.4 in Unity;
//     the port uses 0.2 — Sam found Unity's #2f414e too dark, Nov 26),
//     and a GHOST HEX — a white hex outline at 0.3 alpha, 2.85 scale
//     (~1.37x the cell), with a little pop — marks the previewed cell,
//     while every empty cell gets a faint white hex outline (0.05-0.25
//     alpha). The port shows all of that while a wall preview is up,
//     until GO. Port polish (Sam, Nov 27): the empty-cell outlines
//     fade with flood distance from the previewed cell, to nothing at
//     6 steps — the board beyond the preview's neighbourhood stays dark.
//   - MainGame.unity pastel palette: Yellow (1, 0.782, 0) = #FFC700,
//     Red (0.961, 0.478, 0.506) = #F57A81, Green (0.265, 0.840, 0.629)
//     = #44D6A0, Brown (0.753, 0.576, 0.361) = #C0935C.
//   - Prefab SpriteRenderer colours: Player #FFC700, Enemy #F57A81,
//     Digger #C0935C, PullEnemy #8053F6, OldTimer #A48000,
//     Collectable #44D6A0 at alpha 0.588.
//   - Background #4F6D82 is the level colour sampled from the Unity
//     screenshot (Unity randomises it per level around the chapter colour;
//     level JSONs carry no colour, so one blue for now).
//   - EndPoint prefab is white hex-outline segments: the safe zone is a
//     white hex outline, with the small green waypoint diamond inside it.
import { T } from './types.js?v=37';
import { MOVE_MS, MOVE_SNAP, MOVE_SNAP_MS } from './engine.js?v=37';

// CollectableBase explosion (Unity): on pickup the 6 hex segments fly
// apart in six directions — easeOutQuad over 1s (ExplodeTweenType 2),
// each with a random magnitude 1-2 units and a random 0-90° spin, then
// fade away after a random 1-2s delay over a random 0.5-2s (Fade).
// Canvas Y is down, so Unity's Y is flipped: segment 0 flies up-right
// on screen, not down-right. Directions are in segment order (seg1
// top-right edge, seg2 right vertical, seg3 bottom-right, seg4
// bottom-left, seg5 left vertical, seg6 top-left).
const EXPLODE_DIRS = [[0.7, -0.7], [1, 0], [0.7, 0.7], [-0.7, 0.7], [-1, 0], [-0.7, -0.7]];
const EXPLODE_MS = 1000;

const COLORS = {
  bg: '#4f6d82',
  wall: 'rgba(0, 0, 0, 0.196)',
  bedrock: 'rgba(0, 0, 0, 0.298)',
  emptyDot: 'rgba(255, 255, 255, 0.078)',
  pin: 'rgba(255, 255, 255, 0.196)',
  edge: 'rgba(245, 122, 129, 0.6)', // PastelRed
  snow: 'rgba(255, 255, 255, 0.2)',
  obstacle: 'rgba(0, 0, 0, 0.35)',
  waypoint: 'rgba(68, 214, 160, 0.392)', // PastelGreen, WaypointColor
  // Waypoint / endpoint / lure hex base colours (the prefabs' Flash
  // NormalColor RGB; only the base colour differs between the three).
  waypointHex: '#ffbe00',
  endpointHex: '#44d6a0',
  lureHex: '#f57a81',
  collectable: 'rgba(68, 214, 160, 0.588)', // PastelGreen, Collectable prefab
  player: '#ffc700',
  enemy: '#f57a81',
  bomb: '#f57a81',
  digger: '#c0935c',
  pull: '#8053f6',
  oldtimer: '#a48000',
};

const CHAR_COLORS = {
  player: COLORS.player,
  enemy: COLORS.enemy,
  bomb: COLORS.bomb,
  pull: COLORS.pull,
  digger: COLORS.digger,
  oldtimer: COLORS.oldtimer,
};

// '#rrggbb' + alpha -> 'rgba(r, g, b, a)', for the ribbon gradient.
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Flash ping-pong phase: Flash.cs lerps Normal -> Flash over Interval,
// then back over Interval, so the value is a triangle wave with legs of
// Interval seconds. `t` is a millisecond clock (Date.now()).
function flashTri(t, intervalS) {
  const ph = ((t / (intervalS * 1000)) % 2 + 2) % 2; // 0..2
  return ph < 1 ? ph : 2 - ph; // 0 -> 1 -> 0
}

// Per-segment Flash intervals from the Waypoint/EndPoint/Lure prefabs
// (seconds), in segment order: seg1 top-right edge, seg2 right vertical,
// seg3 bottom-right, seg4 bottom-left, seg5 left vertical, seg6 top-left.
const SEGMENT_INTERVALS = [1.0, 1.2, 0.8, 1.4, 0.6, 1.6];

// Default camera zoom, portrait phones only: the board is laid out as
// if it were at least this many cells wide, so a small level looks
// small on screen instead of stretching to fill the width — the camera
// stays zoomed out. A level this wide or wider fills the screen;
// anything wider zooms out to fit, as before. The number is the knob:
// raise it and small levels shrink further (Sam, Nov 27 — "we can
// always adjust the eight number if the small levels are looking too
// small"). Landscape/desktop keeps the old behaviour (fit the level to
// the board) — the zoom question there is still open.
const MIN_FIT_COLS = 8;

// Drag-overlay fade (port polish, not Unity — Sam, Nov 27): in preview
// mode the faint white hex outlines fade with FLOOD distance from the
// previewed cell (steps through the corridors, not as the crow flies),
// to nothing at this distance. The number is the knob.
const PREVIEW_FADE_DIST = 6;

// Alpha of a drag-overlay hex at flood distance `d` from the previewed
// cell: the closest cells keep the current 0.15, fading linearly to 0
// at maxDist (distance 0 and 1 are both full — the previewed cell
// itself is under the ghost hex anyway).
export function previewOverlayAlpha(d, maxDist = PREVIEW_FADE_DIST) {
  return 0.15 * (1 - Math.max(0, d - 1) / (maxDist - 1));
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 34; // hex radius in px (scaled to fit in layout())
    this.originX = 0;
    this.originY = 0;
    this.centers = []; // [{row, col, x, y}] for hit-testing
    this.rows = 0; // level height in rows (row 0 is the bottom, Unity-style)
    this.boardW = 0;
    this.boardH = 0;
    this.pathAnims = new Map(); // char id -> {sig, start, path} for the stagger
    this.bgDark = 0; // 0 = level colour, 1 = darkened (preview mode)
    this.lastDraw = 0;
    this.previewAnim = null; // {key, start} for the ghost-hex pop
    this.previewFade = null; // {key, dist} — flood distances from the previewed cell, for the overlay fade
    this.explosions = new Map(); // pickupFx id -> {x, y, base, flashMax, at, segs}
  }

  layout(game, width, height) {
    const s = this.size;
    const w = game.width;
    const h = game.height;
    this.rows = h;
    // Pointy-top odd-r (World.InitCell, Horizontal): x = 2*s*(col +
    // 0.5*(row&1)), y = 1.5*s*(h-1-row). The offset keys off the JSON
    // row; the vertical position flips it, because Unity's world Y
    // increases upward — JSON row 0 is the bottom of the screen.
    const portrait = height > width;
    // In portrait the width is fitted to the wider of the level and the
    // default-zoom reference (MIN_FIT_COLS), so a 5-wide level takes
    // ~5/8 of the screen instead of all of it. The content itself still
    // uses the real level width, so it stays centred.
    const fitW = portrait ? Math.max(w, MIN_FIT_COLS) : w;
    const boardW = 2 * s * (fitW - 1) + 2 * s + (h > 1 ? s : 0);
    const boardH = 1.5 * s * (h - 1) + 2 * s;
    const scale = Math.min(width / boardW, height / boardH, 1.4);
    this.size = s * scale;
    const ss = this.size;
    // originX/originY are the first cell's centre: content is centred,
    // with a half-hex margin on each side.
    const contentW = 2 * ss * (w - 1) + 2 * ss + (h > 1 ? ss : 0);
    const contentH = 1.5 * ss * (h - 1) + 2 * ss;
    this.originX = (width - contentW) / 2 + ss;
    this.originY = (height - contentH) / 2 + ss;
    this.boardW = width;
    this.boardH = height;
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    this.centers = [];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        this.centers.push({ row: r, col: c, x: this.cellCenterX(r, c), y: this.cellCenterY(r) });
      }
    }
  }

  cellCenterX(row, col) {
    return this.originX + 2 * this.size * (col + 0.5 * (row & 1));
  }

  cellCenterY(row) {
    // Row 0 is the bottom (Unity world Y up), row h-1 the top.
    const rows = this.rows || 1;
    return this.originY + 1.5 * this.size * (rows - 1 - row);
  }

  cellAt(px, py) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.centers) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return bestD <= this.size * 1.05 ? best : null;
  }

  hexPath(x, y, r) {
    // Unity's hex_white sprite: pointy-top, stretched so width == height
    // — top/bottom vertices, vertical side edges at x = +/-r from
    // y = -0.5r to 0.5r. That shape tessellates exactly at the 2s / 1.5s
    // spacing above; a flat-top hex (vertices at 0, 60, ...) does not.
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y - 0.5 * r);
    ctx.lineTo(x + r, y + 0.5 * r);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y + 0.5 * r);
    ctx.lineTo(x - r, y - 0.5 * r);
    ctx.closePath();
  }

  // The six vertices of that hex, in the same order (top, upper-right,
  // lower-right, bottom, lower-left, upper-left), for a hex with
  // vertical radius rv and horizontal radius rh. The waypoint hex ring
  // uses the same shape twice: outer (s, s) and inner (0.5s, 0.5s) —
  // the hole is a uniform half-scale copy of the outer hex.
  hexVerts(x, y, rv, rh) {
    return [
      [x, y - rv],
      [x + rh, y - rv / 2],
      [x + rh, y + rv / 2],
      [x, y + rv],
      [x - rh, y + rv / 2],
      [x - rh, y - rv / 2],
    ];
  }

  circle(x, y, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  draw(game, { showPaths = true, stagger = true } = {}) {
    const ctx = this.ctx;
    const s = this.size;
    const now = performance.now();
    // Wall-clock time (Date.now()) for the move slides and explosions —
    // the engine stamps those in the same clock.
    const wallNow = Date.now();
    const dt = this.lastDraw ? Math.min(100, now - this.lastDraw) : 16;
    this.lastDraw = now;
    ctx.clearRect(0, 0, this.boardW, this.boardH);
    // Level-colour background, full bleed across the board. While a wall
    // preview is up, Unity darkens it 0.4 toward black (World.Darken);
    // the port uses 0.2 instead — Sam found Unity's #2f414e too dark
    // (Nov 26), so the darkened colour is #3f5768, still clearly
    // darker than the #4f6d82 board but much less oppressive. Ease
    // toward the darkened colour over ~200ms, and back when the
    // preview clears. #4f6d82 -> #3f5768.
    const previewing = !!game.previewState;
    // Flood distances from the previewed cell, for the drag-overlay
    // fade below. Cached per preview cell — the terrain doesn't change
    // while previewing, so the distances are stable until the preview
    // moves to another cell.
    let previewDist = null;
    if (previewing) {
      const { row, col } = game.previewState;
      const key = `${row},${col}`;
      if (!this.previewFade || this.previewFade.key !== key) {
        const flooded = game.nav.flood([], { [T.WALL]: -1 }, row, col, PREVIEW_FADE_DIST);
        const dist = new Map();
        for (const f of flooded) dist.set(`${f.row},${f.col}`, f.distance);
        this.previewFade = { key, dist };
      }
      previewDist = this.previewFade.dist;
    } else {
      this.previewFade = null;
    }
    // White border around the edge of the board while previewing —
    // Sam's addition, not Unity's (Unity's preview is only the
    // per-cell outlines + ghost hex). Toggled here, where previewing
    // is already known; the editor never previews, so it never shows.
    this.canvas.parentElement.classList.toggle('previewing', previewing);
    const darkTarget = previewing ? 1 : 0;
    const darkStep = dt / 200;
    this.bgDark = this.bgDark < darkTarget
      ? Math.min(darkTarget, this.bgDark + darkStep)
      : Math.max(darkTarget, this.bgDark - darkStep);
    const d = this.bgDark;
    // The board is the level's own colour: a factory's chapter colour
    // for generated levels, the JSON colour for the three hand-made
    // levels that carry one, otherwise the default #4f6d82 (see the
    // comment above for the preview darkening). Same 0.2-toward-black
    // dim as before, just from the level's colour instead of the constant.
    const [br, bg2, bb] = hexRgb(game.def?.color || COLORS.bg);
    const dim = (v) => Math.round(v * (1 - 0.2 * d));
    ctx.fillStyle = `rgb(${dim(br)}, ${dim(bg2)}, ${dim(bb)})`;
    ctx.fillRect(0, 0, this.boardW, this.boardH);

    // Cells whose own marker lights up on a path: pins (Cell.BecomePathOf
    // scales the pin's own ring to 1.4x in the path colour) and
    // waypoint/endpoint/lure cells (their inner diamond lights up the
    // same way, while the hex keeps its base colour). Collect them first
    // so the terrain/items passes can draw them lit and the path pass
    // can skip drawing anything extra on those cells — Unity draws no
    // dot or ring on a pin or an item cell (BecomePathOf returns early).
    const pathTargets = new Map();
    if (showPaths) {
      for (const ch of game.chars) {
        if (!ch.alive || ch.finished) continue;
        const color = CHAR_COLORS[ch.kind] || '#888';
        const path = this.drawPathFor(game, ch, wallNow);
        path.forEach((step, i) => {
          const key = `${step.row},${step.col}`;
          if (pathTargets.has(key)) return;
          const item = game.items.get(key);
          const isItemTarget = item && (item.type === T.ENDPOINT ||
            item.type === T.LURE || item.type === T.WAYPOINT);
          if (game.terrain[step.row]?.[step.col] === T.PIN || isItemTarget) {
            pathTargets.set(key, { color, alpha: Math.max(0.4, 1 - i * 0.1) });
          }
        });
      }
    }

    // Terrain: in Unity a cell is a dot, a hex, a ring or a cross — never a
    // hex outline. Sizes are EmptySize/WallSize ratios from Cell.cs
    // (empty 0.4 vs wall 2.0, so the dot is 1/5 of a wall hex).
    for (let r = 0; r < game.height; r++) {
      for (let c = 0; c < game.width; c++) {
        const x = this.cellCenterX(r, c);
        const y = this.cellCenterY(r);
        const t = game.terrain[r][c];
        // Walls are drawn at full radius s: Unity's hex_white is 512px
        // at 512 PPU, so at WallSize 2.0 it spans exactly the 2-unit
        // cell spacing — neighbouring walls share an edge, no gap.
        if (t === T.WALL) {
          this.hexPath(x, y, s);
          ctx.fillStyle = COLORS.wall;
          ctx.fill();
        } else if (t === T.BEDROCK) {
          this.hexPath(x, y, s);
          ctx.fillStyle = COLORS.bedrock;
          ctx.fill();
        } else if (t === T.PIN) {
          // PinSprite is circle_thick, 500px at 800 PPU: the sprite is
          // only 0.625 units across at PinSize 1.0, so the ring's outer
          // diameter is 0.62 units with a 0.124-unit stroke — centreline
          // radius (0.62-0.124)/2 = 0.248s, lineWidth 0.124s. When the
          // pin is on a path, the ring itself lights up in the path
          // colour at 1.4x (BecomePathOf) instead of gaining a dot.
          const lit = pathTargets.get(`${r},${c}`);
          const k = lit ? 1.4 : 1;
          ctx.beginPath();
          ctx.arc(x, y, s * 0.248 * k, 0, Math.PI * 2);
          ctx.strokeStyle = lit ? hexA(lit.color, lit.alpha) : COLORS.pin;
          ctx.lineWidth = Math.max(2, s * 0.124 * k);
          ctx.stroke();
        } else if (t === T.EDGE) {
          // EdgeSprite is a cross, PastelRed at 0.6.
          ctx.strokeStyle = COLORS.edge;
          ctx.lineWidth = Math.max(2, s * 0.12);
          ctx.lineCap = 'round';
          const a = s * 0.32;
          ctx.beginPath();
          ctx.moveTo(x - a, y - a);
          ctx.lineTo(x + a, y + a);
          ctx.moveTo(x + a, y - a);
          ctx.lineTo(x - a, y + a);
          ctx.stroke();
          this.circle(x, y, s * 0.2, COLORS.emptyDot);
        } else if (t === T.SNOW) {
          this.circle(x, y, s * 0.3, COLORS.snow);
        } else if (t === T.OBSTACLE) {
          this.circle(x, y, s * 0.45, COLORS.obstacle);
        } else {
          this.circle(x, y, s * 0.2, COLORS.emptyDot);
        }
        // While previewing, Unity's drag overlay puts a faint white hex
        // outline on every empty cell (ShowHexOverlay, 0.05-0.25 alpha).
        // The overlay is scale 1.9 against the 2.0 wall, so it sits
        // inset at 0.95s — its hairline gap is deliberate, not a bug.
        // Port polish (Sam, Nov 27): the outlines fade with FLOOD
        // distance from the previewed cell — the closest keep the
        // current 0.15, fading to nothing at PREVIEW_FADE_DIST. Cells
        // beyond it, or walled off from the previewed cell, get no
        // outline at all.
        if (previewing && t === T.EMPTY && !game.items.has(`${r},${c}`)) {
          const d = previewDist.get(`${r},${c}`);
          if (d === undefined) continue;
          const alpha = previewOverlayAlpha(d);
          if (alpha <= 0) continue;
          this.hexPath(x, y, s * 0.95);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Items.
    for (const [k, item] of game.items) {
      const [r, c] = k.split(',').map(Number);
      const x = this.cellCenterX(r, c);
      const y = this.cellCenterY(r);
      const type = item.type;
      const lit = pathTargets.get(k);
      if (type === T.ENDPOINT) this.drawHexItem(x, y, s, COLORS.endpointHex, 0.8, lit);
      else if (type === T.LURE) this.drawHexItem(x, y, s, COLORS.lureHex, 0.784, lit);
      else if (type === T.WAYPOINT) this.drawHexItem(x, y, s, COLORS.waypointHex, 0.8, lit);
      else if (type === T.COLLECTABLE) this.drawDiamond(x, y, 1.5, COLORS.collectable);
      else if (type === T.OLDTIMER) this.drawOldTimer(x, y, s);
    }

    // Paths (under the characters). Unity draws a ribbon in the
    // character's colour at alpha 0.3 (Character.cs, widthMultiplier 1.1)
    // plus a chain of dots that shrink 0.05/step and fade along the path
    // (Cell.cs). The dots (1.0 across) fit inside the ribbon (1.1 wide),
    // and the character (1.5 across) is clearly bigger than any dot.
    // Dots stagger in one by one from the character outward, then the
    // ribbon fades in over 0.3s — the RevealPathLoop choreography.
    // The stagger replays only when the path genuinely changes: stepping
    // along it just drops the first segment, and a recompute that lands
    // on the same route (e.g. committing a preview) keeps the reveal.
    if (showPaths) {
      for (const ch of game.chars) {
        if (!ch.alive || ch.finished) continue;
        const path = this.drawPathFor(game, ch, wallNow);
        if (!path || path.length === 0) {
          this.pathAnims.delete(ch.id);
          continue;
        }
        const color = CHAR_COLORS[ch.kind] || '#888';
        // The reveal replays ONLY when the path genuinely changes.
        // Stepping along the path (new path == old path minus its first
        // step) just drops a segment — the dots stay revealed. Same for
        // a recompute that lands on the same route (e.g. committing a
        // preview): the preview flag used to restart the reveal too.
        const seq = path.map((p) => `${p.row},${p.col}`);
        const sig = seq.join('|');
        let anim = this.pathAnims.get(ch.id);
        if (!anim || anim.sig !== sig) {
          const stepped = !!anim && anim.path && sig === anim.path.slice(1).join('|');
          const same = !!anim && anim.path && sig === anim.path.join('|');
          anim = { sig, start: (stepped || same) ? anim.start : now, path: seq };
          this.pathAnims.set(ch.id, anim);
        }
        // Player DrawPathDelay is 5 frames (~80ms) per dot; enemies 0.2
        // frames, effectively instant.
        const stepMs = ch.kind === 'player' ? 80 : 0;
        const dotMs = 300; // ColorBounce scale rate 20-30 frames to settle
        // The ribbon starts at the character's VISUAL position, so while
        // it slides between cells the line stays sticky on it (Unity's
        // DrawLine re-anchors to the character as it moves).
        const pos = this.charPos(game, ch, wallNow);
        const startX = pos.x;
        const startY = pos.y;
        // Ribbon fades in over 0.3s once the last dot is out.
        const ribbonAt = anim.start + (path.length - 1) * stepMs;
        const ribbonP = stagger
          ? Math.min(1, Math.max(0, (now - ribbonAt) / 300))
          : 1;
        if (ribbonP > 0) {
          // Unity's DrawLine gradient: alpha 1.0 at the character,
          // 0.3 after the first dot, holding 0.3 until the last dot,
          // then fading to 0 at the far end. Approximated with a
          // linear gradient along start -> end (Unity's is along the
          // path length; same endpoints, same stops).
          const last = path[path.length - 1];
          const endX = this.cellCenterX(last.row, last.col);
          const endY = this.cellCenterY(last.row);
          const n = path.length;
          const grad = ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, hexA(color, 1));
          if (n > 1) {
            grad.addColorStop(1 / n, hexA(color, 0.3));
            grad.addColorStop((n - 1) / n, hexA(color, 0.3));
          }
          // The far end always fades to 0 — even on a 1-cell path. The
          // old `n > 1 ? 0 : 1` kept the last segment at full alpha, so
          // a piggy one cell from its destination showed a solid bar
          // instead of a fading ribbon (Sam, Nov 27). Unity's gradient
          // is 1.0 at the character fading to 0 at the far end whatever
          // the length; the destination ring (below) still marks the end.
          grad.addColorStop(1, hexA(color, 0));
          ctx.strokeStyle = grad;
          ctx.globalAlpha = ribbonP;
          ctx.lineWidth = s * 1.1;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          for (const step of path) {
            ctx.lineTo(this.cellCenterX(step.row, step.col), this.cellCenterY(step.row));
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        path.forEach((step, i) => {
          // A pin or an item cell on the path shows itself lit (see
          // pathTargets above) — Unity draws no dot or ring on top of
          // it (Cell.BecomePathOf returns early for pins and items).
          const stepKey = `${step.row},${step.col}`;
          if (pathTargets.has(stepKey)) return;
          const stepItem = game.items.get(stepKey);
          if (stepItem && stepItem.type === T.COLLECTABLE) return;
          const px = this.cellCenterX(step.row, step.col);
          const py = this.cellCenterY(step.row);
          // Unity's dot alpha (Cell.cs): 1 -> 0.4, 1 - index*0.1.
          // The faded 0.75 -> 0.3 run made the dots melt into the
          // ribbon, so the whole path read as one thick band.
          const targetAlpha = Math.max(0.4, 1 - i * 0.1);
          const targetR = Math.max(0.2, 0.5 - i * 0.025);
          const p = stagger
            ? Math.min(1, Math.max(0, (now - anim.start - i * stepMs) / dotMs))
            : 1;
          if (p <= 0) return;
          const e = 1 - Math.pow(1 - p, 3); // ease-out: grows in from dot size
          const radius = s * (0.2 + (targetR - 0.2) * e);
          // The next step (Character.cs): the first path cell flashes
          // between the path colour at alpha 0.9 and white, 0.5s per
          // leg — the gentle white pulse on the cell the character is
          // about to move to. It follows the preview path too.
          let fill = color;
          let alpha = targetAlpha * e;
          if (i === 0) {
            const tri = flashTri(Date.now(), 0.5);
            const [r0, g0, b0] = hexRgb(color);
            fill = `rgb(${Math.round(r0 + (255 - r0) * tri)}, ${Math.round(g0 + (255 - g0) * tri)}, ${Math.round(b0 + (255 - b0) * tri)})`;
            alpha = (0.9 + 0.1 * tri) * e;
          }
          ctx.globalAlpha = alpha;
          if (i === path.length - 1) {
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.strokeStyle = fill;
            ctx.lineWidth = 3;
            ctx.stroke();
          } else {
            this.circle(px, py, radius, fill);
          }
        });
        ctx.globalAlpha = 1;
      }
    }

    // Preview ghost wall. Unity's previewed cell becomes bedrock and
    // flashes white (Flash: white <-> white at 0.6 alpha, 0.2s per leg),
    // with a white ghost-hex outline around it (0.3 alpha, ~1.37x the
    // cell, popping in). Removing a wall keeps the faded treatment.
    if (game.previewState) {
      const { row, col, action } = game.previewState;
      const x = this.cellCenterX(row, col);
      const y = this.cellCenterY(row);
      const key = `${row},${col},${action}`;
      if (!this.previewAnim || this.previewAnim.key !== key) {
        this.previewAnim = { key, start: now };
      }
      const pop = Math.min(1, (now - this.previewAnim.start) / 150);
      const pe = 1 - Math.pow(1 - pop, 3);
      if (action === 'build') {
        // White flash: triangle wave, 0.4s full cycle, alpha 1.0 <-> 0.6.
        // Full radius s, like a real wall — it shares its neighbours' edges.
        const phase = ((now - this.previewAnim.start) % 400) / 400;
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        this.hexPath(x, y, s);
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - 0.4 * tri).toFixed(3)})`;
        ctx.fill();
      } else {
        // Previewing a removal: fade the wall out, dashed white outline.
        this.hexPath(x, y, s);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Ghost hex: white outline, 0.3 alpha, popping in from 1.55x to 1.37x.
      this.hexPath(x, y, s * (1.55 - 0.18 * pe));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      this.previewAnim = null;
    }

    // Hints (MenuController.ShowHints): only when asked for — the H key
    // or the ? button sets game.hintsShown; tapping a marker dismisses
    // them (see app.js). Each marker is a white hex outline at 1.8x,
    // flashing white between alpha 0.196 and 0.667 on a 1s ping-pong
    // lerp (Flash: NormalColor 50/255, FlashColor 170/255, Interval 1s).
    if (game.hintsShown) {
      const t = (Date.now() % 2000) / 1000; // 0..2s
      const tri = t < 1 ? t : 2 - t; // 0 -> 1 -> 0 over the 2s cycle
      const alpha = 0.196 + (0.667 - 0.196) * tri;
      for (const hint of game.def.hints || []) {
        const x = this.cellCenterX(hint.Y, hint.X);
        const y = this.cellCenterY(hint.Y);
        this.hexPath(x, y, s * 0.9);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Pickup explosions (CollectableBase.PickedUpBy): the 6 hex segments
    // of an endpoint or lure fly apart when a character lands on it.
    // Above the paths, below the characters (the pieces are items).
    this.drawExplosions(game, wallNow);

    // Characters: plain solid circles in their prefab colours. No faces —
    // Unity characters are just circles. A character that died this turn
    // (lure, catch) still glides to its cell before vanishing, so it is
    // drawn while its slide runs.
    for (const ch of game.chars) {
      if (!ch.alive && !this.isSliding(game, ch, wallNow)) continue;
      const pos = this.charPos(game, ch, wallNow);
      this.drawCharacter(ch, pos.x, pos.y, s);
    }
  }

  pathFor(game, ch) {
    if (game.previewState && game.previewState.paths) return game.previewState.paths.get(ch.id) || [];
    return ch.path;
  }

  // The path as drawn: while a character slides to its next cell, the
  // point for that cell was already consumed by the engine (the logical
  // state advances at once) — but it shouldn't disappear until the
  // character reaches it, or the ribbon snaps away as the move begins
  // (Sam, Nov 27). So while the slide is running, the destination cell
  // (the character's logical cell) is put back at the front of the
  // drawn path. Once the slide snaps (MOVE_SNAP), isSliding goes false
  // and the point drops — exactly when the character arrives. `now` is
  // a Date.now() clock, the same one movePlanAt uses.
  drawPathFor(game, ch, now) {
    const path = this.pathFor(game, ch) || [];
    if (!this.isSliding(game, ch, now)) return path;
    return [{ row: ch.row, col: ch.col }, ...path];
  }

  // Visual position of a character: during its step slide it glides from
  // the old cell to the new one (Unity: CellMoveSpeed 1s, easeOutExpo,
  // staggered 0.3s per character in the engine's move plan); otherwise
  // it sits on its cell. `now` is a Date.now() clock, like the plan.
  charPos(game, ch, now) {
    const plan = (game.movePlan || []).find((m) => m.ch === ch);
    if (!plan) return { x: this.cellCenterX(ch.row, ch.col), y: this.cellCenterY(ch.row) };
    const start = (game.movePlanAt || 0) + plan.delay;
    const p = Math.min(1, Math.max(0, (now - start) / MOVE_MS));
    const e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo
    // Snap: once the ease is 98% of the way there the character is
    // visually at its destination — pin it there (MOVE_SNAP), so the
    // last imperceptible fraction doesn't keep it floating mid-cell.
    const ee = e >= MOVE_SNAP ? 1 : e;
    const x0 = this.cellCenterX(plan.fromRow, plan.fromCol);
    const y0 = this.cellCenterY(plan.fromRow);
    const x1 = this.cellCenterX(ch.row, ch.col);
    const y1 = this.cellCenterY(ch.row);
    return { x: x0 + (x1 - x0) * ee, y: y0 + (y1 - y0) * ee };
  }

  isSliding(game, ch, now) {
    const plan = (game.movePlan || []).find((m) => m.ch === ch);
    if (!plan) return false;
    return now < (game.movePlanAt || 0) + plan.delay + MOVE_SNAP_MS;
  }

  // Pickup explosions: when a character lands on an endpoint or lure,
  // the hex's 6 segments fly apart (CollectableBase.PickedUpBy) — each
  // in its own direction, easeOutQuad over 1s, random magnitude 1-2
  // units and random 0-90° spin, then fading away after a random 1-2s
  // delay over a random 0.5-2s, so no two pieces move alike. The engine
  // records the pickup with its landing time; this builds the random
  // per-segment values once, the first frame the explosion is due.
  drawExplosions(game, now) {
    const s = this.size;
    for (const fx of game.pickupFx || []) {
      if (now < fx.at || now > fx.at + 4000) continue;
      let ex = this.explosions.get(fx.id);
      if (!ex) {
        const base = fx.type === T.ENDPOINT ? COLORS.endpointHex : COLORS.lureHex;
        const flashMax = fx.type === T.ENDPOINT ? 0.8 : 0.784;
        ex = {
          x: this.cellCenterX(fx.row, fx.col),
          y: this.cellCenterY(fx.row),
          base, flashMax, at: fx.at,
          segs: EXPLODE_DIRS.map((dir, i) => {
            const r1 = 1 + Math.random();
            const r2 = 1 + Math.random();
            return {
              i, dir, r1, r2,
              rot: Math.random() * Math.PI / 2, // 0-90°
              fadeDelay: Math.max(r1, r2), // seconds after `at`
              fadeDur: 0.5 + Math.random() * 1.5, // 0.5-2s
              // Freeze the shimmer alpha at the pickup moment — Unity
              // destroys the Flash component, so the pieces stop shimmering.
              alpha0: 0.392 + (flashMax - 0.392) * flashTri(fx.at, SEGMENT_INTERVALS[i]),
            };
          }),
        };
        this.explosions.set(fx.id, ex);
      }
      const t = Math.min(1, (now - ex.at) / EXPLODE_MS);
      const e = 1 - Math.pow(1 - t, 2); // easeOutQuad (ExplodeTweenType 2)
      for (const seg of ex.segs) {
        const fadeStart = ex.at + seg.fadeDelay * 1000;
        const fadeP = Math.min(1, Math.max(0, (now - fadeStart) / (seg.fadeDur * 1000)));
        const alpha = seg.alpha0 * (1 - fadeP);
        if (alpha <= 0.01) continue;
        const ox = seg.dir[0] * seg.r1 * e * s;
        const oy = seg.dir[1] * seg.r2 * e * s;
        // Unity's rotateZ is counter-clockwise on screen; canvas
        // rotates clockwise for positive angles, so negate it.
        this.drawExplodeSegment(ex.x + ox, ex.y + oy, s, -seg.rot * e, seg.i, ex.base, alpha);
      }
    }
    for (const [id, ex] of this.explosions) {
      if (now > ex.at + 4000) this.explosions.delete(id);
    }
  }

  // One flying hex segment: the same wedge drawHexItem draws, rotated
  // about its own centre by `rot`.
  drawExplodeSegment(x, y, s, rot, i, base, alpha) {
    const ctx = this.ctx;
    const outer = this.hexVerts(0, 0, s, s);
    const inner = this.hexVerts(0, 0, s * 0.5, s * 0.5);
    const j = (i + 1) % 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(outer[i][0], outer[i][1]);
    ctx.lineTo(outer[j][0], outer[j][1]);
    ctx.lineTo(inner[j][0], inner[j][1]);
    ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.fillStyle = hexA(base, alpha.toFixed(3));
    ctx.fill();
    ctx.restore();
  }

  drawHexItem(x, y, s, base, flashMax, lit) {
    // Waypoint / endpoint / lure: one thick shimmering hex ring, the
    // full size of a wall (prefab root scale 2), split into six
    // segments (hex_outline_segment_1..6.png). Each segment is a wedge
    // of the ring — outer hex radius s, inner hex a uniform 0.5x copy
    // — with its own Flash interval, alpha ping-ponging 0.392 <-> flashMax
    // from a shared start so the segments drift out of phase. Drawn
    // straight from canvas paths; no sprite copy is needed. Inside sits
    // the small green waypoint diamond (WaypointSize 0.6); when a path
    // runs into the hex it lights up in the path colour (lit) while the
    // ring keeps its base colour.
    const ctx = this.ctx;
    const outer = this.hexVerts(x, y, s, s);
    const inner = this.hexVerts(x, y, s * 0.5, s * 0.5);
    const t = Date.now();
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const alpha = 0.392 + (flashMax - 0.392) * flashTri(t, SEGMENT_INTERVALS[i]);
      ctx.beginPath();
      ctx.moveTo(outer[i][0], outer[i][1]);
      ctx.lineTo(outer[j][0], outer[j][1]);
      ctx.lineTo(inner[j][0], inner[j][1]);
      ctx.lineTo(inner[i][0], inner[i][1]);
      ctx.closePath();
      ctx.fillStyle = hexA(base, alpha.toFixed(3));
      ctx.fill();
    }
    this.drawDiamond(x, y, 0.6, lit ? hexA(lit.color, lit.alpha) : COLORS.waypoint);
  }

  drawDiamond(x, y, k, fill = COLORS.collectable) {
    // k is the Unity prefab scale (Collectable 1.5, Waypoint 0.6).
    // diamond_white is 358x508 in a 512 texture at 512 PPU: the
    // diamond itself is 0.70 wide, 0.99 tall at scale 1, so at scale
    // k its half-height is 0.495*k and its half-width 0.35*k units.
    const ctx = this.ctx;
    const hy = this.size * 0.495 * k;
    const hx = this.size * 0.35 * k;
    ctx.beginPath();
    ctx.moveTo(x, y - hy);
    ctx.lineTo(x + hx, y);
    ctx.lineTo(x, y + hy);
    ctx.lineTo(x - hx, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  drawOldTimer(x, y, s) {
    const ctx = this.ctx;
    this.circle(x, y, s * 0.4, COLORS.oldtimer);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(s * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◷', x, y + 1);
  }

  drawCharacter(ch, x, y, s) {
    const ctx = this.ctx;
    const color = CHAR_COLORS[ch.kind] || '#888';
    // Characters sit at scale 1.5 in Unity (1.5 across vs 1.0 for a path
    // dot) — clearly bigger than any dot on their path.
    const r = s * 0.75;
    this.circle(x, y, r, color);
    if (ch.kind === 'bomb') {
      // Same red as an enemy in Unity; the white ring tells it apart.
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (ch.sleeping) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('z', x + r * 0.65, y - r * 0.65);
    }
    if (ch.finished) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#44d6a0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
}
