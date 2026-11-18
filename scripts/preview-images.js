// Makes the pictures of the app:
// - examples/preview.webp: the README picture. The app in a desktop window and on a phone, side by side.
// - public/share.jpg: the card that shows when someone shares a link to the site. The app in a desktop window.
// Each view shows the three modes: night at the top left, then dim and day in diagonal bands
// towards the bottom right.
// Run it with `npm run preview-images`. It uses the installed Chrome, or the browser at CHROME.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const PUBLIC = new URL('public/', ROOT);

// The page loads from this address, and every request to it is answered with a file from public/.
const ORIGIN = 'http://wallpaper.test';

// The modes in the order of the bands. The layout of a wallpaper is the same in each mode,
// so the bands join up.
const MODES = ['dark', 'dim', 'light'];

// height: how tall the views are in the picture, in CSS pixels. density: picture pixels for each of them.
// Each wallpaper is a custom size with the shape of its window, so it fills the window.
// The cuts between the bands rise to the right: for each pixel to the right they go `slope` pixels up.
// `cuts` are their heights at the left edge of the picture. They pass under the control panels,
// and dim is a band between night and day.
const PICTURES = [
  {
    out: 'examples/preview.webp',
    height: 600,
    density: 2,
    gap: 28,
    radius: 10,
    slope: 0.25,
    cuts: [525, 660],
    // The wallpapers are smaller than the presets, so their shapes are big enough to see in the README.
    shots: [
      {
        window: { width: 1152, height: 720 },
        query: 'seed=570791&device=custom&w=1920&h=1080&colour=rhodamine&accents=8&glitch=0.4',
      },
      {
        window: { width: 320, height: 693 },
        query: 'seed=532919&device=custom&w=720&h=1560&colour=rhodamine&accents=6&glitch=0.4',
      },
    ],
  },
  {
    // 1200 x 630 is the size that link previews expect.
    out: 'public/share.jpg',
    height: 630,
    density: 1,
    gap: 0,
    radius: 0,
    slope: 0.25,
    cuts: [520, 650],
    shots: [
      {
        window: { width: 1200, height: 630 },
        query: 'seed=570791&device=custom&w=2400&h=1260&colour=rhodamine&accents=8&glitch=0.4',
      },
    ],
  },
];

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' },
);

// Each view is taken at the pixel density it has in the picture, so the picture uses its pixels as they are.
async function shoot({ window, query }, { height, density }) {
  const page = await browser.newPage({
    viewport: window,
    deviceScaleFactor: (density * height) / window.height,
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
  return {
    width: Math.round((window.width * height) / window.height),
    src: `data:image/png;base64,${image.toString('base64')}`,
  };
}

async function makePicture(picture) {
  const { out, height, density, gap, radius, slope, cuts, shots } = picture;

  // One row of views for each mode.
  const rows = [];
  for (const mode of MODES) {
    const views = [];
    for (const shot of shots) views.push(await shoot({ ...shot, query: `${shot.query}&mode=${mode}` }, picture));
    rows.push(views);
  }

  // The rows lie on top of each other. Each row after the first shows only below its cut.
  // The views go side by side. Everything around them is see-through.
  const width = rows[0].reduce((sum, view) => sum + view.width, 0) + gap * (shots.length - 1);
  const below = (cut) => `polygon(0 ${cut}px, ${width}px ${cut - slope * width}px, ${width}px ${height}px, 0 ${height}px)`;
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 }, deviceScaleFactor: density });
  await page.setContent(`
    <style>
      body { margin: 0; }
      .stack { position: relative; width: ${width}px; height: ${height}px; }
      .row { position: absolute; inset: 0; display: flex; gap: ${gap}px; }
      img { display: block; height: ${height}px; border-radius: ${radius}px; }
    </style>
    <div class="stack">
      ${rows.map((views, i) => `
        <div class="row" style="${i ? `clip-path: ${below(cuts[i - 1])}` : ''}">
          ${views.map((view) => `<img width="${view.width}" src="${view.src}">`).join('')}
        </div>`).join('')}
    </div>
  `);
  const stack = page.locator('.stack');
  const path = fileURLToPath(new URL(out, ROOT));

  if (out.endsWith('.jpg')) {
    await stack.screenshot({ path, type: 'jpeg', quality: 88 });
  } else {
    // WebP keeps the see-through parts like PNG, but at a tenth of the size, because the grain is lossy.
    const png = await stack.screenshot({ omitBackground: true });
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
    writeFileSync(path, Buffer.from(webp.split(',')[1], 'base64'));
  }
  await page.close();
  console.log(`Wrote ${out}`);
}

for (const picture of PICTURES) await makePicture(picture);
await browser.close();
