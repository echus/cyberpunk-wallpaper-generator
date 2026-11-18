// Makes examples/preview.webp, the picture of the app in the README:
// the app in a desktop window and on a phone, side by side. Each view shows the three modes:
// night at the top left, then dim and day in diagonal bands towards the bottom right.
// Run it with `npm run readme-image`. It uses the installed Chrome, or the browser at CHROME.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const PUBLIC = new URL('../public/', import.meta.url);
const OUT = fileURLToPath(new URL('../examples/preview.webp', import.meta.url));

// The page loads from this address, and every request to it is answered with a file from public/.
const ORIGIN = 'http://wallpaper.test';

// All views show 600 px tall in the picture. Each wallpaper is a custom size with the shape of its preset,
// but smaller, so its shapes are big enough to see in the README.
const HEIGHT = 600;
const SHOTS = [
  {
    window: { width: 1152, height: 720 },
    query: 'seed=570791&device=custom&w=1920&h=1080&colour=rhodamine&accents=8&glitch=0.4',
  },
  {
    window: { width: 320, height: 693 },
    query: 'seed=532919&device=custom&w=720&h=1560&colour=rhodamine&accents=6&glitch=0.4',
  },
];

// The modes in the order of the bands. The layout of a wallpaper is the same in each mode,
// so the bands join up.
const MODES = ['dark', 'dim', 'light'];
const GAP = 28;
// The cuts between the bands rise to the right: for each pixel to the right they go SLOPE pixels up.
// CUTS are their heights at the left edge of the picture. They pass under both control panels,
// and dim is a band between night and day.
const SLOPE = 0.25;
const CUTS = [525, 660];

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' },
);

// Each view is taken at the pixel density it has in the picture (2x, scaled down to HEIGHT),
// so the picture uses its pixels as they are.
async function shoot({ window, query }) {
  const width = Math.round((window.width * HEIGHT) / window.height);
  const page = await browser.newPage({
    viewport: window,
    deviceScaleFactor: (2 * HEIGHT) / window.height,
  });
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    return route.fulfill({ path: fileURLToPath(new URL(path, PUBLIC)) });
  });
  await page.goto(`${ORIGIN}/?${query}`);
  // No fades, so the picture shows the final colours.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const image = await page.screenshot();
  await page.close();
  return { width, src: `data:image/png;base64,${image.toString('base64')}` };
}

// One row of views for each mode.
const rows = [];
for (const mode of MODES) {
  const views = [];
  for (const shot of SHOTS) views.push(await shoot({ ...shot, query: `${shot.query}&mode=${mode}` }));
  rows.push(views);
}

// The rows lie on top of each other. Each row after the first shows only below its cut.
// The views go side by side with rounded corners. Everything around them is see-through.
const width = rows[0].reduce((sum, view) => sum + view.width, 0) + GAP * (SHOTS.length - 1);
const below = (cut) => `polygon(0 ${cut}px, ${width}px ${cut - SLOPE * width}px, ${width}px ${HEIGHT}px, 0 ${HEIGHT}px)`;
const page = await browser.newPage({ viewport: { width: 1600, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(`
  <style>
    body { margin: 0; }
    .stack { position: relative; width: ${width}px; height: ${HEIGHT}px; }
    .row { position: absolute; inset: 0; display: flex; gap: ${GAP}px; }
    img { display: block; height: ${HEIGHT}px; border-radius: 10px; }
  </style>
  <div class="stack">
    ${rows.map((views, i) => `
      <div class="row" style="${i ? `clip-path: ${below(CUTS[i - 1])}` : ''}">
        ${views.map((view) => `<img width="${view.width}" src="${view.src}">`).join('')}
      </div>`).join('')}
  </div>
`);
const png = await page.locator('.stack').screenshot({ omitBackground: true });

// WebP keeps the see-through parts like PNG, but at a tenth of the size, because the grain is lossy.
const webp = await page.evaluate(async (src) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.toDataURL('image/webp', 0.88);
}, `data:image/png;base64,${png.toString('base64')}`);
writeFileSync(OUT, Buffer.from(webp.split(',')[1], 'base64'));
await browser.close();
console.log('Wrote examples/preview.webp');
