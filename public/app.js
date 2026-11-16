// Connects the controls on the page to the wallpaper generator.

import { PALETTES, DEVICES, renderWallpaper, hexToRgb } from './wallpaper.js';

const form = document.querySelector('#controls');
const canvas = document.querySelector('#wallpaper');

// Fill the colour list from the presets.
for (const name of Object.keys(PALETTES)) form.palette.add(new Option(name, name));
form.palette.add(new Option('custom', 'custom'));

// Start values come from the address. Values that are not in the address use the defaults.
loadAddress();
draw();

// ------------------------------------------------------------ events

// For 'custom', width and height start from the last size.
form.device.addEventListener('change', () => {
  if (form.device.value !== 'custom') setDevice(form.device.value);
  showCustomFields();
  draw();
});

form.palette.addEventListener('change', () => {
  if (form.palette.value !== 'custom') form.accent.value = PALETTES[form.palette.value];
  showCustomFields();
  draw();
});

form.accent.addEventListener('input', drawSoon);

form.glitch.addEventListener('input', () => {
  showGlitchValue();
  drawSoon();
});

for (const input of [form.width, form.height]) input.addEventListener('change', draw);

// Each new seed adds a step to the browser history, so the back button goes to the last seed.
form.seed.addEventListener('change', () => {
  history.pushState(null, '', address());
  draw();
});

document.querySelector('#new-seed').addEventListener('click', () => {
  form.seed.value = randomSeed();
  history.pushState(null, '', address());
  draw();
});

window.addEventListener('popstate', () => {
  loadAddress();
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

// Drag the title to move the controls. They stay inside the window.
// On a narrow screen the controls are part of the page and do not move.
const handle = form.querySelector('h1');
handle.addEventListener('pointerdown', (start) => {
  if (getComputedStyle(form).position !== 'fixed') return;
  const box = form.getBoundingClientRect();
  const move = (event) => {
    const x = box.left + event.clientX - start.clientX;
    const y = box.top + event.clientY - start.clientY;
    form.style.left = `${clamp(x, 0, Math.max(0, innerWidth - box.width))}px`;
    form.style.top = `${clamp(y, 0, Math.max(0, innerHeight - box.height))}px`;
  };
  handle.setPointerCapture(start.pointerId);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
});

// ------------------------------------------------------------ drawing

// Draws the wallpaper.
// The address always shows the current settings, so a link gives the same wallpaper.
function draw() {
  history.replaceState(null, '', address());
  // The page uses the wallpaper's accent colour too, 20% lighter so it stands out on the dark page.
  const [r, g, b] = hexToRgb(form.accent.value).map((v) => Math.round(v + (255 - v) * 0.2));
  document.documentElement.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  renderWallpaper(canvas, settings());
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

// Width and height show only for the 'custom' device. The colour picker shows only for the 'custom' colour.
function showCustomFields() {
  document.querySelector('#size').hidden = form.device.value !== 'custom';
  document.querySelector('#custom').hidden = form.palette.value !== 'custom';
}

// Shows the glitch level as a number, and fills the slider track up to the handle.
function showGlitchValue() {
  form.glitchValue.value = Number(form.glitch.value).toFixed(2);
  form.glitch.style.setProperty('--fill', `${form.glitch.value * 100}%`);
}

// For example: wallpaper-205.png
function fileName() {
  return `wallpaper-${settings().seed}.png`;
}

// The settings as a page address, for example:
// ?seed=205&device=phone&colour=sodium&glitch=0.5
// ?seed=205&device=custom&w=2560&h=1440&colour=33e8ff&glitch=0.5
function address() {
  const { width, height, seed, accent, glitch } = settings();
  const params = new URLSearchParams({ seed, device: form.device.value });
  if (form.device.value === 'custom') {
    params.set('w', width);
    params.set('h', height);
  }
  params.set('colour', form.palette.value === 'custom' ? accent.slice(1) : form.palette.value);
  params.set('glitch', glitch);
  return `?${params}`;
}

// Sets the controls from the page address.
function loadAddress() {
  const params = new URLSearchParams(location.search);

  // Device: a tall screen gets the phone size, a wide screen gets the desktop size.
  const device = params.get('device');
  setDevice(DEVICES[device] ? device : screen.height > screen.width ? 'phone' : 'desktop');
  if (device === 'custom') {
    form.device.value = 'custom';
    form.width.value = params.get('w') ?? form.width.value;
    form.height.value = params.get('h') ?? form.height.value;
  }

  // Colour: a preset name, or a hex colour without the #.
  const colour = params.get('colour') ?? 'sodium';
  if (PALETTES[colour]) {
    form.palette.value = colour;
    form.accent.value = PALETTES[colour];
  } else if (/^[0-9a-f]{6}$/i.test(colour)) {
    form.palette.value = 'custom';
    form.accent.value = `#${colour.toLowerCase()}`;
  } else {
    form.palette.value = 'sodium';
    form.accent.value = PALETTES.sodium;
  }

  form.seed.value = params.get('seed') ?? randomSeed();
  form.glitch.value = params.get('glitch') ?? 0.5;
  showGlitchValue();
  showCustomFields();
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
