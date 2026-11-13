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

- `--device phone|desktop`: Sets the image size and the layout. `phone` is 1440x3120 and is the default. This size fits 19.5:9 phones, for example the Galaxy S25 Ultra and the iPhone Pro Max. `desktop` is 3840x2160.
- `--count N`: Sets the number of images to make. The default is 1.
- `--seed N`: Makes a specific image again. Each image has a number, the seed. The file name shows the seed. For example, `phone_sodium_000205.png` has the seed 205. The same seed and the same device give the same layout. You can change the colour or the glitch level and keep that layout. With `--count`, the script uses the seeds N, N+1, N+2 and so on.
- `--palette NAME`: Sets the accent colour from a preset. The presets are `sodium` (orange, the default), `cyan`, `acid`, `magenta`, `red` and `uv`.
- `--accent '#RRGGBB'`: Sets a custom accent colour. This option overrides `--palette`.
- `--glitch 0..1`: Sets the glitch level. `0` gives a clean image. `1` gives a heavy glitch. The default is `0.5`.
- `--width N` and `--height N`: Set the image size in pixels. Use these options to match your screen. For example: `--device desktop --width 3024 --height 1964`.
- `--out DIR`: Sets the output folder. The default is `out/`.
