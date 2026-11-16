// Makes one wallpaper on a canvas.
//
// The wallpaper is a few groups of marks on a loose grid, with a lot of empty space.
// Shapes of one type have the same size. They tile or mirror each other.
// Large shapes only show at a screen edge, where the edge cuts them off.
// Most of the picture is near-black and grey. One accent colour shows once or twice.

import { Random } from './random.js';
import { glitch, finish } from './effects.js';

// Accent colour presets, in the order of the colour list.
export const PALETTES = {
  sodium: '#ff5c18',
  acid: '#baff12',
  rhodamine: '#ff0f80',
  uv: '#522ede',
  xenon: '#00c4ff',
  cadmium: '#c40018',
};

// Image sizes in pixels. Phone is 19.5:9 (Galaxy S25 Ultra, iPhone Pro Max). Desktop is 4K.
export const DEVICES = {
  mobile: [1440, 3120],
  desktop: [3840, 2160],
};

// Greys, from dark to light.
const BG = '#08090b';     // background
const FAINT = '#15171b';  // guide lines
const DIM = '#282c33';    // quiet lines
const LINE = '#4a505b';   // normal lines
const TEXT = '#565c66';   // text
const SOLIDS = ['#131519', '#191b20', '#202329'];  // solid blocks

// Text on the wallpaper. Mostly short codes and numbers, with few real words.
// # becomes a random digit and @ becomes a random letter.
const LABELS = ['##', '##', '@-#', 'SYN', '0x##', 'Δ###', 'MK.II', '@/#',
  'IO', 'N.##', 'REF', 'LNK', 'v#', 'AUX'];
const HUD_LINES = ['TGT ##', 'RNG #.##', 'BRG ###', 'ALT ####', 'VEL ###', 'HDG ###',
  'TRK ##/##', 'GRID ##-@', 'SYS 0x##', '@@ ###', '-- ##.#', 'Δ ##.##'];
const TAGS = ['CAUTION', 'HAZARD ##', 'UNIT ##', 'SECTOR @', '@@-##', 'CL.#', 'LIVE'];

const FONT = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';

// The types of small groups.
// weight: how often the type comes up. accent: the type can use the accent colour.
const GROUPS = {
  hex: { weight: 3, accent: true },
  trap: { weight: 3, accent: true },
  para: { weight: 3, accent: true },
  segments: { weight: 2, accent: true },
  chevrons: { weight: 1, accent: true },
  cross: { weight: 1, accent: true },
  dots: { weight: 1, accent: true },
  bars: { weight: 2, accent: true },
  brackets: { weight: 1, accent: true },
  text: { weight: 1, accent: true },
  ruler: { weight: 1, accent: false },
  reticle: { weight: 2, accent: true },
  tape: { weight: 2, accent: true },
  ladder: { weight: 2, accent: true },
  readout: { weight: 2, accent: true },
  tag: { weight: 2, accent: true },
  callout: { weight: 1, accent: true },
};

// The HUD types. Each wallpaper gets one or two of them.
const HUD = ['reticle', 'tape', 'ladder', 'readout', 'tag', 'callout'];

// Makes a wallpaper. settings: { width, height, seed, accent: '#rrggbb', glitch: 0..1 }
export function renderWallpaper(canvas, settings) {
  new Wallpaper(settings).render(canvas);
}

class Wallpaper {
  constructor({ width, height, seed, accent, glitch }) {
    this.W = width;
    this.H = height;
    this.seed = seed;
    this.accent = accent;
    this.glitchAmount = glitch;
    this.rng = new Random(seed);

    // The short side sets the size of everything, so the look stays the same at any size.
    this.S0 = Math.min(width, height);
    this.cw = this.S0 * 0.137;  // grid column, and the base size of shapes
    const k = this.S0 / 1290;   // detail scale (1 on a 1290 px wide phone)
    this.u = 8 * k;             // small unit for gaps, ticks and details
    this.fontSize = 10 * k;
    this.boldSize = 11 * k;
    this.font = `${this.fontSize}px ${FONT}`;
    this.fontBold = `bold ${this.boldSize}px ${FONT}`;

    // Layout. A phone keeps the top third empty for the clock.
    // A desktop keeps space for the menu bar and the dock, and has more groups.
    if (width > height) {
      this.margin = width * 0.05;
      this.top = height * 0.1;
      this.bottom = height * 0.86;
      this.nGroups = [7, 10];
      this.nBig = [2, 3];
      this.quietTop = 0.05;  // part of the height at the top with no glitches
    } else {
      this.margin = width * 0.09;
      this.top = height * 0.34;
      this.bottom = height * 0.9;
      this.nGroups = [4, 6];
      this.nBig = [1, 2];
      this.quietTop = 0.3;
    }
  }

  // ------------------------------------------------------------ drawing helpers
  // There are two layers. The base layer has the greys.
  // The accent layer has the bright colour, and it gets a glow at the end.

  layer(accent) {
    return accent ? this.actx : this.ctx;
  }

  // Fills and/or outlines a polygon. A solid grey shape also hides the accent under it.
  poly(pts, { fill, outline, width = 1, accent = false } = {}) {
    const ctx = this.layer(accent);
    if (fill && !accent) this.erase(pts);
    trace(ctx, pts, true);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // Removes the accent inside a polygon.
  erase(pts) {
    const ctx = this.actx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    trace(ctx, pts, true);
    ctx.fill();
    ctx.restore();
  }

  // Draws a line through some points.
  line(pts, color, { width = 1, accent = false } = {}) {
    const ctx = this.layer(accent);
    trace(ctx, pts, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draws a part of a circle. Angles are in degrees, clockwise from the right.
  arc(cx, cy, r, from, to, color, { width = 1, accent = false } = {}) {
    const ctx = this.layer(accent);
    ctx.beginPath();
    ctx.arc(cx, cy, r, rad(from), rad(to));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // A filled circle.
  dot(x, y, r, color, accent = false) {
    const ctx = this.layer(accent);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // A circle outline with a dark centre.
  ring(x, y, r, color, accent = false) {
    const ctx = this.layer(accent);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = BG;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Fills a polygon with 45-degree lines.
  hatch(pts, spacing, color, direction = 1, accent = false) {
    const ctx = this.layer(accent);
    const [x0, y0, x1, y1] = bounds(pts);
    const h = y1 - y0;
    ctx.save();
    trace(ctx, pts, true);
    ctx.clip();
    ctx.beginPath();
    for (let c = x0 - h; c < x1 + h; c += spacing) {
      if (direction > 0) {
        ctx.moveTo(c, y1);
        ctx.lineTo(c + h, y0);
      } else {
        ctx.moveTo(c, y0);
        ctx.lineTo(c + h, y1);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Writes text. x, y is the top-left corner.
  write(x, y, text, color, bold = false) {
    const ctx = this.ctx;
    ctx.font = bold ? this.fontBold : this.font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // Cuts text out of the accent layer, so the dark background shows through it.
  knockout(x, y, text) {
    const ctx = this.actx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.font = this.fontBold;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // The width of some text in pixels.
  measure(text, bold = false) {
    this.ctx.font = bold ? this.fontBold : this.font;
    return this.ctx.measureText(text).width;
  }

  // A small code label. With no text, it uses a random label.
  label(x, y, text, color = TEXT) {
    this.write(x, y, text ?? fill(this.rng, this.rng.pick(LABELS)), color);
  }

  // ------------------------------------------------------------ groups
  // Each group is one or more shapes of the same size.
  // Each plan function returns { w, h, draw }.
  // draw(ox, oy, acc) draws the group with its top-left corner at ox, oy.
  // acc tells the group to use the accent colour.

  // Two neighbouring grey tones. Tiled shapes change between them (or use one).
  tones() {
    const k = this.rng.index(SOLIDS.length - 1);
    const a = SOLIDS[k];
    const b = SOLIDS[k + 1];
    return this.rng.random() < 0.6 ? [a, b] : [b, b];
  }

  // Draws polygon tiles in one style. Only one tile can use the accent.
  drawTiles(tiles, ox, oy, acc, style, hatchDirection) {
    const rng = this.rng;
    const accentTile = acc ? rng.index(tiles.length) : -1;
    const tones = this.tones();
    tiles.forEach((tile, i) => {
      const pts = move(tile, ox, oy);
      if (style === 'solid') {
        const [x0, y0, x1, y1] = bounds(pts);
        const small = (x1 - x0) * (y1 - y0) < (this.cw * 0.45) ** 2;
        if (i === accentTile && small) {
          // A small block can be fully in the accent colour.
          this.poly(pts, { fill: shade(this.accent, 0.9), accent: true });
          return;
        }
        this.poly(pts, { fill: tones[i % 2] });
      } else if (style === 'hatch') {
        this.hatch(pts, 7, DIM, hatchDirection);
        this.poly(pts, { outline: DIM });
      } else {
        this.poly(pts, { outline: LINE });
      }
      if (i === accentTile) {
        const k = rng.index(pts.length);
        this.line([pts[k], pts[(k + 1) % pts.length]], this.accent, { width: 2, accent: true });
      }
    });
  }

  // A honeycomb of 1 to 5 equal hexagons with thin gaps between them.
  planHex() {
    const rng = this.rng;
    const r = rng.pick([0.3, 0.4, 0.5]) * this.cw;
    const rot = rng.pick([0, 30]);
    const n = rng.weighted([1, 2, 3, 4, 5], [1, 3, 3, 2, 1]);

    // Grow the honeycomb one neighbour at a time.
    const d = Math.sqrt(3) * r;  // distance to a neighbour's centre
    const steps = hexSteps(d, rot);
    const cells = [[0, 0]];
    while (cells.length < n) {
      const [cx, cy] = rng.pick(cells);
      const [dx, dy] = rng.pick(steps);
      const c = [cx + dx, cy + dy];
      const free = cells.every(([a, b]) => (c[0] - a) ** 2 + (c[1] - b) ** 2 > (d * 0.5) ** 2);
      if (free) cells.push(c);
    }

    const gap = 4;
    const { tiles, w, h } = normalize(cells.map(([cx, cy]) => hexPoints(cx, cy, r - gap, rot)));
    let style = rng.pick(['solid', 'solid', 'solid', 'cored', 'outline']);
    if (style === 'cored' && r > 0.32 * this.cw) style = 'solid';  // A big hex with a hole looks like a thick ring.
    const partial = n === 1 && r > 0.45 * this.cw && style === 'outline';  // A big single hex shows only some sides.
    const tones = this.tones();

    const draw = (ox, oy, acc) => {
      const accentTile = acc ? rng.index(tiles.length) : -1;
      tiles.forEach((tile, i) => {
        const pts = move(tile, ox, oy);
        const [cx, cy] = centre(pts);
        if (partial) {
          const k0 = rng.index(6);
          const m = rng.int(2, 4);
          this.line(range(m + 1).map((j) => pts[(k0 + j) % 6]), LINE);
        } else if (style === 'outline') {
          this.poly(pts, { outline: LINE });
        } else {
          if (i === accentTile && r < 0.45 * this.cw && style === 'solid') {
            this.poly(pts, { fill: shade(this.accent, 0.9), accent: true });
            return;
          }
          this.poly(pts, { fill: tones[i % 2] });
          if (style === 'cored') this.poly(hexPoints(cx, cy, (r - gap) * 0.45, rot), { fill: BG });
        }
        if (i === accentTile) {
          const k = rng.index(6);
          this.line([pts[k], pts[(k + 1) % 6]], this.accent, { width: 2, accent: true });
        }
      });
    };
    return { w, h, draw };
  }

  // 45-degree trapezoids. They point up and down in turn, so their slanted sides fit together.
  planTrap() {
    const rng = this.rng;
    const h = this.cw * rng.pick([0.3, 0.4, 0.55]);
    const a = this.cw * rng.pick([0.25, 0.4, 0.6]);
    const gap = this.u * 0.75;
    const tiles = [];
    let x = 0;
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) tiles.push([[x, h], [x + h, 0], [x + h + a, 0], [x + 2 * h + a, h]]);
      else tiles.push([[x, 0], [x + 2 * h + a, 0], [x + h + a, h], [x + h, h]]);
      x += a + h + gap * 1.41;
    }
    const norm = normalize(tiles);
    const style = rng.pick(['solid', 'solid', 'solid', 'solid', 'solid', 'outline', 'hatch']);
    const hatchDirection = rng.pick([1, -1]);
    const draw = (ox, oy, acc) => this.drawTiles(norm.tiles, ox, oy, acc, style, hatchDirection);
    return { w: norm.w, h: norm.h, draw };
  }

  // Equal parallelograms in a row, or a mirrored pair.
  planPara() {
    const rng = this.rng;
    const h = this.cw * rng.pick([0.2, 0.3, 0.4]);
    const wd = this.cw * rng.pick([0.35, 0.5, 0.8]);
    const gap = this.u * 0.75;
    const lean = rng.pick([1, -1]);
    const para = (x) => lean > 0
      ? [[x + h, 0], [x + h + wd, 0], [x + wd, h], [x, h]]
      : [[x, 0], [x + wd, 0], [x + wd + h, h], [x + h, h]];

    let tiles;
    if (rng.random() < 0.65) {
      tiles = range(rng.int(2, 5)).map((i) => para(i * (wd + gap)));
    } else {
      const left = para(0);
      const mirrorX = 2 * (wd + h) + gap * 2;
      tiles = [left, left.map(([x, y]) => [mirrorX - x, y])];
    }
    const norm = normalize(tiles);
    const style = rng.pick(['solid', 'solid', 'solid', 'solid', 'solid', 'outline', 'hatch']);
    const hatchDirection = rng.pick([1, -1]);
    const draw = (ox, oy, acc) => this.drawTiles(norm.tiles, ox, oy, acc, style, hatchDirection);
    return { w: norm.w, h: norm.h, draw };
  }

  // A row of slanted segments, like a level meter.
  planSegments() {
    const w = this.cw * this.rng.pick([1.5, 2, 2.5]);
    const h = this.u * 2;
    const draw = (ox, oy, acc) => {
      const step = this.u * 1.5;
      const n = Math.floor((w - h) / step);
      const lit = acc ? this.rng.int(1, Math.max(1, Math.floor(n / 3))) : 0;
      for (let i = 0; i < n; i++) {
        const sx = ox + i * step;
        const seg = [[sx + h, oy], [sx + step - 3 + h, oy], [sx + step - 3, oy + h], [sx, oy + h]];
        if (i < lit) this.poly(seg, { fill: this.accent, accent: true });
        else this.poly(seg, { fill: SOLIDS[1] });
      }
    };
    return { w, h, draw };
  }

  // A row of arrow heads: >>>
  planChevrons() {
    const a = this.u * 1.5;
    const n = this.rng.int(3, 5);
    const draw = (ox, oy, acc) => {
      for (let i = 0; i < n; i++) {
        const x = ox + i * a * 1.1;
        const on = acc && i === n - 1;
        this.line([[x, oy], [x + a, oy + a], [x, oy + 2 * a]], on ? this.accent : LINE, { width: 2, accent: on });
      }
    };
    return { w: (n - 1) * a * 1.1 + a, h: 2 * a, draw };
  }

  // 1 to 3 crosshairs in a row.
  planCross() {
    const L = this.cw * 0.3;
    const n = this.rng.int(1, 3);
    const spacing = 2 * L + this.u * 3;
    const draw = (ox, oy, acc) => {
      const accentOne = acc ? this.rng.index(n) : -1;
      for (let i = 0; i < n; i++) {
        const cx = ox + L + i * spacing;
        const cy = oy + L;
        this.line([[cx - L, cy], [cx + L, cy]], DIM);
        this.line([[cx, cy - L], [cx, cy + L]], DIM);
        this.ring(cx, cy, L * 0.4, i === accentOne ? this.accent : LINE, i === accentOne);
      }
    };
    return { w: (n - 1) * spacing + 2 * L, h: 2 * L, draw };
  }

  // A field of dots, slanted into a parallelogram or narrowed into a trapezoid.
  planDots() {
    const rng = this.rng;
    const s = this.u * rng.pick([1, 1.5]);
    const cols = rng.int(6, 12);
    const rows = rng.int(3, 6);
    const shape = rng.pick(['shear', 'trap']);
    const pts = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (shape === 'shear') pts.push([(i + j) * s, j * s]);
        else if (j <= i && i <= cols - 1 - j) pts.push([i * s, j * s]);
      }
    }
    const draw = (ox, oy, acc) => {
      const accentDot = acc ? rng.index(pts.length) : -1;
      pts.forEach(([x, y], i) => {
        if (i === accentDot) this.dot(ox + x, oy + y, 2.5, this.accent, true);
        else this.dot(ox + x, oy + y, 0.9, DIM);
      });
    };
    return { w: Math.max(...pts.map((p) => p[0])), h: (rows - 1) * s, draw };
  }

  // Equal bars with a 45-degree end, stacked. Sometimes each bar steps over at 45 degrees.
  planBars() {
    const rng = this.rng;
    const n = rng.int(2, 4);
    const L = this.cw * rng.pick([0.5, 0.75, 1, 1.5]);
    const t = rng.pick([3, 4]);
    const gap = this.u * 0.75;
    const step = rng.pick([0, gap + t]);
    const draw = (ox, oy, acc) => {
      const accentBar = acc ? rng.index(n) : -1;
      for (let i = 0; i < n; i++) {
        const x = ox + i * step;
        const y = oy + i * (gap + t);
        const pts = [[x, y], [x + L, y], [x + L - t, y + t], [x, y + t]];
        if (i === accentBar) this.poly(pts, { fill: this.accent, accent: true });
        else this.poly(pts, { fill: LINE });
      }
    };
    return { w: L + (n - 1) * step, h: n * t + (n - 1) * gap, draw };
  }

  // Four corner brackets around empty space.
  planBrackets() {
    const rng = this.rng;
    const w = this.cw * rng.pick([1, 1.5, 2]);
    const h = this.cw * rng.pick([0.75, 1, 1.5]);
    const draw = (ox, oy, acc) => {
      const L = Math.min(this.u * 2, w / 3);
      const corners = [[ox, oy, 1, 1], [ox + w, oy, -1, 1], [ox + w, oy + h, -1, -1], [ox, oy + h, 1, -1]];
      for (const [x, y, sx, sy] of corners) {
        this.line([[x + sx * L, y], [x, y], [x, y + sy * L]], LINE);
      }
      if (acc) this.dot(ox + w / 2, oy + h / 2, 3, this.accent, true);
      else if (rng.random() < 0.5) this.label(ox + this.u, oy + this.u);
    };
    return { w, h, draw };
  }

  // 1 to 3 lines of small code labels.
  planText() {
    const rng = this.rng;
    const u = this.u;
    const lines = rng.int(1, 3);
    const draw = (ox, oy, acc) => {
      for (let i = 0; i < lines; i++) {
        const text = range(rng.int(1, 3)).map(() => fill(rng, rng.pick(LABELS))).join(' ');
        this.label(ox + u, oy + i * u * 1.8, text, i === 0 ? TEXT : DIM);
      }
      if (acc) this.poly([[ox, oy + 2], [ox + 3, oy + 2], [ox + 3, oy + u * 1.2], [ox, oy + u * 1.2]], { fill: this.accent, accent: true });
    };
    return { w: this.cw * 1.2, h: lines * u * 1.8, draw };
  }

  // A row of tick marks.
  planRuler() {
    const u = this.u;
    const w = this.cw * this.rng.pick([1.5, 2, 3]);
    const draw = (ox, oy) => {
      const y = oy + u;
      for (let i = 0, x = ox; x <= ox + w; i++, x += u) {
        const major = i % 5 === 0;
        this.line([[x, y], [x, y - (major ? u : u / 2)]], major ? LINE : DIM);
      }
      this.line([[ox, y], [ox + w, y]], DIM);
    };
    return { w, h: u, draw };
  }

  // The one bright element that every wallpaper has: a small solid block in the accent colour.
  planSpark() {
    const rng = this.rng;
    const u = this.u;
    const A = this.accent;
    const kind = rng.pick(['segs', 'bar', 'paras']);

    if (kind === 'segs') {
      const n = rng.int(3, 6);
      const h = u * 2.5;
      const step = u * 2.5;
      const draw = (ox, oy) => {
        for (let i = 0; i < n; i++) {
          const sx = ox + i * step;
          this.poly([[sx + h, oy], [sx + step - 3 + h, oy], [sx + step - 3, oy + h], [sx, oy + h]], { fill: A, accent: true });
        }
      };
      return { w: (n - 1) * step + step - 3 + h, h, draw };
    }

    if (kind === 'bar') {
      const L = this.cw * rng.pick([0.5, 0.7, 1.0]);
      const t = rng.pick([7, 9, 12]);
      const twin = rng.random() < 0.5;  // a thin grey bar of the same length above it
      const draw = (ox, oy) => {
        const y = oy + (twin ? u : 0);
        this.poly([[ox, y], [ox + L, y], [ox + L - t, y + t], [ox, y + t]], { fill: A, accent: true });
        if (twin) this.poly([[ox, oy], [ox + L, oy], [ox + L - 2, oy + 2], [ox, oy + 2]], { fill: LINE });
      };
      return { w: L, h: t + (twin ? u : 0), draw };
    }

    const n = rng.int(2, 3);
    const wd = u * rng.pick([3, 4, 6]);
    const h = u * rng.pick([2.5, 3]);
    const gap = u * 0.6;
    const draw = (ox, oy) => {
      for (let i = 0; i < n; i++) {
        const x = ox + i * (wd + gap);
        this.poly([[x + h, oy], [x + h + wd, oy], [x + wd, oy + h], [x, oy + h]], { fill: A, accent: true });
      }
    };
    return { w: n * (wd + gap) - gap + h, h, draw };
  }

  // ------------------------------------------------------------ HUD (military style)

  // A solid angled tag with its text cut out (dark text on a solid block).
  inverseTag(x, y, text, acc) {
    const u = this.u;
    const bh = u * 1.9;
    const bw = this.measure(text, true) + u * 1.6 + bh * 0.5;
    const pts = [[x, y], [x + bw, y], [x + bw - bh * 0.5, y + bh], [x, y + bh]];
    const ty = y + (bh - this.boldSize) / 2;
    if (acc) {
      this.poly(pts, { fill: this.accent, accent: true });
      this.knockout(x + u * 0.8, ty, text);
    } else {
      this.poly(pts, { fill: LINE });
      this.write(x + u * 0.8, ty, text, BG, true);
    }
  }

  // Targeting reticle: four arcs with gaps, ticks at the four points, a solid centre diamond.
  planReticle() {
    const rng = this.rng;
    const R = this.cw * rng.pick([0.4, 0.5, 0.65]);
    const gap = rng.pick([14, 24, 34]);
    const rot = rng.pick([0, 45]);
    const ring = rng.random() < 0.5;  // an outer ring of degree ticks
    const e = R * (ring ? 1.42 : 1.12);

    const draw = (ox, oy, acc) => {
      const cx = ox + e;
      const cy = oy + e;
      const accentArc = acc ? rng.index(4) : -1;
      for (let k = 0; k < 4; k++) {
        const on = k === accentArc;
        this.arc(cx, cy, R, rot + k * 90 + gap / 2, rot + (k + 1) * 90 - gap / 2,
          on ? this.accent : LINE, { width: on ? 2 : 1, accent: on });
      }
      for (let k = 0; k < 4; k++) {
        const a = rad(rot + k * 90);
        this.line([polar(cx, cy, R * 0.72, a), polar(cx, cy, R * 1.12, a)], LINE);
      }
      if (ring) {
        for (let deg = 0; deg < 360; deg += 10) {
          const a = rad(deg);
          const r0 = R * 1.28;
          const L = R * (deg % 30 === 0 ? 0.14 : 0.07);
          this.line([polar(cx, cy, r0, a), polar(cx, cy, r0 + L, a)], DIM);
        }
      }
      const r = 4;
      this.poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], { fill: LINE });
    };
    return { w: 2 * e, h: 2 * e, draw };
  }

  // Compass heading tape: ticks, degree labels and a solid triangle pointer.
  planTape() {
    const rng = this.rng;
    const u = this.u;
    const step = u * 1.2;
    const n = Math.floor((this.cw * rng.pick([2.5, 3, 3.5])) / step);
    const w = n * step;
    const start = 5 * rng.index(72);
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

    const draw = (ox, oy, acc) => {
      const base = oy + u * 2.6;
      this.line([[ox, base], [ox + w, base]], DIM);
      for (let i = 0; i <= n; i++) {
        const x = ox + i * step;
        const deg = (start + i * 5) % 360;
        const major = deg % 15 === 0;
        this.line([[x, base], [x, base - (major ? u * 0.9 : u * 0.45)]], major ? LINE : DIM);
        if (deg % 30 === 0) {
          const text = names[deg] ?? String(deg).padStart(3, '0');
          this.write(x - this.measure(text) / 2, base + u * 0.5, text, names[deg] ? TEXT : DIM);
        }
      }
      const cx = ox + Math.floor(n / 2) * step;
      const triangle = [[cx - u * 0.75, oy], [cx + u * 0.75, oy], [cx, oy + u]];
      if (acc) this.poly(triangle, { fill: this.accent, accent: true });
      else this.poly(triangle, { fill: LINE });
    };
    return { w, h: u * 3.1 + this.fontSize, draw };
  }

  // Altitude ladder: a vertical scale with numbers and a solid arrow pointer.
  planLadder() {
    const rng = this.rng;
    const u = this.u;
    const step = u * 1.2;
    const n = Math.floor((this.cw * rng.pick([1.5, 2, 2.5])) / step);
    const start = 10 * rng.index(90);
    const pointer = rng.int(2, Math.max(2, n - 2));
    const labelWidth = this.measure('0000');

    const draw = (ox, oy, acc) => {
      const x = ox + labelWidth + u;
      this.line([[x, oy], [x, oy + n * step]], DIM);
      for (let i = 0; i <= n; i++) {
        const y = oy + i * step;
        const k = n - i;
        const major = k % 5 === 0;
        this.line([[x, y], [x + (major ? u * 0.9 : u * 0.45), y]], major ? LINE : DIM);
        if (major) {
          const text = String(start + k * 10).padStart(4, '0');
          this.write(x - u * 0.5 - this.measure(text), y - this.fontSize * 0.6, text, TEXT);
        }
      }
      const py = oy + pointer * step;
      const hh = u * 0.7;
      const arrow = [[x + u * 1.3, py], [x + u * 2.1, py - hh], [x + u * 5.5, py - hh], [x + u * 5.5, py + hh], [x + u * 2.1, py + hh]];
      if (acc) this.poly(arrow, { fill: this.accent, accent: true });
      else this.poly(arrow, { fill: SOLIDS[2] });
    };
    return { w: labelWidth + u * 6.5, h: n * step, draw };
  }

  // Status readout: a solid tag above some lines of status text.
  planReadout() {
    const rng = this.rng;
    const u = this.u;
    const lines = rng.sample(HUD_LINES, rng.int(2, 4)).map((t) => fill(rng, t));
    const tag = fill(rng, rng.pick(TAGS));
    const lineHeight = u * 1.8;
    const textWidth = Math.max(...lines.map((t) => this.measure(t)));
    const tagWidth = this.measure(tag, true) + u * 2.6;

    const draw = (ox, oy, acc) => {
      this.inverseTag(ox, oy, tag, acc);
      const y0 = oy + u * 2.6;
      this.line([[ox, y0], [ox, y0 + lineHeight * lines.length - u * 0.4]], DIM);
      lines.forEach((text, i) => this.write(ox + u, y0 + i * lineHeight, text, i === 0 ? TEXT : DIM));
    };
    return { w: Math.max(textWidth + u, tagWidth), h: u * 2.6 + lineHeight * lines.length, draw };
  }

  // Warning tags: equal solid angled blocks with stencil text cut out.
  planTag() {
    const rng = this.rng;
    const u = this.u;
    const words = rng.sample(TAGS, rng.int(1, 3)).map((t) => fill(rng, t));
    const bh = u * 1.9;
    const bw = Math.max(...words.map((t) => this.measure(t, true))) + u * 1.6 + bh * 0.5;
    const gap = u * 0.6;
    const stack = rng.random() < 0.5;

    const draw = (ox, oy, acc) => {
      const accentTag = acc ? rng.index(words.length) : -1;
      words.forEach((text, i) => {
        const x = stack ? ox + i * bh * 0.5 : ox + i * (bw + gap);
        const y = stack ? oy + i * (bh + gap) : oy;
        const pts = [[x, y], [x + bw, y], [x + bw - bh * 0.5, y + bh], [x, y + bh]];
        const tx = x + (bw - bh * 0.5 - this.measure(text, true)) / 2;
        const ty = y + (bh - this.boldSize) / 2;
        if (i === accentTag) {
          this.poly(pts, { fill: this.accent, accent: true });
          this.knockout(tx, ty, text);
        } else {
          this.poly(pts, { fill: LINE });
          this.write(tx, ty, text, BG, true);
        }
      });
    };
    const n = words.length;
    if (stack) return { w: bw + (n - 1) * bh * 0.5, h: n * bh + (n - 1) * gap, draw };
    return { w: n * bw + (n - 1) * gap, h: bh, draw };
  }

  // A leader line that goes up at 45 degrees from a diamond to a label.
  planCallout() {
    const rng = this.rng;
    const u = this.u;
    const d = this.cw * rng.pick([0.4, 0.6, 0.8]);
    const run = this.cw * rng.pick([0.8, 1.1]);
    const text = fill(rng, rng.pick(HUD_LINES));
    const th = this.fontSize + u * 0.6;

    const draw = (ox, oy, acc) => {
      const ax = ox + 5;
      const ay = oy + th + d;
      const ex = ax + d;
      const ey = oy + th;
      this.line([[ax, ay], [ex, ey], [ex + run, ey]], LINE);
      const r = 5;
      const diamond = [[ax, ay - r], [ax + r, ay], [ax, ay + r], [ax - r, ay]];
      if (acc) this.poly(diamond, { fill: this.accent, accent: true });
      else this.poly(diamond, { outline: LINE });
      this.write(ex + u * 0.5, oy, text, TEXT);
      this.poly([[ex + run - u * 1.5, ey - 2], [ex + run, ey - 2], [ex + run, ey + 2], [ex + run - u * 1.5 + 4, ey + 2]], { fill: LINE });
    };
    return { w: 5 + d + run, h: th + d + 5, draw };
  }

  // ------------------------------------------------------------ large shapes at the edge
  // A box with x0 < 0 is on the left edge. Shapes are made for the left edge,
  // and mirrored for the right edge.

  // One or two large hexagons that run off the edge.
  bleedHex(tiles, rot, acc) {
    const rng = this.rng;
    const solid = rng.random() < 0.75;
    const border = rng.pick(['none', 'none', 'edge', 'inset']);  // a thin line, or nothing
    const tones = rng.random() < 0.6 ? [SOLIDS[0], SOLIDS[1]] : [SOLIDS[1], SOLIDS[1]];
    const accentHex = acc ? rng.index(tiles.length) : -1;

    tiles.forEach(([cx, cy, R], i) => {
      const pts = hexPoints(cx, cy, R, rot);
      if (solid) {
        this.poly(pts, { fill: tones[i % 2] });
        if (border === 'edge') this.poly(pts, { outline: DIM });
        if (border === 'inset') this.poly(hexPoints(cx, cy, R * 0.9, rot), { outline: DIM });
      } else {
        this.poly(pts, { outline: LINE });
      }
      if (i === accentHex) {
        // Light part of one side that is on the screen.
        const onScreen = range(6).filter((k) => {
          const [mx, my] = centre([pts[k], pts[(k + 1) % 6]]);
          return mx > 0 && mx < this.W && my > this.top * 0.95 && my < this.H;
        });
        if (onScreen.length) {
          const k = rng.pick(onScreen);
          const t0 = rng.uniform(0.1, 0.5);
          const t1 = t0 + rng.uniform(0.15, 0.35);
          const a = pts[k];
          const b = pts[(k + 1) % 6];
          this.line([mix(a, b, t0), mix(a, b, t1)], this.accent, { width: 2, accent: true });
        }
      }
    });
  }

  // A border line just inside the screen edge. It steps inward at 45 degrees.
  bleedRail(box, acc) {
    const rng = this.rng;
    const u = this.u;
    const X = this.mirror(box);
    const [, y0, , y1] = box;
    const a = u * 3;
    const d = u * rng.pick([2, 3, 4]);
    const ym = y0 + (y1 - y0) * rng.uniform(0.3, 0.7);
    const path = [[a, y0], [a, ym], [a + d, ym + d], [a + d, y1]];
    this.line(path.map(([x, y]) => [X(x), y]), LINE);
    for (let y = y0 + u, i = 0; y < ym - u; y += u, i++) {
      this.line([[X(a), y], [X(a - (i % 4 === 0 ? u : u * 0.5)), y]], DIM);
    }
    for (const [x, y] of [path[0], path[3]]) {
      const r = 4;
      this.poly([[X(x), y - r], [X(x) + r, y], [X(x), y + r], [X(x) - r, y]], { fill: LINE });
    }
    if (acc) {
      const ya = ym + d + (y1 - ym - d) * rng.uniform(0.2, 0.6);
      this.line([[X(a + d), ya], [X(a + d), ya + u * 4]], this.accent, { width: 3, accent: true });
    }
  }

  // A solid (or hatched) 45-degree band that runs off the edge.
  bleedHatch(box, acc) {
    const rng = this.rng;
    const X = this.mirror(box);
    let [x0, y0, x1, y1] = box;
    if (x0 >= 0) [x0, x1] = [this.W - x1, this.W - x0];  // back to left-edge numbers
    const h = y1 - y0;
    const band = [[x0, y0], [x1, y0], [x1 - h, y1], [x0, y1]].map(([x, y]) => [X(x), y]);
    const spacing = rng.pick([6, 8, 10]);
    let direction = rng.pick([1, -1]);
    if (box[0] >= 0) direction = -direction;
    const capWidth = Math.min(this.u * 3, (x1 - x0) * 0.25);
    const cap = [[x1 - capWidth, y0], [x1, y0], [x1 - h, y1], [x1 - h - capWidth, y1]].map(([x, y]) => [X(x), y]);

    if (rng.random() < 0.7) {
      this.poly(band, { fill: rng.pick([SOLIDS[0], SOLIDS[1]]) });
      if (acc) this.poly(cap, { fill: shade(this.accent, 0.9), accent: true });
    } else {
      this.hatch(band, spacing, DIM, direction);
      this.line([[X(x1), y0], [X(x1 - h), y1]], LINE);
      if (acc) this.hatch(cap, spacing, shade(this.accent, 0.8), direction, true);
    }
  }

  // Huge radar arcs with the centre off the screen: thin rings, ticks and a solid band.
  bleedArc(cx, cy, R, side, acc) {
    const rng = this.rng;
    const u = this.u;
    const span = 70;  // degrees of arc that face into the screen
    const mid = side < 0 ? 0 : 180;
    const a0 = mid - span;
    const a1 = mid + span;
    for (const f of [1.0, 0.82]) this.arc(cx, cy, R * f, a0, a1, DIM);
    const bandStart = mid + rng.uniform(-span * 0.8, span * 0.2);
    const bandEnd = bandStart + rng.uniform(15, 35);
    const bandWidth = u * 1.6;
    this.arc(cx, cy, R * 0.9 - bandWidth / 2, bandStart, bandEnd, SOLIDS[2], { width: bandWidth });
    for (let deg = a0; deg <= a1; deg += 3) {
      const major = deg % 15 === 0;
      this.line([polar(cx, cy, R, rad(deg)), polar(cx, cy, R + u * (major ? 1 : 0.5), rad(deg))], major ? LINE : DIM);
    }
    if (acc) {
      const c0 = mid + rng.uniform(-span * 0.6, span * 0.4);
      this.arc(cx, cy, R * 0.82, c0, c0 + 6, this.accent, { width: 3, accent: true });
    }
  }

  // For a box on the right edge, gives a function that mirrors x. On the left edge, x stays.
  mirror(box) {
    return box[0] < 0 ? (x) => x : (x) => this.W - x;
  }

  // ------------------------------------------------------------ layout

  layout() {
    const { rng, W, H, u, cw, margin, top, bottom } = this;
    const span = bottom - top;
    const groups = [];
    const taken = [];       // boxes that are in use
    const used = new Set(); // group types that are in use
    this.big = [];          // where the large shapes are on the screen, for the glitches

    // True if a box (with padding) touches a box that is in use.
    const hits = (b, pad) => taken.some((t) =>
      b[0] - pad < t[2] && b[2] + pad > t[0] && b[1] - pad < t[3] && b[3] + pad > t[1]);

    // 1. Large shapes. They always run off a screen edge, and each one uses up a group type.
    const consumes = { hex: 'hex', hatch: 'para', rail: 'ruler', arc: 'reticle' };
    const kinds = ['hex', 'hex', 'hex', 'rail', 'rail', 'hatch', 'hatch', 'arc', 'arc'];
    let side = rng.pick([-1, 1]);
    const bigCount = rng.int(...this.nBig);
    for (let i = 0; i < bigCount; i++) {
      const kind = rng.pick(kinds.filter((k) => !used.has(consumes[k])));
      used.add(consumes[kind]);
      const first = i === 0;
      let box;
      let draw;
      let pad;

      if (kind === 'hex') {
        const R = this.S0 * (first ? rng.uniform(0.28, 0.42) : rng.uniform(0.14, 0.22));
        const rot = rng.pick([0, 30]);
        const cx = R * rng.uniform(-0.55, 0.15);
        const cy = rng.uniform(top + R * 0.9, H * 0.92);
        let cells = [[cx, cy]];
        if (rng.random() < 0.45) {
          // A second hex of the same size, next to the first.
          const d = Math.sqrt(3) * R;
          const options = hexSteps(d, rot).filter(([dx, dy]) =>
            Math.abs(dy) > 1 && dx < d * 0.6 && cy + dy > top && cy + dy < H * 1.05);
          if (options.length) {
            const [dx, dy] = rng.pick(options);
            cells.push([cx + dx, cy + dy]);
          }
        }
        if (side > 0) cells = cells.map(([x, y]) => [W - x, y]);
        const tiles = cells.map(([x, y]) => [x, y, R - 5]);
        const xs = cells.map((c) => c[0]);
        const ys = cells.map((c) => c[1]);
        box = [Math.min(...xs) - R, Math.min(...ys) - R, Math.max(...xs) + R, Math.max(...ys) + R];
        draw = (acc) => this.bleedHex(tiles, rot, acc);
        pad = -cw * 0.25;
      } else if (kind === 'arc') {
        const R = this.S0 * (first ? rng.uniform(0.5, 0.75) : rng.uniform(0.3, 0.45));
        let cx = -R * rng.uniform(0.6, 0.85);
        const cy = rng.uniform(top + R * 0.4, bottom);
        if (side > 0) cx = W - cx;
        const reach = R * 1.06 + u;
        box = [cx - reach, cy - reach, cx + reach, cy + reach];
        const arcSide = side;
        draw = (acc) => this.bleedArc(cx, cy, R, arcSide, acc);
        pad = u * 2;
      } else {
        if (kind === 'rail') {
          const y0 = top + span * rng.uniform(0.03, 0.35);
          box = [-1, y0, u * 8, Math.min(bottom, y0 + span * rng.uniform(0.35, 0.7))];
        } else {
          const y0 = top + span * rng.uniform(0.07, 0.93);
          const x1 = this.S0 * (first ? rng.uniform(0.3, 0.6) : rng.uniform(0.15, 0.3));
          box = [-u * 8, y0, x1, y0 + u * rng.pick([3, 4, 6])];
        }
        if (side > 0) box = [W - box[2], box[1], W - box[0], box[3]];
        const b = box;
        draw = kind === 'rail' ? (acc) => this.bleedRail(b, acc) : (acc) => this.bleedHatch(b, acc);
        pad = u * 2;
      }

      // Only the part on the screen blocks other groups.
      const visible = [Math.max(0, box[0]), Math.max(top, box[1]), Math.min(W, box[2]), Math.min(H, box[3])];
      taken.push([visible[0] - pad, visible[1] - pad, visible[2] + pad, visible[3] + pad]);
      if (kind !== 'rail') this.big.push(visible);
      groups.push({ name: kind, box, draw, accentOk: true, bleed: true });
      side = -side;
    }

    // 2. The list of small groups: the bright spark, one or two HUD groups, then others.
    //    Each type shows only once.
    const available = Object.keys(GROUPS).filter((t) => !used.has(t));
    const take = (t) => available.splice(available.indexOf(t), 1);
    const queue = ['spark'];
    const huds = HUD.filter((t) => available.includes(t));
    for (const t of rng.sample(huds, Math.min(huds.length, rng.int(1, 2)))) {
      take(t);
      queue.push(t);
    }
    const more = rng.int(...this.nGroups) - (queue.length - 1);
    for (let i = 0; i < more && available.length; i++) {
      const t = rng.weighted(available, available.map((a) => GROUPS[a].weight));
      take(t);
      queue.push(t);
    }

    // 3. Put each small group in a free place on a half-column grid.
    const snap = cw / 2;
    for (const type of queue) {
      const { w, h, draw } = this[planName(type)]();
      if (w > W - 2 * margin || h > span) continue;
      for (let tries = 0; tries < 200; tries++) {
        const ox = margin + rng.int(0, Math.floor((W - 2 * margin - w) / snap)) * snap;
        const oy = top + rng.int(0, Math.floor((span - h) / snap)) * snap;
        const box = [ox, oy, ox + w, oy + h];
        if (!hits(box, u * 4)) {
          taken.push(box);
          const accentOk = type !== 'spark' && GROUPS[type].accent;
          groups.push({ name: type, box, ox, oy, draw, accentOk, bleed: false });
          break;
        }
      }
    }
    this.rows = Math.floor(span / cw);
    this.cols = Math.floor((W - 2 * margin) / cw);
    return groups;
  }

  // A thin line from one group to another. It bends at 45 degrees and has rings at the ends.
  // It does not draw the line if the line goes through another group.
  connector(a, b, boxes) {
    const u = this.u;
    const ax = a[2] + u;
    const ay = (a[1] + a[3]) / 2;
    const bx = b[0] - u;
    const by = (b[1] + b[3]) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx < Math.abs(dy) + u * 4) return false;
    const run = (dx - Math.abs(dy)) / 2;
    const pts = [[ax, ay], [ax + run, ay], [ax + run + Math.abs(dy), by], [bx, by]];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s <= 40; s++) {
        const [x, y] = mix(pts[i], pts[i + 1], s / 40);
        const blocked = boxes.some((box) => box !== a && box !== b &&
          box[0] - u < x && x < box[2] + u && box[1] - u < y && y < box[3] + u);
        if (blocked) return false;
      }
    }
    this.line(pts, DIM);
    this.ring(ax, ay, 3, LINE);
    this.ring(bx, by, 3, LINE);
    return true;
  }

  // ------------------------------------------------------------ render

  render(canvas) {
    const { rng, W, H, u } = this;
    canvas.width = W;
    canvas.height = H;
    const base = new OffscreenCanvas(W, H);
    const accentLayer = new OffscreenCanvas(W, H);
    this.ctx = base.getContext('2d');
    this.actx = accentLayer.getContext('2d');

    // Background: near-black, a little lighter at the bottom.
    const gradient = this.ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, BG);
    gradient.addColorStop(1, '#0d0e10');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, W, H);

    const groups = this.layout();

    // Faint guides: one to three grid lines and one long 45-degree line.
    const guides = rng.int(1, 3);
    for (let i = 0; i < guides; i++) {
      if (rng.random() < 0.5) {
        const x = this.margin + rng.int(0, this.cols) * this.cw;
        this.line([[x, rng.uniform(0.1, 0.4) * H], [x, H]], FAINT);
      } else {
        const y = this.top + rng.int(0, this.rows) * this.cw;
        this.line([[0, y], [W, y]], FAINT);
      }
    }
    if (rng.random() < 0.7) {
      const x0 = rng.uniform(-0.3, 0.6) * W;
      const y0 = rng.uniform(0.3, 0.6) * H;
      const L = W * 1.2;
      this.line([[x0, y0], [x0 + L, y0 + rng.pick([1, -1]) * L]], FAINT);
    }

    // The spark always uses the accent. Sometimes one more group uses it too.
    const canAccent = groups.map((g, i) => (g.accentOk ? i : -1)).filter((i) => i >= 0);
    const accentGroups = new Set(rng.sample(canAccent, Math.min(canAccent.length, rng.pick([0, 1]))));

    // Sometimes a thin line connects two small groups.
    const smallBoxes = groups.filter((g) => !g.bleed).map((g) => g.box);
    if (rng.random() < 0.6) {
      const order = [...smallBoxes].sort((a, b) => a[0] - b[0]);
      const pairs = [];
      for (const a of order) for (const b of order) if (b[0] > a[2] + u * 8) pairs.push([a, b]);
      rng.shuffle(pairs);
      const allBoxes = groups.map((g) => g.box);
      for (const [a, b] of pairs.slice(0, 5)) if (this.connector(a, b, allBoxes)) break;
    }

    // Draw the groups. Some small groups get a label below them.
    groups.forEach((g, i) => {
      const acc = accentGroups.has(i);
      if (g.bleed) {
        g.draw(acc);
        return;
      }
      g.draw(g.ox, g.oy, acc);
      if (rng.random() < 0.3 && g.name !== 'text') this.label(g.box[0], g.box[3] + u * 1.2, undefined, DIM);
    });

    // The seed, small, at the bottom left.
    this.label(this.margin, H * 0.93, String(this.seed).padStart(6, '0'), DIM);

    // Put the layers together and add the glow.
    const out = canvas.getContext('2d', { willReadFrequently: true });
    out.drawImage(base, 0, 0);
    out.drawImage(accentLayer, 0, 0);
    addGlow(out, accentLayer, 4, 0.6);
    addGlow(out, accentLayer, 16, 0.35);

    // Effects on the pixels.
    const image = out.getImageData(0, 0, W, H);
    if (this.glitchAmount > 0) {
      glitch(image, {
        amount: this.glitchAmount,
        seed: this.seed,
        accent: hexToRgb(this.accent),
        quietTop: this.quietTop,
        big: this.big,
      });
    }
    finish(image, this.seed);
    out.putImageData(image, 0, 0);
  }
}

// ------------------------------------------------------------ small helpers

// Adds a soft glow of a layer. The layer is made smaller, then drawn back at full size.
// That blurs it. 'shrink' sets how soft the glow is. 'strength' sets how bright it is.
function addGlow(ctx, layer, shrink, strength) {
  let small = layer;
  // Halve the size in steps. One large step skips pixels and looks rough.
  for (let f = 2; f <= shrink; f *= 2) {
    const next = new OffscreenCanvas(Math.max(1, Math.round(layer.width / f)), Math.max(1, Math.round(layer.height / f)));
    const nctx = next.getContext('2d');
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(small, 0, 0, next.width, next.height);
    small = next;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, layer.width, layer.height);
  ctx.restore();
}

// Makes a path through some points.
function trace(ctx, pts, close) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
}

// The six corners of a hexagon. rot 30 gives a point at the top. rot 0 gives a flat top.
function hexPoints(cx, cy, r, rot = 30) {
  return range(6).map((k) => [cx + r * Math.cos(rad(rot + 60 * k)), cy - r * Math.sin(rad(rot + 60 * k))]);
}

// The six steps from a hexagon's centre to its neighbours' centres.
function hexSteps(d, rot) {
  return range(6).map((k) => [d * Math.cos(rad(rot + 30 + 60 * k)), -d * Math.sin(rad(rot + 30 + 60 * k))]);
}

// Moves shapes so that together their top-left corner is at 0, 0. Also gives their size.
function normalize(tiles) {
  const all = tiles.flat();
  const [x0, y0, x1, y1] = bounds(all);
  return { tiles: tiles.map((t) => move(t, -x0, -y0)), w: x1 - x0, h: y1 - y0 };
}

// The box around some points: [left, top, right, bottom].
function bounds(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const move = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const polar = (cx, cy, r, angle) => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
const range = (n) => Array.from({ length: n }, (_, i) => i);

// Puts a random digit in place of each # and a random letter in place of each @.
function fill(rng, template) {
  return template.replace(/[#@]/g, (c) => (c === '#' ? String(rng.int(0, 9)) : rng.pick('ABCDEFGHJKLMNPRSTVXZ')));
}
const rad = (deg) => (deg * Math.PI) / 180;

// The name of the plan function for a group type: 'hex' gives 'planHex'.
const planName = (type) => 'plan' + type[0].toUpperCase() + type.slice(1);

// '#ff5c18' gives [255, 92, 24].
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// A colour made darker (k < 1) or brighter (k > 1).
function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.min(255, Math.floor(v * k)));
  return `rgb(${r}, ${g}, ${b})`;
}
