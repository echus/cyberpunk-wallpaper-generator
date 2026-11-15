// Connects the controls on the page to the wallpaper generator.

import { PALETTES, DEVICES, renderWallpaper, hexToRgb } from './wallpaper.js';

const form = document.querySelector('#controls');
const canvas = document.querySelector('#wallpaper');
const status = document.querySelector('#status');

// Fill the colour list from the presets.
for (const name of Object.keys(PALETTES)) form.palette.add(new Option(name, name));
form.palette.add(new Option('custom', 'custom'));

// Start values.
setDevice(screen.height > screen.width ? 'phone' : 'desktop');  // A tall screen is a phone.
form.palette.value = 'sodium';
form.accent.value = PALETTES.sodium;
form.seed.value = seedFromAddress() ?? randomSeed();
form.glitch.value = 0.5;
showGlitchValue();
history.replaceState(null, '', `?seed=${form.seed.value}`);
draw();

// ------------------------------------------------------------ events

// Width and height show only when the device is 'custom'. They start from the last size.
form.device.addEventListener('change', () => {
  const custom = form.device.value === 'custom';
  document.querySelector('#size').hidden = !custom;
  if (!custom) setDevice(form.device.value);
  draw();
});

// The colour picker shows only when the colour is 'custom'.
form.palette.addEventListener('change', () => {
  const custom = form.palette.value === 'custom';
  document.querySelector('#custom').hidden = !custom;
  if (!custom) form.accent.value = PALETTES[form.palette.value];
  draw();
});

form.accent.addEventListener('input', drawSoon);

form.glitch.addEventListener('input', () => {
  showGlitchValue();
  drawSoon();
});

for (const input of [form.width, form.height]) input.addEventListener('change', draw);

// Each new seed goes into the address (?seed=123), so the back button goes to the last seed.
form.seed.addEventListener('change', () => {
  saveSeed();
  draw();
});

document.querySelector('#new-seed').addEventListener('click', () => {
  form.seed.value = randomSeed();
  saveSeed();
  draw();
});

window.addEventListener('popstate', () => {
  form.seed.value = seedFromAddress() ?? randomSeed();
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
  // The page uses the wallpaper's accent colour too, 20% lighter so it stands out on the dark page.
  // Text on the accent is dark on a light accent and light on a dark accent.
  const [r, g, b] = hexToRgb(form.accent.value).map((v) => Math.round(v + (255 - v) * 0.2));
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 145;
  document.documentElement.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  document.documentElement.style.setProperty('--on-accent', light ? '#0b0c0f' : '#f2f3f5');
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

// For example: wallpaper-205.png
function fileName() {
  return `wallpaper-${settings().seed}.png`;
}

// The seed in the address, or null if there is none.
function seedFromAddress() {
  return new URLSearchParams(location.search).get('seed');
}

function saveSeed() {
  history.pushState(null, '', `?seed=${settings().seed}`);
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
