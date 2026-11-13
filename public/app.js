// Connects the controls on the page to the wallpaper generator.

import { PALETTES, DEVICES, renderWallpaper } from './wallpaper.js';

const form = document.querySelector('#controls');
const canvas = document.querySelector('#wallpaper');
const status = document.querySelector('#status');

// Fill the colour list from the presets.
for (const name of Object.keys(PALETTES)) form.palette.add(new Option(name, name));
form.palette.add(new Option('custom', 'custom'));

// Start values.
setDevice('phone');
form.palette.value = 'sodium';
form.accent.value = PALETTES.sodium;
form.seed.value = randomSeed();
form.glitch.value = 0.5;
showGlitchValue();
draw();

// ------------------------------------------------------------ events

form.device.addEventListener('change', () => {
  setDevice(form.device.value);
  draw();
});

form.palette.addEventListener('change', () => {
  if (form.palette.value !== 'custom') form.accent.value = PALETTES[form.palette.value];
  draw();
});

form.accent.addEventListener('input', () => {
  form.palette.value = presetFor(form.accent.value);
  drawSoon();
});

form.glitch.addEventListener('input', () => {
  showGlitchValue();
  drawSoon();
});

for (const input of [form.width, form.height, form.seed]) input.addEventListener('change', draw);

document.querySelector('#new-seed').addEventListener('click', () => {
  form.seed.value = randomSeed();
  draw();
});

document.querySelector('#download').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName();
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
});

// ------------------------------------------------------------ drawing

// Draws the wallpaper. It waits one frame first, so the status text can show.
function draw() {
  status.textContent = 'Rendering…';
  requestAnimationFrame(() => setTimeout(() => {
    const start = performance.now();
    renderWallpaper(canvas, settings());
    status.textContent = `${canvas.width} × ${canvas.height} · ${Math.round(performance.now() - start)} ms`;
  }));
}

// Draws after a short pause. Use this for sliders, so it does not draw on each small move.
let timer;
function drawSoon() {
  clearTimeout(timer);
  timer = setTimeout(draw, 150);
}

// ------------------------------------------------------------ helpers

// The values of the controls, with numbers kept in a safe range.
function settings() {
  return {
    width: clamp(Math.round(form.width.value), 320, 7680),
    height: clamp(Math.round(form.height.value), 320, 7680),
    seed: clamp(Math.round(form.seed.value), 0, 999999),
    accent: form.accent.value,
    glitch: clamp(Number(form.glitch.value), 0, 1),
  };
}

function setDevice(name) {
  const [w, h] = DEVICES[name];
  form.device.value = name;
  form.width.value = w;
  form.height.value = h;
}

function showGlitchValue() {
  form.glitchValue.value = Number(form.glitch.value).toFixed(2);
}

// The preset name for a colour, or 'custom'.
function presetFor(color) {
  const match = Object.entries(PALETTES).find(([, hex]) => hex === color.toLowerCase());
  return match ? match[0] : 'custom';
}

// For example: phone_sodium_000205.png
function fileName() {
  const { width, height, seed, accent } = settings();
  const kind = width > height ? 'desktop' : 'phone';
  const colour = form.palette.value === 'custom' ? accent.slice(1) : form.palette.value;
  return `${kind}_${colour}_${String(seed).padStart(6, '0')}.png`;
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
