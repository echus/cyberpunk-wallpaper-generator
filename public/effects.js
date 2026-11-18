// Effects on the finished picture: digital glitches, darker edges (vignette) and film grain.
// They change the raw pixels. Each pixel has 4 numbers: red, green, blue and alpha.

import { Random } from './random.js';

// Digital damage. Most of it goes to rows with marks on them, and to the large shapes.
// amount: 0 is none, 1 is heavy. big: boxes of the large shapes on the screen.
// scale: the size of the picture, 1 on a 1290 px wide phone. Sizes below are in pixels at scale 1.
// dataColor: the grey of the broken data blocks.
export function glitch(image, { amount, seed, accent, quietTop, big, scale = 1, dataColor = [70, 76, 86] }) {
  const { data, width: w, height: h } = image;
  const rng = new Random((seed ^ 0x9e3779b9) >>> 0);
  const px = (v) => Math.max(1, Math.round(v * scale));
  // A whole number of pixels from a to b, at scale 1.
  const size = (a, b) => rng.int(px(a), px(b));

  // The background colour of each row.
  const rowBg = [];
  for (let y = 0; y < h; y++) rowBg.push(rowBackground(data, w, y));

  // How much is on each row: the average difference from the background.
  let activity = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const [br, bg, bb] = rowBg[y];
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      sum += Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb));
    }
    activity[y] = sum / w;
  }
  activity = smooth(activity, px(25));

  // Keep the top quiet: the clock on a phone, the menu bar on a desktop.
  for (let y = 0; y < Math.floor(h * quietTop); y++) activity[y] *= 0.05;

  // The large shapes get most of the damage. More large shapes give more damage.
  const boost = average(activity) * 4;
  for (const [, y0, , y1] of big) {
    for (let y = Math.floor(y0); y < Math.min(h, y1); y++) activity[y] += boost;
  }
  amount *= 1 + 0.6 * big.length;

  // Picks a row. A row with more activity comes up more often.
  const floor = average(activity) * 0.05;
  const cumulative = new Float64Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    total += activity[y] + floor;
    cumulative[y] = total;
  }
  const pickRow = () => {
    const target = rng.random() * total;
    let lo = 0;
    let hi = h - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // A band of rows, from minHeight to maxHeight high, around a picked row.
  const band = (minHeight, maxHeight) => {
    const bandHeight = size(minHeight, maxHeight);
    const y0 = clamp(pickRow() - Math.floor(bandHeight / 2), 0, h - bandHeight);
    return [y0, y0 + bandHeight];
  };
  // How many times to do an effect. The number goes up with the amount.
  const count = (base) => rng.poisson(base * amount * 2);
  const sign = () => rng.pick([-1, 1]);

  // 1. Bands of rows that slide sideways. Most are thin, about 1 in 4 is thick.
  //    Some also split into red and blue.
  const slices = Math.max(1, count(3));
  for (let n = 0; n < slices; n++) {
    const [y0, y1] = rng.random() < 0.25 ? band(30, 110) : band(1, 28);
    shiftRows(data, w, y0, y1, sign() * size(6, 29 + Math.floor(140 * amount)));
    if (rng.random() < 0.45) {
      const k = size(2, 3 + Math.floor(10 * amount));
      shiftRows(data, w, y0, y1, k, [0]);
      shiftRows(data, w, y0, y1, -k, [2]);
    }
  }

  // 2. A block is cut out and moved over a little. Sometimes a light line shows at the cut.
  const blocks = count(1.5);
  for (let n = 0; n < blocks; n++) {
    const [y0, y1] = band(20, 240);
    const blockWidth = Math.floor(w * rng.uniform(0.15, 0.7));
    const x0 = rng.int(0, w - blockWidth - 1);
    const dx = sign() * size(8, 19 + Math.floor(80 * amount));
    moveBlock(data, w, x0, y0, blockWidth, y1 - y0, dx);
    if (rng.random() < 0.5) {
      for (let x = Math.max(0, x0 + dx); x < Math.min(w, x0 + dx + blockWidth); x++) {
        const i = (y0 * w + x) * 4;
        data[i] += 18;
        data[i + 1] += 18;
        data[i + 2] += 18;
      }
    }
  }

  // 3. Thick slices through each large shape that slide far to the side.
  for (const [, top, , bottom] of big) {
    const y0 = Math.floor(top);
    const y1 = Math.floor(bottom);
    const shears = rng.int(2, 4);
    for (let n = 0; n < shears; n++) {
      const sliceHeight = size(6, 120);
      const sy = rng.int(y0, Math.max(y0 + 1, y1 - sliceHeight) - 1);
      const ey = Math.min(h, sy + sliceHeight);
      shiftRows(data, w, sy, ey, sign() * size(15, 24 + Math.floor(160 * Math.min(amount, 1.5))));
      if (rng.random() < 0.6) {
        const k = size(3, 9);
        shiftRows(data, w, sy, ey, k, [0]);
        shiftRows(data, w, sy, ey, -k, [2]);
      }
    }
  }

  // 4. Colour shift: in a thin band, swap the colour channels of the marks (not the background).
  //    Only swaps that give blue or violet. Green does not look good here.
  //    A row gets one swap at most. Two swaps on one row give other colours, for example pink.
  const shifts = count(0.8);
  const swapped = new Uint8Array(h);
  for (let n = 0; n < shifts; n++) {
    const [y0, y1] = band(2, 24);
    const order = rng.pick([[2, 1, 0], [1, 2, 0]]);
    for (let y = y0; y < y1; y++) {
      if (swapped[y]) continue;
      swapped[y] = 1;
      const [br, bg, bb] = rowBg[y];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rgb = [data[i], data[i + 1], data[i + 2]];
        const isMark = Math.max(Math.abs(rgb[0] - br), Math.abs(rgb[1] - bg), Math.abs(rgb[2] - bb)) > 10;
        if (!isMark) continue;
        data[i] = rgb[order[0]];
        data[i + 1] = rgb[order[1]];
        data[i + 2] = rgb[order[2]];
      }
    }
  }

  // 5. Small blocks of broken data: square pixels in grey or in the accent colour.
  const dataBlocks = count(1.5);
  for (let n = 0; n < dataBlocks; n++) {
    const [y0] = band(1, 1);
    const blockHeight = size(3, 9);
    const blockWidth = size(20, 119);
    const x0 = rng.int(0, w - blockWidth - 1);
    const cell = px(rng.pick([2, 3, 4]));
    const color = rng.random() < 0.3 ? accent.map((v) => v * 0.8) : dataColor;
    for (let cy = 0; cy < blockHeight; cy += cell) {
      for (let cx = 0; cx < blockWidth; cx += cell) {
        if (rng.random() >= 0.45) continue;
        for (let y = y0 + cy; y < Math.min(h, y0 + cy + cell, y0 + blockHeight); y++) {
          for (let x = x0 + cx; x < Math.min(x0 + cx + cell, x0 + blockWidth); x++) {
            const i = (y * w + x) * 4;
            data[i] = color[0];
            data[i + 1] = color[1];
            data[i + 2] = color[2];
          }
        }
      }
    }
  }

  // 6. Red moves 1 pixel (at scale 1) to the right on the whole picture: a soft red/cyan edge on thin lines.
  if (amount > 0.25) shiftRows(data, w, 0, h, px(1), [0]);
}

// Makes the edges a little darker and adds fine grain. vignette: how much darker the corners are.
export function finish(image, seed, vignette = 0.3) {
  const { data, width: w, height: h } = image;
  const rng = new Random(seed + 1);
  for (let y = 0; y < h; y++) {
    const ny = (y / (h - 1)) * 2 - 1;  // -1 at the top, 1 at the bottom
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1)) * 2 - 1;  // -1 at the left, 1 at the right
      const dark = 1 - vignette * Math.min(1, nx * nx * 0.8 + ny * ny * 0.6);
      // The sum of three random numbers is near a bell curve. That looks like film grain.
      const grain = (rng.random() + rng.random() + rng.random() - 1.5) * 5.6;
      const i = (y * w + x) * 4;
      data[i] = data[i] * dark + grain;
      data[i + 1] = data[i + 1] * dark + grain;
      data[i + 2] = data[i + 2] * dark + grain;
    }
  }
}

// ------------------------------------------------------------ helpers

// Moves rows y0 to y1 sideways by dx pixels. Pixels that go off one side come back on the other.
// channels: which colours move (0 red, 1 green, 2 blue).
function shiftRows(data, w, y0, y1, dx, channels = [0, 1, 2]) {
  dx = ((dx % w) + w) % w;
  for (let y = y0; y < y1; y++) {
    const start = y * w * 4;
    const row = data.slice(start, start + w * 4);
    for (let x = 0; x < w; x++) {
      const from = x * 4;
      const to = start + ((x + dx) % w) * 4;
      for (const c of channels) data[to + c] = row[from + c];
    }
  }
}

// Copies a block of pixels dx pixels to the side. Parts that go off the picture are lost.
function moveBlock(data, w, x0, y0, blockWidth, blockHeight, dx) {
  for (let y = y0; y < y0 + blockHeight; y++) {
    const row = data.slice((y * w + x0) * 4, (y * w + x0 + blockWidth) * 4);
    for (let x = 0; x < blockWidth; x++) {
      const tx = x0 + dx + x;
      if (tx < 0 || tx >= w) continue;
      const to = (y * w + tx) * 4;
      data[to] = row[x * 4];
      data[to + 1] = row[x * 4 + 1];
      data[to + 2] = row[x * 4 + 2];
    }
  }
}

// The usual colour of a row: the middle value of 64 pixels across it.
function rowBackground(data, w, y) {
  const r = [];
  const g = [];
  const b = [];
  for (let k = 0; k < 64; k++) {
    const i = (y * w + Math.floor((k * (w - 1)) / 63)) * 4;
    r.push(data[i]);
    g.push(data[i + 1]);
    b.push(data[i + 2]);
  }
  return [median(r), median(g), median(b)];
}

// A moving average over 'size' values, so one busy row also lifts its neighbours.
function smooth(values, size) {
  const out = new Float32Array(values.length);
  const half = Math.floor(size / 2);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = i - half; j <= i + half; j++) if (j >= 0 && j < values.length) sum += values[j];
    out[i] = sum / size;
  }
  return out;
}

const median = (list) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)];
const average = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
