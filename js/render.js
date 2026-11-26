// Canvas renderer: flat circles on a level-colour background, matching the
// Unity board. Row 0 is the top; flat-top odd-r layout, same topology as Unity.
//
// Every colour/size below is taken from the Unity repo, not invented:
//   - Cell.prefab: EmptyColor white a=0.078, WallColor black a=0.196,
//     BedrockColor black a=0.298, WaypointColor PastelGreen a=0.392,
//     PinColor white a=0.196. EmptySprite is a circle, WallSprite a hex,
//     PinSprite a thick ring, WaypointSprite a diamond, EdgeSprite a cross.
//   - Cell.cs sizes (ScaleFactor 2): EmptySize 0.4, WallSize 2.0,
//     PathSize 1.0 shrinking 0.05/step, PinSize 1.0. Path dots fade
//     alpha 1 -> 0.4 (1 - index*0.1, floor 0.4).
//   - Character.cs / prefabs: the path ribbon (LineRenderer) is 1.1 world
//     units wide with alpha 0.3, path dots are 1.0 across (so they fit
//     INSIDE the ribbon), and characters sit at scale 1.5 — clearly bigger
//     than any path dot, which is how you tell the piggy from its path.
//     In canvas units (wall hex ~2.0 across = 2s): ribbon 1.1s wide,
//     dots radius 0.5s shrinking, characters radius 0.75s.
//   - Character.cs SetPath / MenuController RevealPathLoop: path dots
//     appear one by one with a distance-based delay — Player
//     DrawPathDelay is 5 frames (~80ms) per dot, enemies 0.2 frames
//     (effectively instant) — then the ribbon fades in over 0.3s once
//     the dots are out. The port replays that stagger every time a path
//     recomputes (preview, commit, rewind).
//   - One deliberate deviation: Unity's dot alpha runs 1.0 -> 0.4, but
//     that reads as solid world objects next to the piggy, so the port
//     runs 0.75 -> 0.3 — faded enough to read as "not in the world".
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
import { T } from './types.js?v=7';

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
  endpointOutline: 'rgba(255, 255, 255, 0.85)',
  collectable: 'rgba(68, 214, 160, 0.588)', // PastelGreen, Collectable prefab
  lure: '#f57a81',
  player: '#ffc700',
  enemy: '#f57a81',
  bomb: '#f57a81',
  digger: '#c0935c',
  pull: '#8053f6',
  oldtimer: '#a48000',
  hint: '#ffc700',
};

const CHAR_COLORS = {
  player: COLORS.player,
  enemy: COLORS.enemy,
  bomb: COLORS.bomb,
  pull: COLORS.pull,
  digger: COLORS.digger,
  oldtimer: COLORS.oldtimer,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 34; // hex radius in px (scaled to fit in layout())
    this.originX = 0;
    this.originY = 0;
    this.centers = []; // [{row, col, x, y}] for hit-testing
    this.boardW = 0;
    this.boardH = 0;
    this.pathAnims = new Map(); // char id -> {sig, start} for the stagger
  }

  layout(game, width, height) {
    const s = this.size;
    const w = game.width;
    const h = game.height;
    // Flat-top odd-r: x = sqrt(3)*s*(col + 0.5*(row&1)), y = 1.5*s*row.
    const boardW = Math.sqrt(3) * s * (w + 0.5) + s * 0.5;
    const boardH = 1.5 * s * (h - 1) + 2 * s;
    const scale = Math.min(width / boardW, height / boardH, 1.4);
    this.size = s * scale;
    const ss = this.size;
    this.originX = (width - Math.sqrt(3) * ss * (w + 0.5)) / 2 + ss * 0.2;
    this.originY = (height - (1.5 * ss * (h - 1) + 2 * ss)) / 2 + ss;
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
    return this.originX + Math.sqrt(3) * this.size * (col + 0.5 * (row & 1));
  }

  cellCenterY(row) {
    return this.originY + 1.5 * this.size * row;
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
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
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
    ctx.clearRect(0, 0, this.boardW, this.boardH);
    // Level-colour background, full bleed across the board.
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.boardW, this.boardH);

    // Terrain: in Unity a cell is a dot, a hex, a ring or a cross — never a
    // hex outline. Sizes are EmptySize/WallSize ratios from Cell.cs
    // (empty 0.4 vs wall 2.0, so the dot is 1/5 of a wall hex).
    for (let r = 0; r < game.height; r++) {
      for (let c = 0; c < game.width; c++) {
        const x = this.cellCenterX(r, c);
        const y = this.cellCenterY(r);
        const t = game.terrain[r][c];
        if (t === T.WALL) {
          this.hexPath(x, y, s * 0.96);
          ctx.fillStyle = COLORS.wall;
          ctx.fill();
        } else if (t === T.BEDROCK) {
          this.hexPath(x, y, s * 0.96);
          ctx.fillStyle = COLORS.bedrock;
          ctx.fill();
        } else if (t === T.PIN) {
          // PinSprite is a thick ring, white at 0.196.
          ctx.beginPath();
          ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.pin;
          ctx.lineWidth = Math.max(2, s * 0.14);
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
      }
    }

    // Items.
    for (const [k, item] of game.items) {
      const [r, c] = k.split(',').map(Number);
      const x = this.cellCenterX(r, c);
      const y = this.cellCenterY(r);
      const type = item.type;
      if (type === T.ENDPOINT) this.drawEndpoint(x, y, s);
      else if (type === T.COLLECTABLE) this.drawDiamond(x, y, s, COLORS.collectable);
      else if (type === T.LURE) this.drawLure(x, y, s);
      else if (type === T.OLDTIMER) this.drawOldTimer(x, y, s);
    }

    // Paths (under the characters). Unity draws a ribbon in the
    // character's colour at alpha 0.3 (Character.cs, widthMultiplier 1.1)
    // plus a chain of dots that shrink 0.05/step and fade along the path
    // (Cell.cs). The dots (1.0 across) fit inside the ribbon (1.1 wide),
    // and the character (1.5 across) is clearly bigger than any dot.
    // Dots stagger in one by one from the character outward, then the
    // ribbon fades in over 0.3s — the RevealPathLoop choreography.
    // The stagger replays whenever a path recomputes (new signature).
    if (showPaths) {
      for (const ch of game.chars) {
        if (!ch.alive || ch.finished) continue;
        const path = this.pathFor(game, ch);
        if (!path || path.length === 0) {
          this.pathAnims.delete(ch.id);
          continue;
        }
        const color = CHAR_COLORS[ch.kind] || '#888';
        const isPreview = !!game.previewState;
        const sig = `${ch.id}|${isPreview ? 'p' : 'n'}|` +
          path.map((p) => `${p.row},${p.col}`).join('|');
        let anim = this.pathAnims.get(ch.id);
        if (!anim || anim.sig !== sig) {
          anim = { sig, start: now };
          this.pathAnims.set(ch.id, anim);
        }
        // Player DrawPathDelay is 5 frames (~80ms) per dot; enemies 0.2
        // frames, effectively instant.
        const stepMs = ch.kind === 'player' ? 80 : 0;
        const dotMs = 300; // ColorBounce scale rate 20-30 frames to settle
        const startX = this.cellCenterX(ch.row, ch.col);
        const startY = this.cellCenterY(ch.row);
        // Ribbon fades in over 0.3s once the last dot is out.
        const ribbonAt = anim.start + (path.length - 1) * stepMs;
        const ribbonP = stagger
          ? Math.min(1, Math.max(0, (now - ribbonAt) / 300))
          : 1;
        if (ribbonP > 0) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.3 * ribbonP;
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
          const px = this.cellCenterX(step.row, step.col);
          const py = this.cellCenterY(step.row);
          // Faded on purpose (see header): 0.75 -> 0.3, so path dots read
          // as "not in the world" next to the solid character.
          const targetAlpha = Math.max(0.3, 0.75 - i * 0.07);
          const targetR = Math.max(0.2, 0.5 - i * 0.025);
          const p = stagger
            ? Math.min(1, Math.max(0, (now - anim.start - i * stepMs) / dotMs))
            : 1;
          if (p <= 0) return;
          const e = 1 - Math.pow(1 - p, 3); // ease-out: grows in from dot size
          const radius = s * (0.2 + (targetR - 0.2) * e);
          ctx.globalAlpha = targetAlpha * e;
          if (i === path.length - 1) {
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.stroke();
          } else {
            this.circle(px, py, radius, color);
          }
        });
        ctx.globalAlpha = 1;
      }
    }

    // Preview ghost wall.
    if (game.previewState) {
      const { row, col, action } = game.previewState;
      const x = this.cellCenterX(row, col);
      const y = this.cellCenterY(row);
      this.hexPath(x, y, s * 0.96);
      if (action === 'build') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Previewing a removal: fade the wall out, dashed white outline.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Hints.
    const t = Date.now() / 500;
    for (const hint of game.def.hints || []) {
      const x = this.cellCenterX(hint.Y, hint.X);
      const y = this.cellCenterY(hint.Y);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.22 + Math.sin(t) * 2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.hint;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.hint;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Characters: plain solid circles in their prefab colours. No faces —
    // Unity characters are just circles.
    for (const ch of game.chars) {
      if (!ch.alive) continue;
      const x = this.cellCenterX(ch.row, ch.col);
      const y = this.cellCenterY(ch.row);
      this.drawCharacter(ch, x, y, s);
    }
  }

  pathFor(game, ch) {
    if (game.previewState && game.previewState.paths) return game.previewState.paths.get(ch.id) || [];
    return ch.path;
  }

  drawEndpoint(x, y, s) {
    // Safe zone: a white hex outline (the EndPoint prefab is hex-outline
    // segments) with the small green waypoint diamond inside it.
    const ctx = this.ctx;
    this.drawDiamond(x, y, s * 0.7, COLORS.waypoint);
    this.hexPath(x, y, s * 0.96);
    ctx.strokeStyle = COLORS.endpointOutline;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  drawDiamond(x, y, s, fill = COLORS.collectable) {
    const ctx = this.ctx;
    const r = s * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  drawLure(x, y, s) {
    const ctx = this.ctx;
    this.circle(x, y, s * 0.34, COLORS.lure);
    this.circle(x, y, s * 0.16, 'rgba(255,255,255,0.85)');
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
