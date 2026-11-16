# cyberpunk-wallpaper-generator

Generate minimal, glitchy cyberpunk wallpapers.

![The app on a desktop (seed 570791) and on a phone (seed 532919), both in sodium](examples/preview.jpg)

## Run locally

The site is static files in `public/`. It has no build step and no dependencies.

```bash
npx wrangler dev
```

Any static file server also works, e.g. `python3 -m http.server -d public`.

## Deploy

Deploy via Cloudflare with:

```bash
npx wrangler deploy
```

## README image

After a change to the interface, remake `examples/preview.jpg` with:

```bash
scripts/readme-image.sh
```

The script needs macOS with Google Chrome. The seeds and settings in the image are in `scripts/readme-image.html`.

## Files

- `public/wallpaper.js`: makes the shapes and the layout.
- `public/effects.js`: glitches, vignette and grain.
- `public/random.js`: seeded random numbers.
- `public/app.js`: connects the page controls to the generator.
- `scripts/readme-image.sh`: takes the README image of `scripts/readme-image.html`.

This generator was previously a Python script available at the [v1-python](https://github.com/echus/cyberpunk-wallpaper-generator/tree/v1-python) tag.
