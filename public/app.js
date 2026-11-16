// Connects the controls on the page to the wallpaper generator.

import { PALETTES, DEVICES, renderWallpaper } from './wallpaper.js';

const form = document.querySelector('#controls');
const canvas = document.querySelector('#wallpaper');

// Fill the colour list from the presets. Each colour has a small swatch to the left of its name.
// Browsers that cannot style the list show only the names.
for (const name of [...Object.keys(PALETTES), 'custom']) {
  const option = new Option('', name);
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  if (PALETTES[name]) swatch.style.setProperty('--swatch', PALETTES[name]);
  option.append(swatch, name);
  form.palette.add(option);
}

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

form.accents.addEventListener('input', () => {
  showSliderValues();
  drawSoon();
});

form.glitch.addEventListener('input', () => {
  showSliderValues();
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

// The up and down arrows step through a closed list, so the colour or device changes at once.
// Styled lists open on these keys by default.
for (const select of form.querySelectorAll('select')) {
  select.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || isOpen(select)) return;
    event.preventDefault();
    const index = select.selectedIndex + (event.key === 'ArrowDown' ? 1 : -1);
    if (index < 0 || index >= select.options.length) return;
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
  });
}

// On a narrow screen, device, accents and glitch are folded into one section (see style.css).
// The 'more settings' button opens and folds it. On a wide screen the button is hidden.
const moreToggle = document.querySelector('#more-toggle');
moreToggle.addEventListener('click', () => {
  const open = moreToggle.getAttribute('aria-expanded') !== 'true';
  moreToggle.setAttribute('aria-expanded', open);
});

// Drag any part of the controls that is not a field, a button or a slider setting to move them.
// This works with a mouse or a finger. The controls stay inside the window.
// The browser remembers where they are, so they come back to the same place after a reload.
form.addEventListener('pointerdown', (start) => {
  // The slider settings do not drag, so a slightly missed slider move does not move the panel.
  if (start.button !== 0 || start.target.closest('input, select, button, label:has(input[type="range"])')) return;
  start.preventDefault();
  const box = form.getBoundingClientRect();
  let moved = false;
  const move = (event) => {
    moved = true;
    placePanel(box.left + event.clientX - start.clientX, box.top + event.clientY - start.clientY);
  };
  form.setPointerCapture(start.pointerId);
  form.addEventListener('pointermove', move);
  form.addEventListener('pointerup', () => {
    form.removeEventListener('pointermove', move);
    if (moved) savePanelPosition();
  }, { once: true });
});

// Put the controls back where they were. Without a saved place they stay at the top left (see style.css).
// Saved places are only a convenience, so a browser that blocks storage just starts at the top left.
const PANEL_KEY = 'panel-position';
try {
  const saved = JSON.parse(localStorage.getItem(PANEL_KEY));
  if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) placePanel(saved.left, saved.top);
} catch {}

// When the window gets smaller, a moved panel stays inside it.
window.addEventListener('resize', () => {
  if (form.style.left) placePanel(parseFloat(form.style.left), parseFloat(form.style.top));
});

// Moves the controls to a place in the window, kept fully inside it.
function placePanel(x, y) {
  const box = form.getBoundingClientRect();
  form.style.left = `${clamp(x, 0, Math.max(0, innerWidth - box.width))}px`;
  form.style.top = `${clamp(y, 0, Math.max(0, innerHeight - box.height))}px`;
}

function savePanelPosition() {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ left: parseFloat(form.style.left), top: parseFloat(form.style.top) }));
  } catch {}
}

// ------------------------------------------------------------ drawing

// Draws the wallpaper.
// The address always shows the current settings, so a link gives the same wallpaper.
function draw() {
  // The page uses the same accent colour as the wallpaper. PALETTES in wallpaper.js is the one place to change it.
  document.documentElement.style.setProperty('--accent', form.accent.value);
  const { maxAccents } = renderWallpaper(canvas, settings());
  // The accents slider goes up to the number of elements in this layout that can use the accent.
  // A value above the new maximum drops to it.
  form.accents.max = maxAccents;
  showSliderValues();
  history.replaceState(null, '', address());
  showFit();
}

// Tells the page whether the wallpaper fills the window's width or its height.
// The preview border shows only on the sides where there is space (see style.css).
function showFit() {
  const { width, height } = settings();
  document.querySelector('.preview').dataset.fit =width / height > innerWidth / innerHeight ? 'width' : 'height';
}

window.addEventListener('resize', showFit);

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
    accents: clamp(Math.round(form.accents.value), 0, 99),
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

// Shows the value of each slider as a number, and fills each slider track up to the handle.
function showSliderValues() {
  form.accentsValue.value = form.accents.value;
  form.glitchValue.value = Number(form.glitch.value).toFixed(2);
  for (const slider of [form.accents, form.glitch]) {
    const fill = (slider.value - slider.min) / (slider.max - slider.min || 1);
    slider.style.setProperty('--fill', `${fill * 100}%`);
  }
}

// For example: wallpaper-205.png
function fileName() {
  return `wallpaper-${settings().seed}.png`;
}

// The settings as a page address, for example:
// ?seed=205&device=mobile&colour=sodium&accents=1&glitch=0.5
// ?seed=205&device=custom&w=2560&h=1440&colour=33e8ff&accents=3&glitch=0.5
function address() {
  const { width, height, seed, accent, accents, glitch } = settings();
  const params = new URLSearchParams({ seed, device: form.device.value });
  if (form.device.value === 'custom') {
    params.set('w', width);
    params.set('h', height);
  }
  params.set('colour', form.palette.value === 'custom' ? accent.slice(1) : form.palette.value);
  params.set('accents', accents);
  params.set('glitch', glitch);
  return `?${params}`;
}

// Sets the controls from the page address.
function loadAddress() {
  const params = new URLSearchParams(location.search);

  // Device: a tall screen gets the mobile size, a wide screen gets the desktop size.
  // Links from before the rename say 'phone' for 'mobile'.
  const device = params.get('device') === 'phone' ? 'mobile' : params.get('device');
  setDevice(DEVICES[device] ? device : screen.height > screen.width ? 'mobile' : 'desktop');
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
  // The slider's real maximum comes from the layout (see draw). Until then, any value is allowed.
  form.accents.max = 99;
  form.accents.value = params.get('accents') ?? 1;
  form.glitch.value = params.get('glitch') ?? 0.5;
  showSliderValues();
  showCustomFields();
}

// True when the list of a styled dropdown shows. Browsers without :open never show a styled list.
function isOpen(select) {
  try {
    return select.matches(':open');
  } catch {
    return false;
  }
}

function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
