#!/usr/bin/env python3
"""Generative minimal abstract phone/desktop wallpaper with a cyberpunk undertone.

A few groups of marks (honeycomb hexes, tessellating trapezoids and
parallelograms, slanted segments, dot fields, tiny labels)
on a loose grid with lots of empty space. Shapes of one type share a size and
tile or mirror each other; large shapes only appear cut off by a screen edge.
Near-black, grey hairlines, one accent used once or twice, optional glitches.

    python wallpaper.py                      # random seed, sodium orange
    python wallpaper.py --seed 42 --palette cyan
    python wallpaper.py --count 6            # batch of random seeds
    python wallpaper.py --glitch 0           # clean; 1 = heavy glitching
    python wallpaper.py --device desktop     # 3840x2160 landscape
    python wallpaper.py --accent '#ff2a6d'   # any accent colour
    python wallpaper.py --device desktop --width 3024 --height 1964   # match a screen

Requires: pillow, numpy
"""
import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

PALETTES = {
    "sodium":  (255, 92, 24),
    "cyan":    (0, 226, 255),
    "acid":    (186, 255, 18),
    "magenta": (255, 36, 120),
    "red":     (255, 34, 48),
}
BG = (8, 9, 11)
FAINT = (21, 23, 27)
DIM = (40, 44, 51)
LINE = (74, 80, 91)
FILL = (15, 16, 19)
SOLIDS = [(19, 21, 25), (25, 27, 32), (32, 35, 41)]  # solid block tones
TEXT = (86, 92, 102)

LABELS = ["04", "07", "12", "K-9", "SYN", "0x3F", "Δ118", "MK.II", "A/7",
          "IO", "N.04", "REF", "88", "LNK", "v2", "AUX"]


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


def hex_pts(cx, cy, r, rot=30):
    return [(cx + r * math.cos(math.radians(rot + 60 * k)),
             cy - r * math.sin(math.radians(rot + 60 * k))) for k in range(6)]


class Wallpaper:
    def __init__(self, w, h, seed, accent, glitch=0.5, ss=2):
        self.glitch_amt = glitch
        self.rng = random.Random(seed)
        self.seed = seed
        self.S = ss
        self.W, self.H = w * ss, h * ss
        self.out_size = (w, h)
        self.accent = accent
        # layout: phones keep the top third clear for the clock; desktops leave
        # room for the menu bar and dock and spread more groups across the width
        self.landscape = w > h
        self.S0 = min(self.W, self.H)
        self.cw = self.S0 * 0.137               # grid column / base shape size
        if self.landscape:
            self.margin = self.W * 0.05
            self.top, self.bottom = self.H * 0.1, self.H * 0.86
            self.n_groups, self.n_big = (7, 10), (2, 3)
            self.quiet_top = 0.05                # glitch-free strip at the top
        else:
            self.margin = self.W * 0.09
            self.top, self.bottom = self.H * 0.34, self.H * 0.9
            self.n_groups, self.n_big = (4, 6), (1, 2)
            self.quiet_top = 0.3
        k = min(w, h) / 1290  # detail scale: 1 on a phone, larger on big screens
        self.u = 8 * ss * k
        self.font = load_font(int(10 * ss * k))

    def r(self, a, b):
        return self.rng.uniform(a, b)

    # ------------------------------------------------------------ primitives
    def poly(self, pts, fill=None, outline=None, width=None, accent=False):
        d = self.adraw if accent else self.draw
        if fill is not None and not accent:
            self.adraw.polygon(pts, fill=(0, 0, 0))
        d.polygon(pts, fill=fill, outline=outline, width=width or self.S)

    def line(self, pts, fill, width=None, accent=False):
        (self.adraw if accent else self.draw).line(pts, fill=fill, width=width or self.S, joint="curve")

    def dot(self, x, y, r, fill, accent=False):
        (self.adraw if accent else self.draw).ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def ring(self, x, y, r, col, accent=False):
        (self.adraw if accent else self.draw).ellipse([x - r, y - r, x + r, y + r], fill=BG,
                                                      outline=col, width=self.S)

    def hatch(self, pts, spacing, color, direction=1, accent=False):
        target = self.alayer if accent else self.img
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, y0 = int(min(xs)), int(min(ys))
        w, h = int(max(xs)) - x0 + 2, int(max(ys)) - y0 + 2
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in pts], fill=255)
        lines = Image.new("L", (w, h), 0)
        ld = ImageDraw.Draw(lines)
        for c in range(-h, w + h, spacing):
            a, b = ((c, h), (c + h, 0)) if direction > 0 else ((c, 0), (c + h, h))
            ld.line([a, b], fill=255, width=self.S)
        target.paste(Image.new("RGB", (w, h), color), (x0, y0), ImageChops.multiply(mask, lines))

    def label(self, x, y, txt=None, col=TEXT):
        self.draw.text((x, y), txt or self.rng.choice(LABELS), font=self.font, fill=col)

    # ------------------------------------------------------------ groups
    # Every mark is a group: one or more shapes of the SAME size that tile or
    # mirror each other. Each plan_* returns (w, h, draw); draw(ox, oy, acc)
    # renders with the group's bounding box top-left at (ox, oy). Each type is
    # used at most once per wallpaper, so sizes never mix within a type.

    @staticmethod
    def _norm(tiles):
        xs = [x for t in tiles for x, _ in t]
        ys = [y for t in tiles for _, y in t]
        mx, my = min(xs), min(ys)
        return [[(x - mx, y - my) for x, y in t] for t in tiles], max(xs) - mx, max(ys) - my

    def _tones(self):
        """Two neighbouring solid tones; tiled groups alternate between them (or not)."""
        k = self.rng.randrange(len(SOLIDS) - 1)
        a, b = SOLIDS[k], SOLIDS[k + 1]
        return (a, b) if self.rng.random() < 0.6 else (b, b)

    def _draw_tiles(self, tiles, ox, oy, acc, style, hatch_dir):
        """Polygon tiles in one shared style; at most one tile takes the accent."""
        rng = self.rng
        acc_i = rng.randrange(len(tiles)) if acc else -1
        sp = self.S * 7
        tones = self._tones()
        for i, t in enumerate(tiles):
            pts = [(ox + x, oy + y) for x, y in t]
            if style == "solid":
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                small = (max(xs) - min(xs)) * (max(ys) - min(ys)) < (self.cw * 0.45) ** 2
                if i == acc_i and small:  # a small block can go fully orange
                    self.poly(pts, fill=scale(self.accent, 0.9), accent=True)
                    continue
                self.poly(pts, fill=tones[i % 2])
            elif style == "hatch":
                self.hatch(pts, sp, DIM, hatch_dir)
                self.poly(pts, outline=DIM)
            elif style == "filled":
                self.poly(pts, fill=FILL, outline=DIM)
            else:
                self.poly(pts, outline=LINE)
            if i == acc_i:
                k = rng.randrange(len(pts))
                self.line([pts[k], pts[(k + 1) % len(pts)]], fill=self.accent, width=self.S * 2, accent=True)

    def plan_hex(self):
        """Honeycomb cluster of equal hexagons with thin gutters."""
        rng = self.rng
        r = rng.choice([0.3, 0.4, 0.5]) * self.cw
        rot = rng.choice([0, 30])
        n = rng.choices([1, 2, 3, 4, 5], [1, 3, 3, 2, 1])[0]
        d = math.sqrt(3) * r
        dirs = [(d * math.cos(math.radians(rot + 30 + 60 * k)), -d * math.sin(math.radians(rot + 30 + 60 * k)))
                for k in range(6)]
        cells = [(0.0, 0.0)]
        while len(cells) < n:
            cx, cy = rng.choice(cells)
            dx, dy = rng.choice(dirs)
            c = (cx + dx, cy + dy)
            if all((c[0] - a) ** 2 + (c[1] - b) ** 2 > (d * 0.5) ** 2 for a, b in cells):
                cells.append(c)
        gap = self.S * 4
        tiles, w, h = self._norm([hex_pts(cx, cy, r - gap, rot) for cx, cy in cells])
        style = rng.choice(["solid", "solid", "solid", "cored", "outline"])
        if style == "cored" and r > 0.32 * self.cw:  # a cored big hex reads as a thick ring
            style = "solid"
        partial = n == 1 and r > 0.45 * self.cw and style == "outline"
        tones = self._tones()

        def draw(ox, oy, acc):
            acc_i = rng.randrange(len(tiles)) if acc else -1
            for i, t in enumerate(tiles):
                pts = [(ox + x, oy + y) for x, y in t]
                cx, cy = sum(p[0] for p in pts) / 6, sum(p[1] for p in pts) / 6
                if partial:
                    k0, m = rng.randrange(6), rng.randint(2, 4)
                    self.line([pts[(k0 + j) % 6] for j in range(m + 1)], fill=LINE)
                elif style == "outline":
                    self.poly(pts, outline=LINE)
                else:
                    if i == acc_i and r < 0.45 * self.cw and style == "solid":
                        self.poly(pts, fill=scale(self.accent, 0.9), accent=True)
                        continue
                    self.poly(pts, fill=tones[i % 2])
                    if style == "cored":
                        self.poly(hex_pts(cx, cy, (r - gap) * 0.45, rot), fill=BG)
                if i == acc_i:
                    k = rng.randrange(6)
                    self.line([pts[k], pts[(k + 1) % 6]], fill=self.accent, width=self.S * 2, accent=True)
        return w, h, draw

    def plan_trap(self):
        """45-degree trapezoids alternating up/down so their slanted sides interlock."""
        u, rng = self.u, self.rng
        h = self.cw * rng.choice([0.3, 0.4, 0.55])
        a = self.cw * rng.choice([0.25, 0.4, 0.6])
        g = u * 0.75
        tiles = []
        x = 0
        for i in range(rng.randint(2, 4)):
            if i % 2 == 0:
                tiles.append([(x, h), (x + h, 0), (x + h + a, 0), (x + 2 * h + a, h)])
            else:
                tiles.append([(x, 0), (x + 2 * h + a, 0), (x + h + a, h), (x + h, h)])
            x += a + h + g * 1.41
        tiles, w, hh = self._norm(tiles)
        style, hd = rng.choice(["solid"] * 5 + ["outline", "hatch"]), rng.choice([1, -1])
        return w, hh, lambda ox, oy, acc: self._draw_tiles(tiles, ox, oy, acc, style, hd)

    def plan_para(self):
        """Equal parallelograms in a tessellating row, or a mirrored pair."""
        u, rng = self.u, self.rng
        h = self.cw * rng.choice([0.2, 0.3, 0.4])
        wd = self.cw * rng.choice([0.35, 0.5, 0.8])
        g = u * 0.75
        lean = rng.choice([1, -1])

        def P(x):
            if lean > 0:
                return [(x + h, 0), (x + h + wd, 0), (x + wd, h), (x, h)]
            return [(x, 0), (x + wd, 0), (x + wd + h, h), (x + h, h)]
        if rng.random() < 0.65:
            tiles = [P(i * (wd + g)) for i in range(rng.randint(2, 5))]
        else:
            left = P(0)
            X = 2 * (wd + h) + g * 2
            tiles = [left, [(X - x, y) for x, y in left]]
        tiles, w, hh = self._norm(tiles)
        style, hd = rng.choice(["solid"] * 5 + ["outline", "hatch"]), rng.choice([1, -1])
        return w, hh, lambda ox, oy, acc: self._draw_tiles(tiles, ox, oy, acc, style, hd)

    def plan_segments(self):
        w = self.cw * self.rng.choice([1.5, 2, 2.5])
        h = self.u * 2

        def draw(ox, oy, acc):
            step = self.u * 1.5
            n = int((w - h) / step)
            lit = self.rng.randint(1, max(1, n // 3)) if acc else 0
            for i in range(n):
                sx = ox + i * step
                seg = [(sx + h, oy), (sx + step - self.S * 3 + h, oy), (sx + step - self.S * 3, oy + h), (sx, oy + h)]
                if i < lit:
                    self.poly(seg, fill=self.accent, accent=True)
                else:
                    self.poly(seg, fill=SOLIDS[1])
        return w, h, draw

    def plan_chevrons(self):
        a = self.u * 1.5
        n = self.rng.randint(3, 5)

        def draw(ox, oy, acc):
            for i in range(n):
                x = ox + i * a * 1.1
                on = acc and i == n - 1
                self.line([(x, oy), (x + a, oy + a), (x, oy + 2 * a)],
                          fill=self.accent if on else LINE, width=self.S * 2, accent=on)
        return (n - 1) * a * 1.1 + a, 2 * a, draw

    def plan_cross(self):
        L = self.cw * 0.3
        n = self.rng.randint(1, 3)
        sp = 2 * L + self.u * 3

        def draw(ox, oy, acc):
            acc_i = self.rng.randrange(n) if acc else -1
            for i in range(n):
                cx, cy = ox + L + i * sp, oy + L
                self.line([(cx - L, cy), (cx + L, cy)], fill=DIM)
                self.line([(cx, cy - L), (cx, cy + L)], fill=DIM)
                self.ring(cx, cy, L * 0.4, self.accent if i == acc_i else LINE, accent=i == acc_i)
        return (n - 1) * sp + 2 * L, 2 * L, draw

    def plan_dots(self):
        """Dot field sheared into a parallelogram or narrowed into a trapezoid."""
        rng = self.rng
        s = self.u * rng.choice([1, 1.5])
        cols, rows = rng.randint(6, 12), rng.randint(3, 6)
        shape = rng.choice(["shear", "trap"])
        pts = []
        for j in range(rows):
            for i in range(cols):
                if shape == "shear":
                    pts.append(((i + j) * s, j * s))
                elif j <= i <= cols - 1 - j:
                    pts.append((i * s, j * s))
        xs = [p[0] for p in pts]

        def draw(ox, oy, acc):
            k = rng.randrange(len(pts)) if acc else -1
            for i, (x, y) in enumerate(pts):
                if i == k:
                    self.dot(ox + x, oy + y, self.S * 2.5, self.accent, accent=True)
                else:
                    self.dot(ox + x, oy + y, self.S * 0.9, DIM)
        return max(xs), (rows - 1) * s, draw

    def plan_bars(self):
        """Equal bars with 45-degree cut ends, stacked, optionally stepped at 45 degrees."""
        rng, u = self.rng, self.u
        n = rng.randint(2, 4)
        L = self.cw * rng.choice([0.5, 0.75, 1, 1.5])
        t = self.S * rng.choice([3, 4])
        g = u * 0.75
        step = rng.choice([0, g + t])

        def draw(ox, oy, acc):
            acc_i = rng.randrange(n) if acc else -1
            for i in range(n):
                x, y = ox + i * step, oy + i * (g + t)
                pts = [(x, y), (x + L, y), (x + L - t, y + t), (x, y + t)]
                if i == acc_i:
                    self.poly(pts, fill=self.accent, accent=True)
                else:
                    self.poly(pts, fill=LINE)
        return L + (n - 1) * step, n * t + (n - 1) * g, draw

    def plan_brackets(self):
        rng = self.rng
        w = self.cw * rng.choice([1, 1.5, 2])
        h = self.cw * rng.choice([0.75, 1, 1.5])

        def draw(ox, oy, acc):
            L = min(self.u * 2, w / 3)
            x0, y0, x1, y1 = ox, oy, ox + w, oy + h
            for (x, y, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x1, y1, -1, -1), (x0, y1, 1, -1)):
                self.line([(x + sx * L, y), (x, y), (x, y + sy * L)], fill=LINE)
            if acc:
                self.dot((x0 + x1) / 2, (y0 + y1) / 2, self.S * 3, self.accent, accent=True)
            elif rng.random() < 0.5:
                self.label(x0 + self.u, y0 + self.u)
        return w, h, draw

    def plan_text(self):
        rng, u = self.rng, self.u
        lines = rng.randint(1, 3)

        def draw(ox, oy, acc):
            for i in range(lines):
                txt = " ".join(rng.choice(LABELS) for _ in range(rng.randint(1, 3)))
                self.label(ox + u, oy + i * u * 1.8, txt, TEXT if i == 0 else DIM)
            if acc:
                self.poly([(ox, oy + self.S * 2), (ox + self.S * 3, oy + self.S * 2),
                           (ox + self.S * 3, oy + u * 1.2), (ox, oy + u * 1.2)], fill=self.accent, accent=True)
        return self.cw * 1.2, lines * u * 1.8, draw

    def plan_ruler(self):
        u = self.u
        w = self.cw * self.rng.choice([1.5, 2, 3])

        def draw(ox, oy, acc):
            y = oy + u
            x, i = ox, 0
            while x <= ox + w:
                L = u if i % 5 == 0 else u / 2
                self.line([(x, y), (x, y - L)], fill=LINE if i % 5 == 0 else DIM)
                x += u
                i += 1
            self.line([(ox, y), (ox + w, y)], fill=DIM)
        return w, u, draw

    def plan_spark(self):
        """The one guaranteed bright element: a small solid block in full accent."""
        rng, u, S = self.rng, self.u, self.S
        kind = rng.choice(["segs", "bar", "paras"])
        A = self.accent
        if kind == "segs":
            n, h, step = rng.randint(3, 6), u * 2.5, u * 2.5

            def draw(ox, oy, acc):
                for i in range(n):
                    sx = ox + i * step
                    self.poly([(sx + h, oy), (sx + step - S * 3 + h, oy), (sx + step - S * 3, oy + h), (sx, oy + h)],
                              fill=A, accent=True)
            return (n - 1) * step + step - S * 3 + h, h, draw
        if kind == "bar":
            L = self.cw * rng.choice([0.5, 0.7, 1.0])
            t = S * rng.choice([7, 9, 12])
            twin = rng.random() < 0.5  # thin grey partner bar of the same length

            def draw(ox, oy, acc):
                y = oy + (u if twin else 0)
                self.poly([(ox, y), (ox + L, y), (ox + L - t, y + t), (ox, y + t)], fill=A, accent=True)
                if twin:
                    self.poly([(ox, oy), (ox + L, oy), (ox + L - S * 2, oy + S * 2), (ox, oy + S * 2)], fill=LINE)
            return L, t + (u if twin else 0), draw
        n, wd, h = rng.randint(2, 3), u * rng.choice([3, 4, 6]), u * rng.choice([2.5, 3])
        g = u * 0.6

        def draw(ox, oy, acc):
            for i in range(n):
                x = ox + i * (wd + g)
                self.poly([(x + h, oy), (x + h + wd, oy), (x + wd, oy + h), (x, oy + h)], fill=A, accent=True)
        return n * (wd + g) - g + h, h, draw

    GROUPS = {  # type: (weight, can carry accent)
        "hex": (3, True), "trap": (3, True), "para": (3, True),
        "segments": (2, True), "chevrons": (1, True), "cross": (1, True), "dots": (1, True),
        "bars": (2, True), "brackets": (1, True), "text": (1, True), "ruler": (1, False),
    }

    # ------------------------------------------------------------ edge-bleeding shapes
    def _side(self, b):
        return -1 if b[0] < 0 else 1

    def _mx(self, b):
        """Shapes are designed for the left edge and flipped for the right."""
        if self._side(b) < 0:
            return lambda x: x
        return lambda x: self.W - x

    def e_bleed_hex(self, tiles, rot, acc):
        """One or two (tessellated) large hexes running off the edge."""
        solid = self.rng.random() < 0.75
        border = self.rng.choice(["none", "none", "edge", "inset"])  # thin hairline or nothing
        tones = (SOLIDS[0], SOLIDS[1]) if self.rng.random() < 0.6 else (SOLIDS[1], SOLIDS[1])
        acc_i = self.rng.randrange(len(tiles)) if acc else -1
        for i, (cx, cy, R) in enumerate(tiles):
            pts = hex_pts(cx, cy, R, rot)
            if solid:
                self.poly(pts, fill=tones[i % 2])
                if border == "edge":
                    self.poly(pts, outline=DIM)
                elif border == "inset":
                    self.poly(hex_pts(cx, cy, R * 0.9, rot), outline=DIM)
            else:
                self.poly(pts, outline=LINE)
            if i == acc_i:
                vis = [k for k in range(6)
                       if 0 < (pts[k][0] + pts[(k + 1) % 6][0]) / 2 < self.W
                       and self.top * 0.95 < (pts[k][1] + pts[(k + 1) % 6][1]) / 2 < self.H]
                if vis:
                    k = self.rng.choice(vis)
                    a, c = pts[k], pts[(k + 1) % 6]
                    t0 = self.r(0.1, 0.5)
                    t1 = t0 + self.r(0.15, 0.35)
                    self.line([(a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0),
                               (a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1)],
                              fill=self.accent, width=self.S * 2, accent=True)

    def e_bleed_rail(self, b, acc):
        """A border line just inside the screen edge, jogging inward at 45 degrees."""
        X = self._mx(b)
        x0, y0, x1, y1 = b
        u = self.u
        a = u * 3
        d = u * self.rng.choice([2, 3, 4])
        ym = y0 + (y1 - y0) * self.r(0.3, 0.7)
        path = [(a, y0), (a, ym), (a + d, ym + d), (a + d, y1)]
        self.line([(X(x), y) for x, y in path], fill=LINE)
        y, i = y0 + u, 0
        while y < ym - u:
            L = u if i % 4 == 0 else u * 0.5
            self.line([(X(a), y), (X(a - L), y)], fill=DIM)
            y += u
            i += 1
        for x, y in (path[0], path[-1]):  # 45-degree diamond terminals
            r = self.S * 4
            self.poly([(X(x), y - r), (X(x) + r, y), (X(x), y + r), (X(x) - r, y)], fill=LINE)
        if acc:
            ya = ym + d + (y1 - ym - d) * self.r(0.2, 0.6)
            self.line([(X(a + d), ya), (X(a + d), ya + u * 4)], fill=self.accent, width=self.S * 3, accent=True)

    def e_bleed_hatch(self, b, acc):
        """Solid (or hatched) 45-degree band running off the edge."""
        X = self._mx(b)
        x0, y0, x1, y1 = b
        if self._side(b) > 0:
            x0, x1 = self.W - x1, self.W - x0
        h = y1 - y0
        pts = [(x0, y0), (x1, y0), (x1 - h, y1), (x0, y1)]
        sp, dr = self.S * self.rng.choice([6, 8, 10]), self.rng.choice([1, -1])
        if self._side(b) > 0:
            dr = -dr
        cap = min(self.u * 3, (x1 - x0) * 0.25)
        cp = [(x1 - cap, y0), (x1, y0), (x1 - h, y1), (x1 - h - cap, y1)]
        if self.rng.random() < 0.7:
            self.poly([(X(x), y) for x, y in pts], fill=self.rng.choice(SOLIDS[:2]))
            if acc:
                self.poly([(X(x), y) for x, y in cp], fill=scale(self.accent, 0.9), accent=True)
        else:
            self.hatch([(X(x), y) for x, y in pts], sp, DIM, dr)
            self.line([(X(x1), y0), (X(x1 - h), y1)], fill=LINE)
            if acc:
                self.hatch([(X(x), y) for x, y in cp], sp, scale(self.accent, 0.8), dr, accent=True)

    # ------------------------------------------------------------ layout
    def layout(self):
        rng, W, H, u = self.rng, self.W, self.H, self.u
        margin = self.margin
        cw = self.cw
        top, bottom = self.top, self.bottom
        span = bottom - top
        groups, taken, used = [], [], set()
        self.big = []  # visible extents of the large shapes, for the glitch pass

        def hits(bb, pad):
            return any(bb[0] - pad < t[2] and bb[2] + pad > t[0] and bb[1] - pad < t[3] and bb[3] + pad > t[1]
                       for t in taken)

        # 1-2 large shapes, always cut off by a screen edge; each uses up a type
        consumes = {"hex": "hex", "hatch": "para", "rail": "ruler"}
        kinds = ["hex", "hex", "hex", "rail", "rail", "hatch", "hatch"]
        side = rng.choice([-1, 1])
        for i in range(rng.randint(*self.n_big)):
            kind = rng.choice([k for k in kinds if consumes[k] not in used])
            used.add(consumes[kind])
            big = i == 0
            if kind == "hex":
                R = self.S0 * (self.r(0.28, 0.42) if big else self.r(0.14, 0.22))
                rot = rng.choice([0, 30])
                cx = R * self.r(-0.55, 0.15)
                cy = self.r(top + R * 0.9, H * 0.92)
                cells = [(cx, cy)]
                if rng.random() < 0.45:  # tessellated twin, same size
                    d = math.sqrt(3) * R
                    opts = [(d * math.cos(math.radians(rot + 30 + 60 * k)), -d * math.sin(math.radians(rot + 30 + 60 * k)))
                            for k in range(6)]
                    opts = [o for o in opts if abs(o[1]) > 1 and o[0] < d * 0.6 and top < cy + o[1] < H * 1.05]
                    if opts:
                        dx, dy = rng.choice(opts)
                        cells.append((cx + dx, cy + dy))
                gap = self.S * 5
                if side > 0:
                    cells = [(W - x, y) for x, y in cells]
                tiles = [(x, y, R - gap) for x, y in cells]
                bx = (min(x for x, _ in cells) - R, min(y for _, y in cells) - R,
                      max(x for x, _ in cells) + R, max(y for _, y in cells) + R)
                draw = (lambda t=tiles, ro=rot: lambda acc: self.e_bleed_hex(t, ro, acc))()
                pad = -cw * 0.25
            else:
                if kind == "rail":
                    y0 = top + span * self.r(0.03, 0.35)
                    bx = [-1, y0, u * 8, min(bottom, y0 + span * self.r(0.35, 0.7))]
                else:
                    y0 = top + span * self.r(0.07, 0.93)
                    bx = [-u * 8, y0, self.S0 * (self.r(0.3, 0.6) if big else self.r(0.15, 0.3)),
                          y0 + u * rng.choice([3, 4, 6])]
                if side > 0:
                    bx = [W - bx[2], bx[1], W - bx[0], bx[3]]
                bx = tuple(bx)
                fn = getattr(self, "e_bleed_" + kind)
                draw = (lambda b=bx, f=fn: lambda acc: f(b, acc))()
                pad = u * 2
            vis = (max(0, bx[0]) - pad, max(top, bx[1]) - pad, min(W, bx[2]) + pad, min(H, bx[3]) + pad)
            taken.append(vis)
            if kind != "rail":
                self.big.append((max(0, bx[0]), max(top, bx[1]), min(W, bx[2]), min(H, bx[3])))
            groups.append(dict(name="bleed_" + kind, bbox=bx, draw=draw, acc_ok=True, bleed=True))
            side = -side

        # the bright spark first, then 4-6 smaller groups, each a different type
        avail = [t for t in self.GROUPS if t not in used]
        snap = cw / 2
        queue = ["spark"]
        for _ in range(rng.randint(*self.n_groups)):
            if not avail:
                break
            t = rng.choices(avail, [self.GROUPS[a][0] for a in avail])[0]
            avail.remove(t)
            queue.append(t)
        for t in queue:
            w, h, draw = getattr(self, "plan_" + t)()
            if w > W - 2 * margin or h > bottom - top:
                continue
            for _ in range(200):
                ox = margin + rng.randint(0, int((W - 2 * margin - w) / snap)) * snap
                oy = top + rng.randint(0, int((bottom - top - h) / snap)) * snap
                bb = (ox, oy, ox + w, oy + h)
                if not hits(bb, u * 4):
                    taken.append(bb)
                    groups.append(dict(name=t, bbox=bb, ox=ox, oy=oy, draw=draw,
                                       acc_ok=t != "spark" and self.GROUPS[t][1], bleed=False))
                    break
        self.grid = (margin, cw, top, int((bottom - top) / cw), int((W - 2 * margin) / cw))
        return groups

    def connector(self, a, b, boxes):
        """A thin trace between two groups, bending at 45 degrees, ending in rings."""
        ax, ay = a[2] + self.u, (a[1] + a[3]) / 2
        bx, by = b[0] - self.u, (b[1] + b[3]) / 2
        dx, dy = bx - ax, by - ay
        if dx < abs(dy) + self.u * 4:
            return False
        run = (dx - abs(dy)) / 2
        pts = [(ax, ay), (ax + run, ay), (ax + run + abs(dy), by), (bx, by)]
        pad = self.u
        for p, q in zip(pts, pts[1:]):
            for t in np.linspace(0, 1, 40):
                x, y = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
                for bb in boxes:
                    if bb is a or bb is b:
                        continue
                    if bb[0] - pad < x < bb[2] + pad and bb[1] - pad < y < bb[3] + pad:
                        return False
        self.line(pts, fill=DIM)
        self.ring(ax, ay, self.S * 3, LINE)
        self.ring(bx, by, self.S * 3, LINE)
        return True

    # ------------------------------------------------------------ render
    def render(self):
        rng, W, H, S, u = self.rng, self.W, self.H, self.S, self.u
        y = np.linspace(0, 1, H)[:, None]
        y = y.astype(np.float32)
        bg = np.broadcast_to(np.array(BG, np.float32) + (y * 5)[..., None], (H, W, 3))
        self.img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
        self.draw = ImageDraw.Draw(self.img)
        self.alayer = Image.new("RGB", (W, H), (0, 0, 0))
        self.adraw = ImageDraw.Draw(self.alayer)

        groups = self.layout()
        margin, cw, top, rows, cols = self.grid

        # faint guides: a couple of grid hairlines and one long 45-degree line
        for _ in range(rng.randint(1, 3)):
            if rng.random() < 0.5:
                x = margin + rng.randint(0, cols) * cw
                self.line([(x, rng.uniform(0.1, 0.4) * H), (x, H)], fill=FAINT)
            else:
                yy = top + rng.randint(0, rows) * cw
                self.line([(0, yy), (W, yy)], fill=FAINT)
        if rng.random() < 0.7:
            x0 = rng.uniform(-0.3, 0.6) * W
            y0 = rng.uniform(0.3, 0.6) * H
            L = W * 1.2
            self.line([(x0, y0), (x0 + L, y0 + rng.choice([1, -1]) * L)], fill=FAINT)

        # accent: one or two groups, nothing else
        can = [i for i, g in enumerate(groups) if g["acc_ok"]]
        # the spark is always lit; at most one other group gets a quieter accent
        accent_idx = set(rng.sample(can, k=min(len(can), rng.choice([0, 1]))))

        # maybe one connector between two small groups
        small = [g["bbox"] for g in groups if not g["bleed"]]
        if rng.random() < 0.6:
            order = sorted(small, key=lambda b: b[0])
            pairs = [(a, b) for a in order for b in order if b[0] > a[2] + u * 8]
            rng.shuffle(pairs)
            allb = [g["bbox"] for g in groups]
            for a, b in pairs[:5]:
                if self.connector(a, b, allb):
                    break

        for i, g in enumerate(groups):
            acc = i in accent_idx
            if g["bleed"]:
                g["draw"](acc)
            else:
                g["draw"](g["ox"], g["oy"], acc)
                if rng.random() < 0.3 and g["name"] != "text":
                    self.label(g["bbox"][0], g["bbox"][3] + u * 1.2, col=DIM)

        # tiny signature low-left, above the home indicator
        self.label(margin, H * 0.93, f"{self.seed:06d}", col=DIM)
        return self.composite()

    def composite(self):
        S = self.S
        f32 = np.float32
        out = np.array(self.img, f32)  # composited in place to keep desktop renders lean
        sharp = np.asarray(self.alayer, f32)
        mask = sharp.max(axis=2) > 0
        out[mask] = sharp[mask]
        del sharp, mask
        for radius, k in ((4, 0.6), (22, 0.35)):
            g = np.asarray(self.alayer.filter(ImageFilter.GaussianBlur(radius * S)), f32)
            g *= k
            out += g
            del g
        final = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize(self.out_size, Image.LANCZOS)

        f = np.asarray(final, float).copy()
        if self.glitch_amt > 0:
            f = self.glitch(f, self.glitch_amt)
        h, w = f.shape[:2]
        y = np.linspace(-1, 1, h)[:, None]
        x = np.linspace(-1, 1, w)[None, :]
        f *= (1 - 0.3 * np.clip(x ** 2 * 0.8 + y ** 2 * 0.6, 0, 1))[..., None]
        f += np.random.default_rng(self.seed).normal(0, 2.8, (h, w, 1))
        return Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))

    # ------------------------------------------------------------ glitch
    def glitch(self, f, amt):
        """Digital damage at output resolution: slid slices, cut-and-shifted
        blocks, RGB channel split, channel-swapped bands and corrupt data blocks.
        Placement is weighted toward rows that actually contain marks."""
        rng = np.random.default_rng(self.seed ^ 0x9E3779B9)
        h, w = f.shape[:2]
        bg = np.median(f, axis=1, keepdims=True)
        act = np.abs(f - bg).max(axis=2).mean(axis=1)
        act = np.convolve(act, np.ones(25) / 25, mode="same")
        act[: int(h * self.quiet_top)] *= 0.05  # spare the clock zone / menu bar
        big = [tuple(int(v / self.S) for v in b) for b in getattr(self, "big", [])]
        for x0, y0, x1, y1 in big:  # large shapes attract most of the damage
            act[y0:y1] += act.mean() * 4
        amt = amt * (1 + 0.6 * len(big))
        p = act + act.mean() * 0.05
        p /= p.sum()

        def band(hmin, hmax):
            y = int(rng.choice(h, p=p))
            bh = int(rng.integers(hmin, hmax + 1))
            y0 = max(0, min(h - bh, y - bh // 2))
            return y0, y0 + bh

        def n(base):
            return int(rng.poisson(base * amt * 2))

        # 1. slid slices: thin horizontal bands shifted sideways
        for _ in range(max(1, n(3))):
            y0, y1 = band(1, 28)
            dx = int(rng.choice([-1, 1]) * rng.integers(6, 30 + int(140 * amt)))
            f[y0:y1] = np.roll(f[y0:y1], dx, axis=1)
            if rng.random() < 0.45:  # RGB split inside the slice
                k = int(rng.integers(2, 4 + int(10 * amt)))
                f[y0:y1, :, 0] = np.roll(f[y0:y1, :, 0], k, axis=1)
                f[y0:y1, :, 2] = np.roll(f[y0:y1, :, 2], -k, axis=1)

        # 2. cut-and-slide blocks: a rectangle lifted and nudged over
        for _ in range(n(1.5)):
            y0, y1 = band(20, 140)
            bw = int(w * rng.uniform(0.15, 0.6))
            x0 = int(rng.integers(0, w - bw))
            dx = int(rng.choice([-1, 1]) * rng.integers(8, 20 + int(80 * amt)))
            block = f[y0:y1, x0:x0 + bw].copy()
            nx0, nx1 = max(0, x0 + dx), min(w, x0 + dx + bw)
            f[y0:y1, nx0:nx1] = block[:, nx0 - (x0 + dx): nx0 - (x0 + dx) + (nx1 - nx0)]
            if rng.random() < 0.5:  # hairline seam along the cut
                f[y0, nx0:nx1] += 18

        # 2b. shape shears: thick slices through each large shape slid well off its edge
        for x0, y0, x1, y1 in big:
            for _ in range(int(rng.integers(2, 5))):
                bh = int(rng.integers(6, 70))
                sy = int(rng.integers(y0, max(y0 + 1, y1 - bh)))
                dx = int(rng.choice([-1, 1]) * rng.integers(15, 25 + int(160 * min(amt, 1.5))))
                f[sy:sy + bh] = np.roll(f[sy:sy + bh], dx, axis=1)
                if rng.random() < 0.6:
                    k = int(rng.integers(3, 10))
                    f[sy:sy + bh, :, 0] = np.roll(f[sy:sy + bh, :, 0], k, axis=1)
                    f[sy:sy + bh, :, 2] = np.roll(f[sy:sy + bh, :, 2], -k, axis=1)

        # 3. colour shift: swap channels in a thin band (orange turns blue/violet)
        for _ in range(n(0.8)):
            y0, y1 = band(2, 24)
            perm = rng.choice([[2, 1, 0], [1, 2, 0], [2, 0, 1]])
            seg = f[y0:y1]
            ink = (np.abs(seg - bg[y0:y1]).max(axis=2) > 10)[..., None]  # only the marks, not the sky
            f[y0:y1] = np.where(ink, seg[:, :, perm], seg)

        # 4. corrupt data blocks: tiny quantised noise in grey or accent
        acc = np.array(self.accent, float)
        for _ in range(n(1.5)):
            y0, _ = band(1, 1)
            bh = int(rng.integers(3, 10))
            bw = int(rng.integers(20, 120))
            x0 = int(rng.integers(0, w - bw))
            cell = int(rng.choice([2, 3, 4]))
            gh, gw = -(-bh // cell), -(-bw // cell)
            on = rng.random((gh, gw)) < 0.45
            on = np.repeat(np.repeat(on, cell, 0), cell, 1)[:bh, :bw]
            col = acc * 0.8 if rng.random() < 0.3 else np.array([70, 76, 86.0])
            y1 = min(h, y0 + bh)
            f[y0:y1, x0:x0 + bw][on[: y1 - y0]] = col

        # 5. faint global chromatic aberration
        if amt > 0.25:
            k = 1 + int(amt * 2)
            f[:, :, 0] = np.roll(f[:, :, 0], k, axis=1)
            f[:, :, 2] = np.roll(f[:, :, 2], -k, axis=1)
        return f


DEVICES = {"phone": (1290, 2796), "desktop": (3840, 2160)}  # iPhone Pro Max, 4K


def parse_hex(v):
    v = v.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise argparse.ArgumentTypeError("accent must look like #ff5a1f")
    try:
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        raise argparse.ArgumentTypeError("accent must look like #ff5a1f")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--device", choices=sorted(DEVICES), default="phone",
                    help="size/layout preset: phone 1290x2796, desktop 3840x2160")
    ap.add_argument("--palette", choices=sorted(PALETTES), default="sodium")
    ap.add_argument("--accent", type=parse_hex, default=None,
                    help="custom accent colour as hex, e.g. '#ff2a6d' (overrides --palette)")
    ap.add_argument("--width", type=int, default=None, help="override preset width")
    ap.add_argument("--height", type=int, default=None, help="override preset height")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--glitch", type=float, default=0.5, help="glitch intensity, 0 = off, 1 = heavy")
    ap.add_argument("--out", default="out")
    args = ap.parse_args()

    w, h = DEVICES[args.device]
    w, h = args.width or w, args.height or h
    accent = args.accent or PALETTES[args.palette]
    tag = "%02x%02x%02x" % accent if args.accent else args.palette
    kind = "desktop" if w > h else "phone"

    os.makedirs(args.out, exist_ok=True)
    for i in range(args.count):
        seed = args.seed + i if args.seed is not None else random.randrange(1_000_000)
        img = Wallpaper(w, h, seed, accent, args.glitch).render()
        path = os.path.join(args.out, f"{kind}_{tag}_{seed:06d}.png")
        img.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
