# generative-wallpaper

Minimal, dark, glitchy cyberpunk wallpapers generated with Python.

```bash
pip install -r requirements.txt
python3 wallpaper.py --count 10                     # phone, 1290x2796
python3 wallpaper.py --device desktop --count 10    # desktop, 3840x2160
```

Options:

- `--seed N`: re-create a specific render (the seed is in the file name)
- `--palette sodium|cyan|acid|magenta|red`: preset accent colours
- `--accent '#ff2a6d'`: any accent colour (overrides `--palette`)
- `--glitch 0..1`: glitch intensity (default 0.5, 0 = clean)
- `--width` / `--height`: match a specific screen, e.g. `--device desktop --width 3024 --height 1964`
- `--out DIR`: output folder (default `out/`)

Earlier directions are kept as separate scripts:

- `wallpaper_city.py`: industrial cityscape
- `wallpaper_cyberware.py`: symmetric cyberware chassis
