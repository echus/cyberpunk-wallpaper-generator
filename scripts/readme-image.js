// Makes examples/preview.jpg, the picture of the app in the README:
// the app in a desktop window and on a phone, side by side.
// Run it with `npm run readme-image`. It uses the installed Chrome, or the browser at CHROME.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const PUBLIC = new URL('../public/', import.meta.url);
const OUT = fileURLToPath(new URL('../examples/preview.jpg', import.meta.url));

// The page loads from this address, and every request to it is answered with a file from public/.
const ORIGIN = 'http://wallpaper.test';

// Both views show 600 px tall in the picture. Each wallpaper is a custom size with the shape of its preset,
// but smaller, so its shapes are big enough to see in the README.
const HEIGHT = 600;
const SHOTS = [
  {
    window: { width: 1152, height: 720 },
    query: 'seed=570791&device=custom&w=1920&h=1080&colour=sodium&mode=dark&accents=8&glitch=0.4',
  },
  {
    window: { width: 320, height: 693 },
    query: 'seed=532919&device=custom&w=720&h=1560&colour=sodium&mode=light&accents=6&glitch=0.4',
  },
];

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

const views = [];
for (const shot of SHOTS) views.push(await shoot(shot));

// The views go side by side on a dark background, each with a thin rounded border.
const page = await browser.newPage({ viewport: { width: 1600, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(`
  <style>
    body { margin: 0; background: #16181d; }
    .row { display: inline-flex; gap: 28px; padding: 36px; background: #16181d; }
    img { display: block; height: ${HEIGHT}px; border: 1px solid #2a2e36; border-radius: 10px; }
  </style>
  <div class="row">
    ${views.map(({ width, src }) => `<img width="${width}" src="${src}">`).join('')}
  </div>
`);
await page.locator('.row').screenshot({ path: OUT, type: 'jpeg', quality: 88 });
await browser.close();
console.log('Wrote examples/preview.jpg');
