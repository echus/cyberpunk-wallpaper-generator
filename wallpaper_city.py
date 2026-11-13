#!/usr/bin/env python3
"""Generative minimal industrial-cyberpunk phone wallpaper.

    python wallpaper_city.py                      # random seed, default palette
    python wallpaper_city.py --seed 42 --palette cyan
    python wallpaper_city.py --count 6            # batch of random seeds

Requires: pillow, numpy
"""
import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------------------------------------------------------- palettes
# Everything is near-black steel; one accent does almost all the colour work,
# accent2 shows up once or twice as a tiny indicator.
PALETTES = {
    "sodium":  dict(accent=(255, 92, 24),  accent2=(0, 220, 255)),
    "cyan":    dict(accent=(0, 226, 255),  accent2=(255, 46, 112)),
    "acid":    dict(accent=(186, 255, 18), accent2=(255, 72, 40)),
    "magenta": dict(accent=(255, 36, 120), accent2=(0, 210, 255)),
    "red":     dict(accent=(255, 34, 48),  accent2=(230, 230, 230)),
}
BG = (7, 8, 10)
FAR_FILL, FAR_LINE = (13, 14, 17), (21, 23, 27)
STEEL = [(14, 15, 18), (17, 18, 21), (19, 21, 24), (23, 25, 29)]
LINE = (46, 50, 57)
DIM = (31, 34, 39)
TEXT = (78, 84, 94)

LABELS = ["SEC-07", "N-4421", "VNT", "HX-2", "03.61", "PWR", "B12", "KL-9",
          "0x3FA2", "UNIT 4", "AUX", "Δ 118", "TR-06", "LVL 88", "ZN.C", "MK-III"]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def scale(c, k):
    return tuple(min(255, int(v * k)) for v in c)


def load_font(px):
    for path in ("/System/Library/Fonts/Menlo.ttc",
                 "/System/Library/Fonts/SFNSMono.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                pass
    return ImageFont.load_default(size=px)


class Wallpaper:
    def __init__(self, w, h, seed, palette, ss=2):
        self.rng = random.Random(seed)
        self.seed = seed
        self.S = ss
        self.W, self.H = w * ss, h * ss
        self.out_size = (w, h)
        pal = PALETTES[palette]
        self.accent, self.accent2 = pal["accent"], pal["accent2"]
        self.u = 8 * ss  # grid unit everything snaps to
        self.font_s = load_font(int(13 * ss))
        self.font_xs = load_font(int(10 * ss))
        self.hazard_used = False
        self.accent2_used = 0

    # ------------------------------------------------------------ helpers
    def snap(self, v):
        return int(round(v / self.u)) * self.u

    def r(self, a, b):
        return self.rng.uniform(a, b)

    # ------------------------------------------------------------ layers
    def sky(self):
        """Vertical gradient + low accent haze near the horizon (numpy)."""
        H, W = self.H, self.W
        y = np.linspace(0, 1, H)[:, None]
        base = np.array(BG, float)[None, None, :]
        lift = (np.clip(y - 0.35, 0, 1) ** 1.6 * 9)[..., None]  # slightly lighter low
        img = np.broadcast_to(base + lift, (H, W, 3)).copy()
        return img

    def haze(self, img):
        H, W = self.H, self.W
        y = np.linspace(0, 1, H)[:, None]
        x = np.linspace(-1, 1, W)[None, :]
        cy = self.haze_y
        band = np.exp(-((y - cy) / 0.16) ** 2) * (1 - 0.35 * x ** 2)
        acc = np.array(self.accent, float)[None, None, :]
        img += band[..., None] * acc * 0.055
        # cool fog on top so it isn't monochrome
        img += band[..., None] * np.array([6, 7, 9.0])[None, None, :]
        return img

    def far_towers(self, draw):
        rng = self.rng
        x = -self.u * 4
        while x < self.W:
            w = self.snap(self.r(0.05, 0.13) * self.W)
            top = self.snap(self.r(0.40, 0.66) * self.H)
            draw.rectangle([x, top, x + w, self.H], fill=FAR_FILL, outline=FAR_LINE, width=self.S)
            # a few faint floor lines and rare lit windows
            yy = top + self.u * 2
            while yy < self.H:
                if rng.random() < 0.35:
                    draw.line([x, yy, x + w, yy], fill=FAR_LINE, width=self.S)
                if rng.random() < 0.05:
                    wx = x + self.snap(self.r(0.1, 0.8) * w)
                    draw.rectangle([wx, yy + self.S * 2, wx + self.u, yy + self.u - self.S * 2],
                                   fill=lerp(FAR_FILL, self.accent, 0.22))
                yy += self.u * rng.choice([2, 3, 4])
            if rng.random() < 0.5:  # mast
                mx = x + w // 2
                mh = self.snap(self.r(0.02, 0.06) * self.H)
                draw.line([mx, top - mh, mx, top], fill=FAR_LINE, width=self.S)
            x += w + self.snap(self.r(-0.02, 0.05) * self.W)

    # ------------------------------------------------------------ panels
    def subdivide(self, x0, y0, x1, y1, depth, out):
        u = self.u
        w, h = x1 - x0, y1 - y0
        minsz = u * 3
        can_v, can_h = w >= minsz * 2, h >= minsz * 2
        if depth <= 0 or not (can_v or can_h) or (depth < 3 and self.rng.random() < 0.3):
            out.append((x0, y0, x1, y1))
            return
        vertical = can_v and (not can_h or (w > h * 0.7 and self.rng.random() < 0.7))
        if vertical:
            sx = self.snap(x0 + w * self.r(0.3, 0.7))
            sx = min(max(sx, x0 + minsz), x1 - minsz)
            self.subdivide(x0, y0, sx, y1, depth - 1, out)
            self.subdivide(sx, y0, x1, y1, depth - 1, out)
        else:
            sy = self.snap(y0 + h * self.r(0.25, 0.75))
            sy = min(max(sy, y0 + minsz), y1 - minsz)
            self.subdivide(x0, y0, x1, sy, depth - 1, out)
            self.subdivide(x0, sy, x1, y1, depth - 1, out)

    def decorate(self, draw, x0, y0, x1, y1):
        S, u, rng = self.S, self.u, self.rng
        draw.rectangle([x0, y0, x1, y1], fill=rng.choice(STEEL), outline=LINE, width=S)
        w, h = x1 - x0, y1 - y0
        pad = u
        ix0, iy0, ix1, iy1 = x0 + pad, y0 + pad, x1 - pad, y1 - pad
        if ix1 - ix0 < u or iy1 - iy0 < u:
            return
        roll = rng.random()
        if roll < 0.22:  # vent slats
            step = rng.choice([S * 5, S * 7, S * 9])
            yy = iy0
            while yy < iy1:
                draw.line([ix0, yy, ix1, yy], fill=DIM, width=S * 2)
                yy += step
        elif roll < 0.38:  # rivets
            rr = S * 2
            for cx, cy in ((ix0, iy0), (ix1, iy0), (ix0, iy1), (ix1, iy1)):
                draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=DIM)
        elif roll < 0.46:  # cross brace
            draw.line([ix0, iy0, ix1, iy1], fill=DIM, width=S)
            draw.line([ix0, iy1, ix1, iy0], fill=DIM, width=S)
        elif roll < 0.54:  # dot grid
            step = u
            for gx in range(ix0, ix1 + 1, step):
                for gy in range(iy0, iy1 + 1, step):
                    draw.point([(gx, gy), (gx + 1, gy), (gx, gy + 1), (gx + 1, gy + 1)], fill=DIM)
        elif roll < 0.60 and w > u * 7 and h > u * 3:  # label
            txt = rng.choice(LABELS)
            draw.text((ix0, iy0), txt, font=self.font_xs, fill=TEXT)
        elif roll < 0.645:  # lit window / status lamp
            lw = min(ix1 - ix0, rng.choice([u, u * 2, u * 3]))
            lh = rng.choice([S * 3, S * 4, u // 2])
            k = rng.choice([0.35, 0.55, 0.9])
            self.adraw.rectangle([ix0, iy0, ix0 + lw, iy0 + lh], fill=scale(self.accent, k))
        elif roll < 0.68 and not self.hazard_used and w > u * 6 and h > u * 2:
            self.hazard(ix0, iy0, ix1, min(iy1, iy0 + u * 2))
            self.hazard_used = True
        elif roll < 0.70 and self.accent2_used < 2:
            rr = S * 3
            self.adraw.ellipse([ix1 - rr * 2, iy0, ix1, iy0 + rr * 2], fill=self.accent2)
            self.accent2_used += 1

    def hazard(self, x0, y0, x1, y1):
        """Diagonal hazard stripes, drawn into the accent layer, clipped."""
        S = self.S
        w, h = x1 - x0, y1 - y0
        tile = Image.new("RGB", (w, h), (0, 0, 0))
        td = ImageDraw.Draw(tile)
        step = S * 12
        for i in range(-h, w + h, step):
            td.polygon([(i, h), (i + step // 2, h), (i + step // 2 + h, 0), (i + h, 0)],
                       fill=scale(self.accent, 0.7))
        self.alayer.paste(tile, (x0, y0))

    # ------------------------------------------------------------ towers
    def tower(self, draw, x0, top, w):
        S, u, rng = self.S, self.u, self.rng
        x1 = x0 + w
        # setback crown
        if rng.random() < 0.7:
            inset = self.snap(w * self.r(0.12, 0.3))
            ch = self.snap(self.r(0.03, 0.07) * self.H)
            cells = []
            self.subdivide(x0 + inset, top - ch, x1 - inset, top, 2, cells)
            for c in cells:
                self.decorate(draw, *c)
            crown_top, crown_x = top - ch, (x0 + x1) // 2
        else:
            crown_top, crown_x = top, x0 + self.snap(w * self.r(0.2, 0.8))
        # mast with beacon
        if rng.random() < 0.85:
            mh = self.snap(self.r(0.04, 0.12) * self.H)
            mh = max(u * 4, min(mh, crown_top - self.snap(0.25 * self.H)))  # keep clock zone clear
            mx = crown_x
            draw.line([mx, crown_top - mh, mx, crown_top], fill=LINE, width=S * 2)
            for k in range(1, int(mh / (u * 3))):
                ty = crown_top - k * u * 3
                draw.line([mx - S * 4, ty, mx + S * 4, ty], fill=DIM, width=S)
            br = S * 3
            self.adraw.ellipse([mx - br, crown_top - mh - br, mx + br, crown_top - mh + br],
                               fill=self.accent)
            self.beacons.append((mx, crown_top - mh))
        # body: stacked segments, each subdivided
        y = top
        while y < self.H:
            sh = self.snap(self.r(0.06, 0.2) * self.H)
            cells = []
            self.subdivide(x0, y, x1, min(y + sh, self.H + u * 4), rng.choice([3, 4, 5]), cells)
            for c in cells:
                self.decorate(draw, *c)
            # floor band
            draw.rectangle([x0 - S * 2, y, x1 + S * 2, y + S * 3], fill=LINE)
            y += sh
        # side pipes
        if rng.random() < 0.6:
            side = rng.choice([x0 - u, x1 + u // 2])
            py = top + self.snap(self.r(0.02, 0.1) * self.H)
            draw.rectangle([side, py, side + u // 2, self.H], fill=STEEL[1], outline=LINE, width=S)
            yy = py + u * 2
            while yy < self.H:
                draw.line([side - S * 2, yy, side + u // 2 + S * 2, yy], fill=LINE, width=S * 2)
                yy += u * rng.choice([4, 6, 8])
        # vertical light strip
        if rng.random() < 0.35:
            sx = rng.choice([x0 + S * 2, x1 - S * 2])
            sy0 = top + self.snap(self.r(0.0, 0.1) * self.H)
            sy1 = sy0 + self.snap(self.r(0.08, 0.3) * self.H)
            self.adraw.line([sx, sy0, sx, sy1], fill=scale(self.accent, 0.85), width=S * 2)
        self.edges.append((x0, x1, top))

    def truss(self, draw, xa, xb, y):
        S, u = self.S, self.u
        hgt = u * 3
        draw.line([xa, y, xb, y], fill=LINE, width=S * 2)
        draw.line([xa, y + hgt, xb, y + hgt], fill=LINE, width=S * 2)
        n = max(2, int((xb - xa) / hgt))
        step = (xb - xa) / n
        for i in range(n):
            a = xa + i * step
            b = a + step
            if i % 2 == 0:
                draw.line([a, y + hgt, b, y], fill=DIM, width=S * 2)
            else:
                draw.line([a, y, b, y + hgt], fill=DIM, width=S * 2)
            draw.line([a, y, a, y + hgt], fill=DIM, width=S)

    def cable(self, draw, p0, p1, sag):
        pts = []
        for i in range(41):
            t = i / 40
            x = p0[0] + (p1[0] - p0[0]) * t
            y = p0[1] + (p1[1] - p0[1]) * t + sag * 4 * t * (1 - t)
            pts.append((x, y))
        draw.line(pts, fill=DIM, width=self.S * 2)

    # ------------------------------------------------------------ HUD
    def hud(self, draw):
        S, u, rng, W, H = self.S, self.u, self.rng, self.W, self.H
        # registration crosses in the sky
        for _ in range(rng.randint(3, 6)):
            cx = self.snap(self.r(0.08, 0.92) * W)
            cy = self.snap(self.r(0.08, 0.4) * H)
            a = u
            draw.line([cx - a, cy, cx + a, cy], fill=DIM, width=S)
            draw.line([cx, cy - a, cx, cy + a], fill=DIM, width=S)
        # left ruler
        rx = u * 3
        y = self.snap(H * 0.42)
        i = 0
        while y < H * 0.86:
            ln = u * (2 if i % 5 == 0 else 1)
            draw.line([rx, y, rx + ln, y], fill=TEXT if i % 5 == 0 else DIM, width=S)
            y += u
            i += 1
        # bottom caption + barcode, kept above the home indicator
        by = H - self.snap(H * 0.075)
        coords = f"{rng.uniform(10, 80):05.2f}N {rng.uniform(100, 180):06.2f}E"
        draw.text((u * 3, by), f"SECTOR {rng.randint(1, 99):02d} // {coords}",
                  font=self.font_s, fill=TEXT)
        draw.text((u * 3, by + u * 2.5), f"SEED {self.seed:06d}  ·  GRID STABLE",
                  font=self.font_xs, fill=DIM)
        self.adraw.rectangle([u * 3, by - u * 1.5, u * 3 + u * 4, by - u * 1.5 + S * 2],
                             fill=self.accent)
        bx = W - u * 3
        bh = u * 4
        while bx > W - u * 22:
            bw = S * rng.choice([1, 2, 2, 3, 4])
            draw.rectangle([bx - bw, by, bx, by + bh], fill=TEXT)
            bx -= bw + S * rng.choice([2, 3, 4])

    # ------------------------------------------------------------ render
    def render(self):
        rng, W, H, u = self.rng, self.W, self.H, self.u
        self.haze_y = self.r(0.5, 0.68)
        self.beacons, self.edges = [], []

        # accent layer (gets glow); black = nothing
        self.alayer = Image.new("RGB", (W, H), (0, 0, 0))
        self.adraw = ImageDraw.Draw(self.alayer)

        sky = Image.fromarray(np.clip(self.sky(), 0, 255).astype(np.uint8))
        self.far_towers(ImageDraw.Draw(sky))
        img = Image.fromarray(np.clip(self.haze(np.asarray(sky, float)), 0, 255).astype(np.uint8))
        draw = ImageDraw.Draw(img)

        # near towers: leave the clock zone (top ~35%) mostly open sky
        n = rng.randint(3, 4)
        slots = np.linspace(-0.08, 0.92, n + 1)
        specs = []
        for i in range(n):
            w = self.snap(self.r(0.18, 0.34) * W)
            cx = (slots[i] + slots[i + 1]) / 2 * W + self.r(-0.04, 0.04) * W
            x0 = self.snap(cx - w / 2)
            top = self.snap(self.r(0.42, 0.7) * H)
            specs.append((x0, top, w))
        tall = rng.randrange(n)  # one tower reaches higher, off-centre
        x0, _, w = specs[tall]
        specs[tall] = (x0, self.snap(self.r(0.3, 0.38) * H), w)
        # draw lowest-topped last so overlaps read as depth
        order = sorted(range(n), key=lambda i: specs[i][1])

        # cables between beacons/edges drawn before towers so towers occlude them
        cab = []
        for i in range(n - 1):
            a, b = specs[i], specs[i + 1]
            p0 = (a[0] + a[2], max(a[1], b[1]) + self.snap(self.r(0.02, 0.12) * H))
            p1 = (b[0], p0[1] + self.snap(self.r(-0.04, 0.04) * H))
            cab.append((p0, p1))
        for p0, p1 in cab:
            self.cable(draw, p0, p1, self.r(0.02, 0.06) * H)

        for i in order:
            self.tower(draw, *specs[i])

        # one truss across a gap
        sp = sorted(specs)
        for a, b in zip(sp, sp[1:]):
            if b[0] - (a[0] + a[2]) > u * 4 and rng.random() < 0.7:
                y = self.snap(max(a[1], b[1]) + self.r(0.05, 0.2) * H)
                self.truss(draw, a[0] + a[2], b[0], y)
                break

        # single broken accent scanline across the frame
        sy = self.snap(self.r(0.74, 0.86) * H)
        x = 0
        while x < W:
            seg = self.snap(self.r(0.05, 0.35) * W)
            if rng.random() < 0.6:
                self.adraw.line([x, sy, min(W, x + seg), sy], fill=scale(self.accent, 0.5), width=self.S)
            x += seg + self.snap(self.r(0.01, 0.06) * W)

        self.hud(draw)

        # ---- composite: base + bloom(accent) + accent
        base = np.asarray(img, float)
        acc_img = self.alayer
        sharp = np.asarray(acc_img, float)
        g1 = np.asarray(acc_img.filter(ImageFilter.GaussianBlur(5 * self.S)), float)
        g2 = np.asarray(acc_img.filter(ImageFilter.GaussianBlur(28 * self.S)), float)
        mask = sharp.max(axis=2, keepdims=True) > 0
        out = np.where(mask, sharp, base) + g1 * 0.9 + g2 * 0.7

        # beacon halos (soft radial)
        yy, xx = np.ogrid[:H, :W]
        for bx, by in self.beacons:
            d2 = ((xx - bx) ** 2 + (yy - by) ** 2) / (60 * self.S) ** 2
            out += np.exp(-d2)[..., None] * np.array(self.accent, float) * 0.12

        final = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        final = final.resize(self.out_size, Image.LANCZOS)

        # ---- post: scanlines, vignette, grain at output res
        f = np.asarray(final, float)
        h, w = f.shape[:2]
        scan = 1 - 0.05 * ((np.arange(h) % 3) == 0)
        f *= scan[:, None, None]
        y = np.linspace(-1, 1, h)[:, None]
        x = np.linspace(-1, 1, w)[None, :]
        vig = 1 - 0.38 * np.clip((x ** 2) * 0.8 + (y ** 2) * 0.6, 0, 1)
        f *= vig[..., None]
        nrng = np.random.default_rng(self.seed)
        f += nrng.normal(0, 3.2, (h, w, 1))
        return Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--palette", choices=sorted(PALETTES), default="sodium")
    ap.add_argument("--width", type=int, default=1290)   # iPhone Pro Max
    ap.add_argument("--height", type=int, default=2796)
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--out", default="out/city")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for i in range(args.count):
        seed = args.seed + i if args.seed is not None else random.randrange(1_000_000)
        img = Wallpaper(args.width, args.height, seed, args.palette).render()
        path = os.path.join(args.out, f"wallpaper_{args.palette}_{seed:06d}.png")
        img.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
