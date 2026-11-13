#!/usr/bin/env python3
"""Generative abstract cyberware phone wallpaper.

Hex grids, 45-degree plating, PCB traces and a hex core, nearly all
near-black steel with one accent colour doing the work.

    python wallpaper_cyberware.py                      # random seed, sodium orange
    python wallpaper_cyberware.py --seed 42 --palette cyan
    python wallpaper_cyberware.py --count 6            # batch of random seeds

Requires: pillow, numpy
"""
import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

PALETTES = {
    "sodium":  dict(accent=(255, 92, 24),  accent2=(0, 220, 255)),
    "cyan":    dict(accent=(0, 226, 255),  accent2=(255, 46, 112)),
    "acid":    dict(accent=(186, 255, 18), accent2=(255, 72, 40)),
    "magenta": dict(accent=(255, 36, 120), accent2=(0, 210, 255)),
    "red":     dict(accent=(255, 34, 48),  accent2=(230, 230, 230)),
}
BG = (7, 8, 10)
GRID = (17, 18, 21)
GRID_FILL = (11, 12, 14)
STEEL = [(14, 15, 18), (17, 18, 21), (20, 22, 25), (24, 26, 30)]
LINE = (48, 52, 59)
DIM = (32, 35, 40)
TEXT = (80, 86, 96)

LABELS = ["SYN-04", "N.BUS 7", "ICE//", "v2.11", "C-07", "KX-9", "0x3FA2",
          "LINK", "AUX.3", "Δ 118", "MK-III", "REF 44", "SPN-2", "IO 12"]

# 8 directions, 45 degrees apart: 0 right, 2 up, 4 left, 6 down
DIRS = [(1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1)]


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
    """rot=30 -> pointy-top, rot=0 -> flat-top."""
    return [(cx + r * math.cos(math.radians(rot + 60 * k)),
             cy - r * math.sin(math.radians(rot + 60 * k))) for k in range(6)]


def offset_polyline(pts, off):
    """Offset a polyline sideways, mitring the corners (used for trace bundles)."""
    if off == 0:
        return list(pts)
    segs = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L * off, dx / L * off
        segs.append(((x0 + nx, y0 + ny), (x1 + nx, y1 + ny)))
    out = [segs[0][0]]
    for (a0, a1), (b0, b1) in zip(segs, segs[1:]):
        d1 = (a1[0] - a0[0], a1[1] - a0[1])
        d2 = (b1[0] - b0[0], b1[1] - b0[1])
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-9:
            out.append(a1)
            continue
        t = ((b0[0] - a0[0]) * d2[1] - (b0[1] - a0[1]) * d2[0]) / den
        out.append((a0[0] + d1[0] * t, a0[1] + d1[1] * t))
    out.append(segs[-1][1])
    return out


def chamfer_rect(x0, y0, x1, y1, c, corners="tl tr br bl"):
    """Rectangle with 45-degree cuts on the named corners."""
    cs = corners.split()
    p = []
    p += [(x0, y0 + c), (x0 + c, y0)] if "tl" in cs else [(x0, y0)]
    p += [(x1 - c, y0), (x1, y0 + c)] if "tr" in cs else [(x1, y0)]
    p += [(x1, y1 - c), (x1 - c, y1)] if "br" in cs else [(x1, y1)]
    p += [(x0 + c, y1), (x0, y1 - c)] if "bl" in cs else [(x0, y1)]
    return p


class Pen:
    """Draws onto the structure or accent layer, optionally mirrored about the centre."""

    def __init__(self, wp, mirror=False):
        self.wp, self.m = wp, mirror

    def X(self, x):
        return self.wp.W - x if self.m else x

    def P(self, pts):
        return [(self.X(x), y) for x, y in pts]

    def _d(self, accent):
        return self.wp.adraw if accent else self.wp.draw

    def poly(self, pts, fill=None, outline=None, width=None, accent=False):
        if fill is not None and not accent:
            self.wp.adraw.polygon(self.P(pts), fill=(0, 0, 0))
        self._d(accent).polygon(self.P(pts), fill=fill, outline=outline,
                                width=width or self.wp.S)

    def line(self, pts, fill, width=None, accent=False):
        self._d(accent).line(self.P(pts), fill=fill, width=width or self.wp.S, joint="curve")

    def circle(self, cx, cy, r, fill=None, outline=None, width=None, accent=False):
        x = self.X(cx)
        if fill is not None and not accent:
            self.wp.adraw.ellipse([x - r, cy - r, x + r, cy + r], fill=(0, 0, 0))
        self._d(accent).ellipse([x - r, cy - r, x + r, cy + r], fill=fill, outline=outline,
                                width=width or self.wp.S)

    def hatch(self, pts, spacing, color, direction=1, width=None, accent=False):
        """45-degree hatching clipped to a polygon."""
        if self.m:
            direction = -direction
        pts = self.P(pts)
        target = self.wp.alayer if accent else self.wp.img
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, y0 = int(min(xs)), int(min(ys))
        w, h = int(max(xs)) - x0 + 2, int(max(ys)) - y0 + 2
        if w <= 2 or h <= 2:
            return
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in pts], fill=255)
        lines = Image.new("L", (w, h), 0)
        ld = ImageDraw.Draw(lines)
        for c in range(-h, w + h, spacing):
            if direction > 0:
                ld.line([(c, h), (c + h, 0)], fill=255, width=width or self.wp.S)
            else:
                ld.line([(c, 0), (c + h, h)], fill=255, width=width or self.wp.S)
        target.paste(Image.new("RGB", (w, h), color), (x0, y0), ImageChops.multiply(mask, lines))

    def hexbolt(self, cx, cy, r):
        self.poly(hex_pts(cx, cy, r, 0), fill=STEEL[3], outline=LINE)
        self.circle(cx, cy, r * 0.4, fill=STEEL[0])


class Wallpaper:
    def __init__(self, w, h, seed, palette, ss=2):
        self.rng = random.Random(seed)
        self.seed = seed
        self.S = ss
        self.W, self.H = w * ss, h * ss
        self.out_size = (w, h)
        pal = PALETTES[palette]
        self.accent, self.accent2 = pal["accent"], pal["accent2"]
        self.u = 8 * ss
        self.font_s = load_font(int(13 * ss))
        self.font_xs = load_font(int(10 * ss))
        self.labels = []

    def snap(self, v):
        return int(round(v / self.u)) * self.u

    def r(self, a, b):
        return self.rng.uniform(a, b)

    # ------------------------------------------------------------ background
    def background(self):
        H, W = self.H, self.W
        y = np.linspace(0, 1, H)[:, None]
        img = np.broadcast_to(np.array(BG, float) + (y ** 1.5 * 6)[..., None], (H, W, 3)).copy()
        # faint accent bloom behind the core
        yy, xx = np.ogrid[:H, :W]
        d2 = ((xx - self.cx) ** 2 + (yy - self.cy) ** 2) / (self.R * 1.9) ** 2
        img += np.exp(-d2)[..., None] * np.array(self.accent, float) * 0.05
        return img

    def hex_grid(self, pen):
        """Sparse, patchy hex grid fading in toward the bottom."""
        rng, u = self.rng, self.u
        hr = u * self.rng.choice([3, 4, 5])
        dx, dy = math.sqrt(3) * hr, 1.5 * hr
        fx, fy = self.r(1.5, 3.5), self.r(1.5, 3.5)
        px, py = self.r(0, 6.28), self.r(0, 6.28)
        accent_cells = rng.randint(1, 3)
        row = 0
        y = -hr
        while y < self.H + hr:
            x = (dx / 2 if row % 2 else 0) - dx
            while x < self.W + dx:
                nx, ny = x / self.W, min(1.0, max(0.0, y / self.H))
                field = 0.5 + 0.5 * math.sin(nx * fx * 6.28 + px) * math.cos(ny * fy * 6.28 + py)
                p = field * (0.15 + 0.85 * ny ** 1.3)
                if rng.random() < p * 0.9:
                    pts = hex_pts(x, y, hr - self.S * 2)
                    fill = GRID_FILL if rng.random() < 0.25 else None
                    pen.poly(pts, fill=fill, outline=GRID)
                    if accent_cells and ny > 0.3 and rng.random() < 0.004:
                        pen.poly(pts, fill=scale(self.accent, 0.12),
                                 outline=scale(self.accent, 0.55), accent=True)
                        accent_cells -= 1
                x += dx
            y += dy
            row += 1

    def big_hexes(self, pen):
        for i in range(self.rng.randint(1, 2)):
            R = self.r(0.45, 0.8) * self.W
            cx = self.rng.choice([self.r(-0.1, 0.25), self.r(0.75, 1.1)]) * self.W
            cy = self.r(0.1, 0.45) * self.H
            pts = hex_pts(cx, cy, R, self.rng.choice([0, 30]))
            pen.poly(pts, outline=(20, 22, 26), width=self.S * 2)
            # one edge picked out faintly in accent, kept out of the clock zone
            k = self.rng.randrange(6)
            a, b = pts[k], pts[(k + 1) % 6]
            t0, t1 = sorted((self.r(0, 0.6), self.r(0.4, 1)))
            if i == 0 and min(a[1], b[1]) > 0.32 * self.H:
                pen.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                          (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                         fill=scale(self.accent, 0.3), width=self.S, accent=True)

    # ------------------------------------------------------------ chassis
    def spine(self, pen):
        S, u, cx, sw = self.S, self.u, self.cx, self.sw
        top = self.spine_top
        c = int(sw * 0.7)
        body = chamfer_rect(cx - sw, top, cx + sw, self.H + u, c, "tl tr")
        pen.poly(body, fill=STEEL[1], outline=LINE)
        # inner channel
        iw = sw // 3
        pen.poly(chamfer_rect(cx - iw, top + c + u, cx + iw, self.H + u, iw, "tl tr"),
                 fill=STEEL[0], outline=DIM)
        # segment lines
        y = top + c + u * 3
        while y < self.H:
            pen.line([(cx - sw, y), (cx - iw, y)], fill=DIM)
            pen.line([(cx + iw, y), (cx + sw, y)], fill=DIM)
            y += u * self.rng.choice([3, 4, 6])
        # chevrons between spine top and core, the top few lit
        a = iw - self.S * 3
        y = top + c + u * 2
        n = 0
        lit = self.rng.randint(1, 3)
        while y < self.cy - self.R - u * 2 and n < 9:
            acc = n < lit
            pen.line([(cx - a, y + a), (cx, y), (cx + a, y + a)],
                     fill=scale(self.accent, 0.9) if acc else LINE, width=S * 2, accent=acc)
            y += u * 1.5
            n += 1
        # connector block low on the spine
        ky = self.snap(self.r(0.84, 0.9) * self.H)
        kw = sw + u
        pen.poly(chamfer_rect(cx - kw, ky, cx + kw, ky + u * 5, u, "bl br"),
                 fill=STEEL[2], outline=LINE)
        px = cx - kw + u
        while px < cx + kw - u:
            pen.poly([(px, ky + u), (px + u // 2, ky + u), (px + u // 2, ky + u * 3), (px, ky + u * 3)],
                     fill=STEEL[0], outline=DIM)
            px += u
        lamp = self.rng.random() < 0.5
        pen.poly([(cx - u * 2, ky + u * 4 - S), (cx + u * 2, ky + u * 4 - S),
                  (cx + u * 2, ky + u * 4 + S * 2), (cx - u * 2, ky + u * 4 + S * 2)],
                 fill=self.accent if lamp else DIM, accent=lamp)

    def wing(self, pen, spec):
        rng = random.Random(spec["seed"])
        S, u = self.S, self.u
        xs, y, d, t, s = spec["xs"], spec["y"], spec["d"], spec["t"], spec["slope"]
        xo = xs - d
        if s == 0:
            c = min(t // 2, u * 2)
            pts = chamfer_rect(xo, y, xs, y + t, c, "tl bl")
        else:
            pts = [(xs, y), (xo, y - d * s), (xo, y - d * s + t), (xs, y + t)]
        pen.poly(pts, fill=rng.choice(STEEL[1:]), outline=LINE)
        deco = spec["deco"]
        if deco == "hatch":
            pen.hatch(pts, rng.choice([S * 6, S * 8]), DIM, direction=-1 if s >= 0 else 1)
        elif deco == "meter" and d > u * 10:
            self.meter(pen, xo + u * 2, y - (d - u * 2) * s - u * 0.25, int((d - u * 4) / (u * 1.5)),
                       min(t - u, u * 2), s, rng)
        elif deco == "slots":
            n = int(d / (u * 2))
            for i in range(1, n):
                x = xs - i * u * 2
                yt = y - (xs - x) * s
                pen.line([(x, yt + u * 0.75), (x, yt + t - u * 0.75)], fill=DIM, width=S * 2)
        # bolts at the outer end
        if spec["bolts"]:
            br = S * 4
            ex, ey = xo + u * 1.25, y - (d - u * 1.25) * s
            pen.hexbolt(ex, ey + u * 1.25, br)
            if t > u * 4:
                pen.hexbolt(ex, ey + t - u * 1.25, br)
        if spec["hazard"]:
            hy = y - (d * 0.5) * s
            hp = [(xs - d * 0.2, y - d * 0.2 * s), (xs - d * 0.55, y - d * 0.55 * s),
                  (xs - d * 0.55, y - d * 0.55 * s + min(t, u * 2)), (xs - d * 0.2, y - d * 0.2 * s + min(t, u * 2))]
            pen.poly(hp, fill=STEEL[0])
            pen.hatch(hp, S * 10, scale(self.accent, 0.7), width=S * 4, accent=True)
        if spec["strip"]:
            pen.line([(xs - S * 3, y + S * 3), (xo + u, y - (d - u) * s + S * 3)],
                     fill=scale(self.accent, 0.8), width=S * 2, accent=True)
        return (xo, y - d * s + t / 2)

    def meter(self, pen, x, y, n, h, s, rng):
        """Row of 45-degree slanted segments, first few lit."""
        S, u = self.S, self.u
        n = max(3, min(n, 14))
        lit = rng.randint(1, max(1, n // 2))
        step = u * 1.5
        y0 = y + u * 0.75
        for i in range(n):
            sx = x + i * step
            sy = y0 + i * step * s  # follow the plate's slope toward the spine
            sl = 0 if s else h * 0.5  # on flat plates, slant segments 45 degrees
            sw = step - S * 3
            seg = [(sx + sl, sy), (sx + sw + sl, sy + sw * s),
                   (sx + sw, sy + sw * s + h), (sx, sy + h)]
            acc = (n - 1 - i) < lit  # light from the spine side outward
            pen.poly(seg, fill=scale(self.accent, 0.85) if acc else STEEL[0],
                     outline=None if acc else DIM, accent=acc)

    # ------------------------------------------------------------ traces
    def route(self, start, d, rng):
        u, H = self.u, self.H
        pts = [start]
        x, y = start
        ymin = self.H * 0.27
        for _ in range(rng.randint(3, 6)):
            L = self.snap(rng.uniform(1.5, 6) * u * (0.6 if d % 2 else 1.4))
            L = max(L, u * 2)
            dx, dy = DIRS[d]
            if y + dy * L < ymin:
                d, (dx, dy) = 4, DIRS[4]
            x, y = x + dx * L, y + dy * L
            pts.append((x, y))
            if x < -u * 2 or y > H + u * 2:
                return pts, False
            d = min(6, max(2, d + rng.choice([-1, 1])))
        return pts, True

    def bundle(self, pen, spec):
        rng = random.Random(spec["seed"])
        S, u = self.S, self.u
        path, ends_inside = self.route(spec["start"], spec["dir"], rng)
        if len(path) < 2:
            return
        n = spec["n"]
        sp = u * 0.75
        for i in range(n):
            off = (i - (n - 1) / 2) * sp
            pl = offset_polyline(path, off)
            acc = spec["accent"] == i
            col = scale(self.accent, 0.85) if acc else DIM
            pen.line(pl, fill=col, width=S * (2 if acc else 1) + S, accent=acc)
            if ends_inside:
                ex, ey = pl[-1]
                kind = rng.choice(["via", "via", "pad"])
                if kind == "via":
                    pen.circle(ex, ey, S * 4, fill=BG, outline=col, width=S * 2, accent=acc)
                    if acc:
                        pen.circle(ex, ey, S * 1.5, fill=self.accent, accent=True)
                else:
                    pen.poly([(ex - S * 3, ey - S * 3), (ex + S * 3, ey - S * 3),
                              (ex + S * 3, ey + S * 3), (ex - S * 3, ey + S * 3)],
                             fill=col, accent=acc)
        if ends_inside and spec.get("label") and len(self.labels) < 4:
            ex, ey = path[-1]
            self.labels.append((pen.X(ex), ey, pen.m))

    # ------------------------------------------------------------ core
    def core(self, pen):
        S, u, cx, cy, R = self.S, self.u, self.cx, self.cy, self.R
        rng = self.rng
        rot = 30
        outer = hex_pts(cx, cy, R, rot)
        pen.poly(outer, fill=STEEL[0], outline=LINE, width=S * 2)
        # perimeter dots
        for k in range(6):
            a, b = outer[k], outer[(k + 1) % 6]
            for i in range(1, 12):
                t = i / 12
                pen.circle(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, S, fill=DIM)
        # thick ring band
        ring = hex_pts(cx, cy, R * 0.86, rot)
        pen.poly(ring, fill=STEEL[2], outline=LINE)
        inner_ring = hex_pts(cx, cy, R * 0.72, rot)
        pen.poly(inner_ring, fill=STEEL[0], outline=LINE)
        # accent arc: 1-3 contiguous edges of a mid ring
        mid = hex_pts(cx, cy, R * 0.79, rot)
        k0 = rng.randrange(6)
        for j in range(rng.randint(1, 3)):
            a, b = mid[(k0 + j) % 6], mid[(k0 + j + 1) % 6]
            pen.line([a, b], fill=self.accent, width=S * 3, accent=True)
        # hex bolts on the band
        for x, y in hex_pts(cx, cy, R * 0.79, rot + 30):
            pen.hexbolt(x, y, S * 5)
        # inner plate with hatching
        plate = hex_pts(cx, cy, R * 0.56, rot)
        pen.poly(plate, fill=STEEL[1], outline=LINE)
        pen.hatch(plate, S * 7, (25, 27, 31))
        # spokes
        for a, b in zip(hex_pts(cx, cy, R * 0.56, rot), hex_pts(cx, cy, R * 0.72, rot)):
            pen.line([a, b], fill=LINE, width=S * 2)
        # centre
        c1 = hex_pts(cx, cy, R * 0.26, rot)
        pen.poly(c1, fill=STEEL[0], outline=LINE, width=S * 2)
        c2 = hex_pts(cx, cy, R * 0.17, rot)
        pen.poly(c2, fill=scale(self.accent, 0.18), outline=self.accent, width=S * 2, accent=True)
        pen.poly(hex_pts(cx, cy, R * 0.06, rot), fill=self.accent, accent=True)
        # six short ticks outside the core, on the vertices
        for (ax, ay), (bx, by) in zip(hex_pts(cx, cy, R * 1.04, rot), hex_pts(cx, cy, R * 1.1, rot)):
            pen.line([(ax, ay), (bx, by)], fill=LINE, width=S * 2)

    # ------------------------------------------------------------ HUD
    def hud(self, pen):
        S, u, rng, W, H = self.S, self.u, self.rng, self.W, self.H
        for _ in range(rng.randint(3, 5)):
            cx = self.snap(self.r(0.08, 0.92) * W)
            cy = self.snap(self.r(0.08, 0.3) * H)
            pen.line([(cx - u, cy), (cx + u, cy)], fill=DIM)
            pen.line([(cx, cy - u), (cx, cy + u)], fill=DIM)
        for x, y, mirrored in self.labels:
            txt = rng.choice(LABELS)
            tw = self.draw.textlength(txt, font=self.font_xs)
            tx = x - tw - u if mirrored else x + u
            self.draw.text((tx, y - u * 2.2), txt, font=self.font_xs, fill=TEXT)
        by = H - self.snap(H * 0.075)
        draw = self.draw
        draw.text((u * 3, by), f"CYBERWARE MK.{rng.randint(1, 9)} // {rng.randint(0, 0xFFFF):04X}-{rng.randint(0, 0xFFF):03X}",
                  font=self.font_s, fill=TEXT)
        draw.text((u * 3, by + u * 2.5), f"SEED {self.seed:06d}  ·  SYNC OK", font=self.font_xs, fill=DIM)
        self.adraw.rectangle([u * 3, by - u * 1.5, u * 7, by - u * 1.5 + S * 2], fill=self.accent)
        bx = W - u * 3
        while bx > W - u * 22:
            bw = S * rng.choice([1, 2, 2, 3, 4])
            draw.rectangle([bx - bw, by, bx, by + u * 4], fill=TEXT)
            bx -= bw + S * rng.choice([2, 3, 4])

    # ------------------------------------------------------------ render
    def render(self):
        rng, W, H, u, S = self.rng, self.W, self.H, self.u, self.S
        self.cx = W // 2
        self.R = self.snap(self.r(0.2, 0.27) * W)
        self.cy = self.snap(self.r(0.48, 0.58) * H)
        self.sw = self.snap(self.r(0.06, 0.09) * W)
        self.spine_top = self.snap(self.r(0.27, 0.32) * H)

        self.img = Image.fromarray(np.clip(self.background(), 0, 255).astype(np.uint8))
        self.draw = ImageDraw.Draw(self.img)
        self.alayer = Image.new("RGB", (W, H), (0, 0, 0))
        self.adraw = ImageDraw.Draw(self.alayer)

        flat = Pen(self)
        self.hex_grid(flat)
        self.big_hexes(flat)

        # ---- left-half specs, rendered on both sides (with some per-side dropout)
        xs = self.cx - self.sw - u
        slope = rng.choice([1, 1, -1, 0])
        wings = []
        hazard_at = rng.randrange(4)
        strip_at = rng.randrange(5)
        clusters = [
            (self.snap(self.cy - self.R * rng.uniform(0.2, 0.6)), H * 0.68, rng.randint(3, 5), slope, (0.15, 0.36)),
            (self.snap(self.r(0.74, 0.8) * H), H * 0.93, rng.randint(1, 3),
             rng.choice([-slope, 0]) if slope else rng.choice([1, -1]), (0.08, 0.2)),
        ]
        for y, ymax, nmax, sl, drange in clusters:
            k = 0
            while y < ymax and k < nmax:
                t = self.snap(self.r(2.5, 6) * u)
                d = self.snap(self.r(*drange) * W)
                if abs(y - self.cy) < self.R:  # make sure wings clear the core
                    d = max(d, self.snap(self.R - self.sw + u * self.r(3, 10)))
                i = len(wings)
                wings.append(dict(xs=xs, y=y, d=d, t=t, slope=sl,
                                  deco=rng.choice(["hatch", "meter", "slots", "plain"]),
                                  bolts=rng.random() < 0.5, hazard=i == hazard_at,
                                  strip=i == strip_at, seed=rng.randrange(1 << 30),
                                  trace=rng.random() < 0.55))
                y += t + self.snap(self.r(1, 5) * u)
                k += 1
        bundles = []
        accent_bundle = rng.randrange(max(1, sum(w["trace"] for w in wings) + 2))
        for w in wings:
            if w["trace"]:
                tip = (w["xs"] - w["d"], w["y"] - w["d"] * w["slope"] + w["t"] / 2)
                bundles.append(dict(start=tip, dir=4, n=rng.randint(1, 4), seed=rng.randrange(1 << 30)))
        for _ in range(2):  # traces coming up from the bottom edge
            sx = self.snap(self.r(0.22, 0.38) * W)
            bundles.append(dict(start=(sx, H + u * 2), dir=2, n=rng.randint(2, 5), seed=rng.randrange(1 << 30)))
        for i, b in enumerate(bundles):
            b["accent"] = rng.randrange(b["n"]) if i == accent_bundle else -1
            b["label"] = rng.random() < 0.6

        sides = [Pen(self), Pen(self, mirror=True)]
        for b in bundles:
            for p in sides:
                if p.m and rng.random() < 0.3:
                    continue
                spec = dict(b)
                if p.m and spec["accent"] >= 0 and rng.random() < 0.5:
                    spec["accent"] = -1  # break the symmetry of the accent
                self.bundle(p, spec)
        self.spine(flat)
        for wspec in wings:
            for p in sides:
                spec = dict(wspec)
                if p.m:
                    if rng.random() < 0.2:
                        continue
                    spec["hazard"] = spec["strip"] = False
                    if rng.random() < 0.3:
                        spec["deco"] = rng.choice(["hatch", "meter", "slots", "plain"])
                self.wing(p, spec)
        self.core(flat)
        # single accent2 indicator somewhere on the chassis
        p = rng.choice(sides)
        w = rng.choice(wings)
        p.circle(w["xs"] - u * 2, w["y"] + u * 1.5, S * 3, fill=self.accent2, accent=True)

        self.hud(flat)
        return self.composite()

    def composite(self):
        S = self.S
        base = np.asarray(self.img, float)
        sharp = np.asarray(self.alayer, float)
        g1 = np.asarray(self.alayer.filter(ImageFilter.GaussianBlur(5 * S)), float)
        g2 = np.asarray(self.alayer.filter(ImageFilter.GaussianBlur(26 * S)), float)
        mask = sharp.max(axis=2, keepdims=True) > 0
        out = np.where(mask, sharp, base) + g1 * 0.85 + g2 * 0.6
        final = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize(self.out_size, Image.LANCZOS)

        f = np.asarray(final, float)
        h, w = f.shape[:2]
        f *= (1 - 0.05 * ((np.arange(h) % 3) == 0))[:, None, None]
        y = np.linspace(-1, 1, h)[:, None]
        x = np.linspace(-1, 1, w)[None, :]
        f *= (1 - 0.38 * np.clip(x ** 2 * 0.8 + y ** 2 * 0.6, 0, 1))[..., None]
        f += np.random.default_rng(self.seed).normal(0, 3.2, (h, w, 1))
        return Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--palette", choices=sorted(PALETTES), default="sodium")
    ap.add_argument("--width", type=int, default=1290)   # iPhone Pro Max
    ap.add_argument("--height", type=int, default=2796)
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--out", default="out/cyberware")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for i in range(args.count):
        seed = args.seed + i if args.seed is not None else random.randrange(1_000_000)
        img = Wallpaper(args.width, args.height, seed, args.palette).render()
        path = os.path.join(args.out, f"cyberware_{args.palette}_{seed:06d}.png")
        img.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
