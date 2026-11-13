# cyberpunk-wallpaper-generator

Minimal, dark, glitchy cyberpunk wallpapers for phone and desktop, made with Python.

## Install

```bash
pip install -r requirements.txt
```

## Use

```bash
python3 wallpaper.py --count 10                     # 10 phone wallpapers
python3 wallpaper.py --device desktop --count 10    # 10 desktop wallpapers
```

The script writes the images to the `out/` folder.

## Options

- `--device phone|desktop`: Sets the size. `phone` is 1440x3120 (default). `desktop` is 3840x2160.
- `--count N`: Sets the number of images. Default: 1.
- `--seed N`: Sets a seed for a reproducible layout. The file name shows the seed.
- `--palette NAME`: Sets a preset accent: `sodium` (default), `cyan`, `acid`, `magenta`, `red`, `uv`.
- `--accent '#RRGGBB'`: Sets a custom accent colour. Overrides `--palette`.
- `--glitch 0..1`: Sets the glitch level. `0` is clean. Default: `0.5`.
- `--width N`, `--height N`: Set a custom size in pixels, for example to match your screen.
- `--out DIR`: Sets the output folder. Default: `out/`.
