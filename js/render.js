// Canvas renderer: flat hexes, odd-r layout (odd rows shifted right),
// matching the Unity board's row/column topology. Row 0 is the top.
import { T } from './types.js';

const COLORS = {
  bg: '#f6f1e7',
  empty: '#fffdf6',
  emptyBorder: '#e5ddc8',
  wall: '#3d405b',
  edge: '#2b2d42',
  bedrock: '#1d3557',
  obstacle: '#b7b7a4',
  snow: '#dceef5',
  pin: '#9b5de5',
  endpoint: '#70a83b',
  collectable: '#e9a319',
  lure: '#e76f51',
  player: '#e5989b',
  playerDark: '#b35c6b',
  enemy: '#6d6875',
  bomb: '#22223b',
  digger: '#8a6d4b',
  pull: '#7b5ea7',
  oldtimer: '#8d99ae',
  ghost: 'rgba(61, 64, 91, 0.45)',
  hint: '#e9a319',
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

  draw(game, { showPaths = true } = {}) {
    const ctx = this.ctx;
    const s = this.size;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Terrain.
    for (let r = 0; r < game.height; r++) {
      for (let c = 0; c < game.width; c++) {
        const x = this.cellCenterX(r, c);
        const y = this.cellCenterY(r);
        const t = game.terrain[r][c];
        let fill = COLORS.empty;
        let border = COLORS.emptyBorder;
        if (t === T.WALL) { fill = COLORS.wall; border = COLORS.wall; }
        else if (t === T.EDGE) { fill = COLORS.edge; border = COLORS.edge; }
        else if (t === T.BEDROCK) { fill = COLORS.bedrock; border = COLORS.bedrock; }
        else if (t === T.OBSTACLE) { fill = COLORS.obstacle; border = COLORS.obstacle; }
        else if (t === T.SNOW) { fill = COLORS.snow; border = COLORS.emptyBorder; }
        else if (t === T.PIN) { fill = COLORS.empty; border = COLORS.pin; }
        this.hexPath(x, y, s * 0.96);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = t === T.PIN ? 2.5 : 1;
        ctx.stroke();
        if (t === T.PIN) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.pin;
          ctx.fill();
        }
        if (t === T.EDGE) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.16, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fill();
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
      else if (type === T.COLLECTABLE) this.drawDiamond(x, y, s);
      else if (type === T.LURE) this.drawLure(x, y, s);
      else if (type === T.OLDTIMER) this.drawOldTimer(x, y, s);
    }

    // Paths (under the characters).
    if (showPaths) {
      for (const ch of game.chars) {
        if (!ch.alive || ch.finished) continue;
        const path = this.pathFor(game, ch);
        if (!path || path.length === 0) continue;
        const color = CHAR_COLORS[ch.kind] || '#888';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([2, 7]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.cellCenterX(ch.row, ch.col), this.cellCenterY(ch.row));
        for (const step of path) {
          ctx.lineTo(this.cellCenterX(step.row, step.col), this.cellCenterY(step.row));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const last = path[path.length - 1];
        ctx.beginPath();
        ctx.arc(this.cellCenterX(last.row, last.col), this.cellCenterY(last.row), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Preview ghost wall.
    if (game.previewState && game.previewState.action === 'build') {
      const { row, col } = game.previewState;
      this.hexPath(this.cellCenterX(row, col), this.cellCenterY(row), s * 0.96);
      ctx.fillStyle = COLORS.ghost;
      ctx.fill();
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

    // Characters.
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
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.endpoint;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, s * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Flag.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.28);
    ctx.lineTo(x, y - s * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.3);
    ctx.lineTo(x + s * 0.34, y - s * 0.14);
    ctx.lineTo(x, y - s * 0.02);
    ctx.closePath();
    ctx.fill();
  }

  drawDiamond(x, y, s) {
    const ctx = this.ctx;
    const r = s * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
    ctx.fillStyle = COLORS.collectable;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawLure(x, y, s) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.lure;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, s * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }

  drawOldTimer(x, y, s) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.oldtimer;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
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
    const r = s * (ch.kind === 'player' ? 0.52 : 0.46);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (ch.sleeping) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('z', x + r * 0.6, y - r * 0.6);
    }
    if (ch.kind === 'player') {
      // Piggy face: two eyes.
      ctx.fillStyle = COLORS.playerDark;
      ctx.beginPath();
      ctx.arc(x - r * 0.32, y - r * 0.12, r * 0.13, 0, Math.PI * 2);
      ctx.arc(x + r * 0.32, y - r * 0.12, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // Snout.
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.22, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    } else if (ch.kind === 'bomb') {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 1);
    } else if (ch.kind === 'enemy') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (ch.kind === 'digger') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.35);
      ctx.lineTo(x + r * 0.4, y + r * 0.35);
      ctx.stroke();
    }
    if (ch.finished) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.endpoint;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
}
