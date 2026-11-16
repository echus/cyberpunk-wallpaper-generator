# cyberpunk-wallpaper-generator

Generate minimal, glitchy cyberpunk wallpapers for phone and desktop.

![Desktop wallpaper (seed 2077) and phone wallpaper (seed 1001)](examples/preview.jpg)

## Run locally

The site is static files in `public/`. It has no build step and no dependencies.

```bash
npx wrangler dev
```

Any static file server also works, for example `python3 -m http.server -d public`.

## Deploy

The site runs as a Cloudflare Worker with static assets (see `wrangler.jsonc`).

```bash
npx wrangler deploy
```

## Controls

- **Device**: Sets the size. Phone is 1440x3120. Desktop is 3840x2160. Custom lets you set any size.
- **Width, Height**: Set the size in pixels when the device is `custom`.
- **Colour**: Sets a preset accent: `sodium`, `cyan`, `acid`, `magenta`, `cadmium`, `uv` or `custom`.
- **Custom**: Sets any accent colour. It shows when the colour is `custom`.
- **Seed**: Sets a seed for a reproducible layout. The file name shows the seed.
- **Glitch**: Sets the glitch level. `0` is clean.
- **Download PNG**: Saves the wallpaper at full size.

The page address holds all the settings, so a link opens the same wallpaper.

## Files

- `public/wallpaper.js`: makes the shapes and the layout.
- `public/effects.js`: glitches, vignette and grain.
- `public/random.js`: seeded random numbers.
- `public/app.js`: connects the page controls to the generator.

The first version was a Python script. It is at the [`v1-python`](https://github.com/echus/cyberpunk-wallpaper-generator/tree/v1-python) tag.
