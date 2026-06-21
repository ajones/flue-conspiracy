#!/usr/bin/env python3
"""
draw_frame.py — Send a full pixel frame to a WLED matrix device.

Usage:
    python3 draw_frame.py <device_name> <design_name> [--config PATH]

Device names are resolved via ~/.openclaw/workspace/.wled-config.
Built-in designs: smiley, rainbow, bullseye, checkerboard

Add new designs by defining a function named design_<name>(width, height) -> pixels
where pixels is a list of lists of [R, G, B].
"""

import json
import math
import subprocess
import sys
from pathlib import Path

DEFAULT_CONFIG = Path.home() / ".openclaw/workspace/.wled-config"


# ---------------------------------------------------------------------------
# Device resolution
# ---------------------------------------------------------------------------

def load_config(path=DEFAULT_CONFIG):
    with open(path) as f:
        return json.load(f)

def resolve_device(name, config):
    entry = config.get(name)
    if entry is None:
        raise ValueError(f"Device '{name}' not found in config. Available: {list(config.keys())}")
    if isinstance(entry, str):
        return {"url": entry, "matrix": None, "virtualCoords": False}
    return entry

def get_matrix_dims(device):
    m = device.get("matrix")
    if m:
        return m["w"], m["h"]
    count = device.get("ledCount", 1)
    return count, 1  # treat as 1D strip if no matrix info


# ---------------------------------------------------------------------------
# Coordinate mapping
# ---------------------------------------------------------------------------

def xy_to_index(x, y, width):
    # When virtualCoords=True, WLED's i-field uses virtual row-major space.
    # WLED internally handles physical serpentine wiring — we just use y*w+x.
    return y * width + x


# ---------------------------------------------------------------------------
# WLED HTTP helpers
# ---------------------------------------------------------------------------

def post(base_url, path, payload):
    result = subprocess.run(
        ["curl", "-s", "-X", "POST",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload),
         "--max-time", "5",
         f"{base_url}{path}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return result.stdout

def clear_display(base_url, led_count, brightness=25):
    # Turn off, then expand segment to full strip and set solid black.
    # This reliably clears per-LED colors set via the i-field.
    post(base_url, "/json/state", {"on": False})
    import time; time.sleep(0.3)
    post(base_url, "/json/state", {
        "on": True,
        "bri": brightness,
        "seg": [{"id": 0, "start": 0, "stop": led_count, "fx": 0, "col": [[0, 0, 0]], "frz": False}]
    })
    time.sleep(0.2)

def send_frame(base_url, pixels, width, height, led_count, device=None):
    i_array = []
    for y in range(height):
        virtual_y = height - 1 - y if device and device.get("origin") == "bottom-left" else y
        for x in range(width):
            color = pixels[y][x]
            if color != [0, 0, 0]:
                i_array.append(xy_to_index(x, virtual_y, width))
                i_array.append(color)
    post(base_url, "/json/state", {"seg": [{"id": 0, "i": i_array}]})
    return len(i_array) // 2


# ---------------------------------------------------------------------------
# Design primitives
# ---------------------------------------------------------------------------

def blank(width, height):
    return [[[0, 0, 0] for _ in range(width)] for _ in range(height)]

def set_pixel(pixels, x, y, color, width, height):
    if 0 <= x < width and 0 <= y < height:
        pixels[y][x] = list(color)

def fill_ellipse(pixels, cx, cy, rx, ry, color, width, height):
    for y in range(height):
        for x in range(width):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                pixels[y][x] = list(color)

def draw_arc(pixels, cx, cy, r, thickness, color, width, height, y_min=None, y_max=None):
    for y in range(height):
        if y_min is not None and y < y_min:
            continue
        if y_max is not None and y > y_max:
            continue
        for x in range(width):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if abs(dist - r) < thickness:
                pixels[y][x] = list(color)

def draw_circle_dots(pixels, cx, cy, radius_sq, color, width, height):
    for y in range(height):
        for x in range(width):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius_sq:
                pixels[y][x] = list(color)

def blend(a, b, t):
    return [round(a[i] + (b[i] - a[i]) * t) for i in range(3)]

def blend_ellipse(pixels, cx, cy, rx, ry, color, strength, width, height):
    for y in range(height):
        for x in range(width):
            dx = (x - cx) / rx
            dy = (y - cy) / ry
            dist = dx * dx + dy * dy
            if dist <= 1.0:
                pixels[y][x] = blend(pixels[y][x], color, (1.0 - dist) * strength)


# ---------------------------------------------------------------------------
# Built-in designs
# ---------------------------------------------------------------------------

def design_smiley(width, height):
    pixels = blank(width, height)
    # Face centered in display, radius capped by the narrower dimension
    r = (width - 1) / 2
    cx = width / 2 - 0.5
    cy = height / 2 - 0.5

    YELLOW = [220, 200, 0]
    BLACK = [0, 0, 0]

    fill_ellipse(pixels, cx, cy, r, r, YELLOW, width, height)

    # Eyes: two pixels, symmetric, upper third of face
    ey = round(cy - r * 0.35)
    for ex in [round(cx - r * 0.4), round(cx + r * 0.4)]:
        draw_circle_dots(pixels, ex, ey, 0.6, BLACK, width, height)

    # Smile: arc in lower half of face
    draw_arc(pixels, cx, cy - r * 0.1, r * 0.65, 0.6, BLACK, width, height,
             y_min=round(cy + r * 0.2))

    return pixels


def design_rainbow(width, height):
    pixels = blank(width, height)
    RAINBOW = [
        [255, 0, 0], [255, 127, 0], [255, 220, 0],
        [0, 230, 0], [0, 100, 255], [100, 0, 200],
    ]
    for y in range(height):
        for x in range(width):
            pixels[y][x] = RAINBOW[(x + y) % len(RAINBOW)]
    return pixels


def design_bullseye(width, height):
    pixels = blank(width, height)
    cx, cy = width / 2 - 0.5, height / 2 - 0.5
    RINGS = [
        [255, 0, 0], [255, 140, 0], [255, 220, 0],
        [0, 200, 0], [0, 100, 220], [120, 0, 200],
    ]
    for y in range(height):
        for x in range(width):
            dist = round(math.sqrt((x - cx) ** 2 + (y - cy) ** 2))
            pixels[y][x] = RINGS[dist % len(RINGS)]
    return pixels


def design_checkerboard(width, height):
    pixels = blank(width, height)
    A, B = [220, 80, 0], [0, 60, 180]
    for y in range(height):
        for x in range(width):
            pixels[y][x] = A if (x + y) % 2 == 0 else B
    return pixels


def design_moonrift(width, height):
    pixels = blank(width, height)

    top = [6, 12, 28]
    mid = [18, 10, 48]
    bottom = [8, 14, 34]
    center_glow = [28, 138, 166]
    moon_outer = [245, 214, 120]
    moon_inner = [255, 245, 210]
    crystal_core = [255, 229, 160]
    crystal_edge = [60, 220, 210]
    star = [238, 244, 255]
    ember = [255, 134, 88]

    cx = (width - 1) / 2
    cy = (height - 1) / 2

    # Background: cool vertical gradient with a slightly brighter center lane.
    for y in range(height):
        ty = y / (height - 1)
        row_color = blend(top, bottom, ty)
        if ty < 0.45:
            row_color = blend(row_color, mid, ty / 0.45)
        else:
            row_color = blend(row_color, mid, max(0.0, 1.0 - (ty - 0.45) / 0.55))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            vignette = min(1.0, edge * 0.7)
            pixels[y][x] = blend(row_color, [2, 4, 10], vignette)
            lane = max(0.0, 1.0 - (abs(x - cx) / 2.7))
            pixels[y][x] = blend(pixels[y][x], center_glow, lane * 0.22)

    # Aurora ribbons and a central seam.
    for y in range(height):
        for x in range(width):
            dx = abs(x - cx)
            seam = max(0.0, 1.0 - dx / 1.8)
            arc = math.sin((y / height) * math.pi * 2.6 + (x * 0.7)) * 0.5 + 0.5
            if 5 <= y <= height - 7:
                pixels[y][x] = blend(pixels[y][x], [46, 92, 168], seam * 0.12)
                pixels[y][x] = blend(pixels[y][x], [34, 178, 176], seam * arc * 0.06)

    # Moon / portal at the top right.
    blend_ellipse(pixels, width - 3.2, 6.8, 2.4, 2.4, moon_outer, 0.6, width, height)
    blend_ellipse(pixels, width - 3.0, 7.0, 1.3, 1.3, moon_inner, 0.95, width, height)
    draw_arc(pixels, width - 3.0, 7.0, 3.1, 0.7, [160, 220, 235], width, height, y_min=3, y_max=11)
    draw_arc(pixels, width - 3.0, 7.0, 4.1, 0.5, [186, 110, 245], width, height, y_min=2, y_max=12)

    # Central crystal flame.
    for y in range(11, height - 6):
        taper = 1.0 - abs((y - (height * 0.58)) / (height * 0.28))
        taper = max(0.0, taper)
        half_width = 0.6 + taper * 1.7
        glow = blend(crystal_edge, crystal_core, min(1.0, taper))
        for x in range(width):
            dist = abs(x - cx)
            if dist <= half_width:
                strength = 0.6 + taper * 0.4
                pixels[y][x] = blend(pixels[y][x], glow, strength)
                if dist < 0.6:
                    pixels[y][x] = blend(pixels[y][x], [255, 252, 244], 0.55)

    # Lower anchor / roots.
    for y in range(height - 8, height):
        for x in range(width):
            wave = abs(x - cx) + max(0.0, (y - (height - 8)) * 0.45)
            if wave < 4.0:
                pixels[y][x] = blend(pixels[y][x], [14, 55, 72], 0.35)
            if wave < 2.4:
                pixels[y][x] = blend(pixels[y][x], [96, 38, 126], 0.18)

    # Stars and sparks.
    spark_points = [
        (1, 3, star), (2, 9, [140, 242, 226]), (4, 5, star),
        (0, 15, [255, 196, 110]), (8, 2, [214, 204, 255]),
        (9, 13, ember), (3, 22, [180, 250, 220]), (7, 18, [255, 231, 170]),
        (1, 30, [122, 216, 255]), (9, 31, [236, 160, 255]),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.35, color, width, height)

    # A tiny constellation trail that arcs toward the moon.
    trail = [(2, 12), (3, 10), (4, 9), (5, 8), (6, 8), (7, 7), (8, 7)]
    for idx, (x, y) in enumerate(trail):
        tint = blend([90, 180, 255], [255, 216, 140], idx / max(1, len(trail) - 1))
        draw_circle_dots(pixels, x, y, 0.22, tint, width, height)

    return pixels


def design_self_exploration(width, height):
    pixels = blank(width, height)

    top = [4, 8, 22]
    mid = [12, 20, 52]
    bottom = [7, 18, 34]
    teal = [28, 165, 170]
    aqua = [82, 232, 220]
    gold = [255, 205, 88]
    amber = [255, 140, 60]
    rose = [244, 96, 156]
    violet = [170, 98, 255]
    pearl = [245, 248, 255]
    shadow = [10, 15, 34]

    cx = (width - 1) / 2
    cy = (height - 1) / 2

    # Background: a dark vertical field with a cool center lane and soft edge falloff.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.25 + 0.15 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.8))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.4)
            base = blend(base, teal, lane * 0.16)
            if 9 <= y <= 28:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.55) + (x * 0.8))
                base = blend(base, [20, 70, 96], shimmer * 0.07)
            pixels[y][x] = base

    # Crown glow near the top.
    blend_ellipse(pixels, cx, 6.3, 2.2, 1.8, gold, 0.5, width, height)
    blend_ellipse(pixels, cx, 6.4, 1.0, 0.9, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 6.6, 3.0, 0.45, violet, width, height, y_min=3, y_max=10)
    draw_arc(pixels, cx, 6.4, 4.0, 0.35, aqua, width, height, y_min=2, y_max=11)

    # Crescent moon / eye on the upper right.
    blend_ellipse(pixels, width - 2.2, 7.0, 2.0, 2.0, pearl, 0.75, width, height)
    blend_ellipse(pixels, width - 1.6, 7.2, 1.0, 1.0, shadow, 1.0, width, height)
    draw_arc(pixels, width - 2.2, 7.0, 2.8, 0.4, rose, width, height, y_min=4, y_max=11)

    # Central lantern / seed.
    blend_ellipse(pixels, cx, 18.0, 2.6, 8.7, teal, 0.55, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.7, 7.0, gold, 0.75, width, height)
    blend_ellipse(pixels, cx, 17.2, 0.85, 5.2, pearl, 0.98, width, height)

    # Inner spine and runes.
    for y in range(10, 27):
        glow = 1.0 - abs(y - 18) / 9.0
        if glow > 0:
            set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, amber, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)

    # Side wings and aurora ribbons.
    for y in range(8, 28):
        lift = max(0.0, 1.0 - abs(y - 18) / 10.0)
        left_span = 1.2 + lift * 2.4
        right_span = 1.0 + lift * 2.2
        for x in range(width):
            dx = x - cx
            adx = abs(dx)
            if 1.0 < adx <= left_span + 0.1:
                blend_amt = lift * (1.0 - min(1.0, abs(adx - left_span) / 1.3)) * 0.22
                tint = aqua if dx < 0 else rose
                pixels[y][x] = blend(pixels[y][x], tint, blend_amt)
            if adx < 0.9 + right_span * 0.3 and lift > 0.35:
                pixels[y][x] = blend(pixels[y][x], teal if dx < 0 else violet, lift * 0.12)

    # Lower roots / bowl.
    draw_arc(pixels, cx, 30.5, 4.0, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.0, 3.0, 0.45, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.8 + depth * 2.7
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(amber, shadow, min(1.0, depth * 0.8))
                pixels[y][x] = blend(pixels[y][x], tint, 0.25 + depth * 0.18)
            if y >= 33 and dx <= max(0.0, 2.5 - (y - 33) * 0.55):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 74], 0.35)

    # Sparks and stars to keep the piece alive.
    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (9, 5, pearl), (0, 15, amber), (10, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 33, pearl), (4, 35, amber),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_tide_rune(width, height):
    pixels = blank(width, height)

    top = [4, 9, 22]
    mid = [14, 26, 52]
    bottom = [6, 14, 30]
    shadow = [8, 12, 24]
    teal = [24, 150, 170]
    aqua = [88, 228, 224]
    gold = [250, 210, 92]
    ember = [255, 144, 72]
    rose = [240, 100, 156]
    violet = [168, 98, 255]
    pearl = [245, 248, 255]
    jade = [36, 200, 150]

    cx = (width - 1) / 2

    # Background: a cool vertical field with a faint living seam through the center.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.24 + 0.16 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.82))
            lane = max(0.0, 1.0 - abs(x - cx) / 1.85)
            base = blend(base, teal, lane * 0.16)
            if 8 <= y <= 28:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.58) + (x * 1.15))
                base = blend(base, [18, 64, 96], shimmer * 0.06)
            pixels[y][x] = base

    # Crown / halo.
    blend_ellipse(pixels, cx, 4.2, 2.0, 1.4, gold, 0.55, width, height)
    blend_ellipse(pixels, cx, 4.4, 0.9, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 4.5, 2.8, 0.35, violet, width, height, y_min=1, y_max=8)
    draw_arc(pixels, cx, 4.2, 3.8, 0.28, aqua, width, height, y_min=0, y_max=9)

    # Upper moon / eye off to the right.
    blend_ellipse(pixels, width - 1.8, 8.0, 1.7, 1.7, pearl, 0.8, width, height)
    blend_ellipse(pixels, width - 1.3, 8.2, 0.8, 0.8, shadow, 1.0, width, height)
    draw_arc(pixels, width - 1.8, 8.0, 2.5, 0.35, rose, width, height, y_min=5, y_max=12)

    # Central lantern / tide seed.
    blend_ellipse(pixels, cx, 18.3, 2.4, 8.5, teal, 0.42, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.7, 7.2, gold, 0.72, width, height)
    blend_ellipse(pixels, cx, 17.1, 0.82, 5.4, pearl, 0.96, width, height)

    # Inner spine and rune marks.
    for y in range(10, 27):
        set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, ember, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)
        if y in (15, 19, 23):
            set_pixel(pixels, round(cx), y, jade, width, height)

    # Lower bowl / roots.
    draw_arc(pixels, cx, 30.5, 4.0, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.0, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.5
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(ember, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.24 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.3 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.35)

    # Sparks so the piece feels alive instead of static.
    spark_points = [
        (0, 2, pearl), (1, 5, aqua), (2, 10, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, ember), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, ember),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_still_seed(width, height):
    pixels = blank(width, height)

    top = [4, 8, 22]
    mid = [12, 20, 50]
    bottom = [6, 14, 28]
    shadow = [9, 12, 24]
    teal = [26, 160, 170]
    aqua = [84, 232, 220]
    gold = [252, 210, 92]
    amber = [255, 140, 64]
    rose = [244, 96, 154]
    violet = [170, 100, 255]
    pearl = [245, 248, 255]
    moss = [36, 126, 104]

    cx = (width - 1) / 2

    # Background: a dark vertical field with a soft center lane so the form reads
    # as a single quiet pillar rather than isolated bright pixels.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.22 + 0.16 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.85))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.0)
            base = blend(base, teal, lane * 0.18)
            if 8 <= y <= 28:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.62) + (x * 1.12))
                base = blend(base, [18, 70, 96], shimmer * 0.06)
            pixels[y][x] = base

    # Crown: a small halo that hints at a portal without turning into a literal icon.
    blend_ellipse(pixels, cx, 4.8, 1.9, 1.3, gold, 0.55, width, height)
    blend_ellipse(pixels, cx, 5.0, 0.8, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 4.9, 2.7, 0.35, violet, width, height, y_min=1, y_max=8)
    draw_arc(pixels, cx, 4.7, 3.6, 0.26, aqua, width, height, y_min=0, y_max=9)

    # Off-axis moonlet and a tiny trail to keep the piece asymmetrical and alive.
    blend_ellipse(pixels, width - 2.0, 7.2, 1.5, 1.5, pearl, 0.82, width, height)
    blend_ellipse(pixels, width - 1.5, 7.4, 0.7, 0.7, shadow, 1.0, width, height)
    trail = [(1, 3), (2, 5), (3, 7), (4, 9), (5, 10)]
    for idx, (x, y) in enumerate(trail):
        tint = blend(aqua, gold, idx / max(1, len(trail) - 1))
        draw_circle_dots(pixels, x, y, 0.24, tint, width, height)

    # Central seed: a tall glowing core with a bright spine and rune-like side marks.
    blend_ellipse(pixels, cx, 18.0, 2.2, 8.4, teal, 0.42, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.6, 7.0, gold, 0.74, width, height)
    blend_ellipse(pixels, cx, 17.0, 0.8, 5.0, pearl, 0.96, width, height)

    for y in range(10, 27):
        set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, amber, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)
        if y in (15, 19, 23):
            set_pixel(pixels, round(cx), y, moss, width, height)

    # Side wings: a quiet flare that frames the core without turning it into a full face.
    for y in range(8, 28):
        lift = max(0.0, 1.0 - abs(y - 18) / 10.0)
        for x in range(width):
            dx = x - cx
            adx = abs(dx)
            if 1.0 < adx <= 3.2:
                blend_amt = lift * (1.0 - min(1.0, abs(adx - 3.2) / 1.6)) * 0.18
                tint = aqua if dx < 0 else rose
                pixels[y][x] = blend(pixels[y][x], tint, blend_amt)
            if adx < 1.0 + lift * 0.8:
                pixels[y][x] = blend(pixels[y][x], teal if dx < 0 else violet, lift * 0.1)

    # Lower bowl / roots: a grounded curve so the vertical form feels held.
    draw_arc(pixels, cx, 30.5, 4.0, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.0, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.5
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(amber, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.24 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.2 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.35)

    # Sparks: a few bright notes along the edges to keep the field from feeling static.
    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, amber), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, amber),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_helix_signal(width, height):
    pixels = blank(width, height)

    top = [4, 8, 22]
    mid = [14, 24, 56]
    bottom = [6, 12, 28]
    shadow = [8, 11, 22]
    teal = [34, 180, 174]
    aqua = [92, 236, 226]
    gold = [250, 214, 92]
    ember = [255, 142, 72]
    rose = [240, 104, 156]
    violet = [166, 96, 255]
    pearl = [245, 248, 255]
    jade = [52, 210, 150]

    cx = (width - 1) / 2

    # Background: a dark chamber with a cool center lane so the helix reads as
    # a living signal instead of floating dots on black.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.18 + 0.18 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.86))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.1)
            base = blend(base, teal, lane * 0.14)
            if 6 <= y <= height - 7:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.7) + (x * 0.95))
                base = blend(base, [18, 60, 92], shimmer * 0.05)
            pixels[y][x] = base

    # Quiet halo at the top to give the pattern a sense of emergence.
    blend_ellipse(pixels, cx, 3.6, 1.9, 1.2, gold, 0.5, width, height)
    blend_ellipse(pixels, cx, 3.8, 0.8, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 3.8, 2.8, 0.34, violet, width, height, y_min=1, y_max=8)

    # Two interwoven strands with crossbars. The x-offsets deliberately breathe
    # so the helix feels organic rather than mechanically mirrored.
    for y in range(height):
        t = y / max(1, height - 1)
        phase = t * math.pi * 2.8
        drift = math.sin(phase)
        spread = 2.2 + 0.55 * math.cos(t * math.pi * 1.1)
        left_x = cx - spread + drift * 1.15
        right_x = cx + spread - math.sin(phase + 0.85) * 1.15

        strand_a = blend(teal, rose, t)
        strand_b = blend(aqua, ember, t)
        core = blend(gold, pearl, 0.35 + 0.65 * (1.0 - abs(0.5 - t) * 2.0))

        # Central spine: bright but narrow, alternating warmth so it does not
        # collapse into a flat line.
        spine_color = core if y % 2 == 0 else blend(core, jade, 0.45)
        set_pixel(pixels, round(cx), y, spine_color, width, height)
        if y % 4 == 0:
            set_pixel(pixels, round(cx) - 1, y, blend(spine_color, teal, 0.5), width, height)
            set_pixel(pixels, round(cx) + 1, y, blend(spine_color, rose, 0.45), width, height)

        # Crossbar between the two strands.
        x0 = round(min(left_x, right_x))
        x1 = round(max(left_x, right_x))
        if x1 - x0 > 1:
            bar_color = blend(violet, aqua, 0.45 + 0.35 * math.sin(t * math.pi * 4.0) ** 2)
            for x in range(x0 + 1, x1):
                if abs(x - cx) > 0.2:
                    pixels[y][x] = blend(pixels[y][x], bar_color, 0.55)

        # Strand nodes with slight thickness so the helix stays legible on 11
        # columns.
        for sx, base_color, glow_color in [
            (left_x, strand_a, blend(strand_a, pearl, 0.25)),
            (right_x, strand_b, blend(strand_b, pearl, 0.25)),
        ]:
            ix = round(sx)
            set_pixel(pixels, ix, y, glow_color, width, height)
            if 0 <= ix - 1 < width:
                pixels[y][ix - 1] = blend(pixels[y][ix - 1], base_color, 0.42)
            if 0 <= ix + 1 < width:
                pixels[y][ix + 1] = blend(pixels[y][ix + 1], base_color, 0.42)
            if y % 5 == 0:
                draw_circle_dots(pixels, ix, y, 0.42, glow_color, width, height)

    # Bottom anchor: a grounded bowl so the helix feels tethered, not floating.
    draw_arc(pixels, cx, height - 6.3, 3.7, 0.48, violet, width, height, y_min=height - 10, y_max=height - 1)
    draw_arc(pixels, cx, height - 5.7, 2.8, 0.42, aqua, width, height, y_min=height - 9, y_max=height - 1)
    for y in range(height - 8, height):
        depth = (y - (height - 8)) / max(1, 7)
        spread = 0.8 + depth * 2.4
        for x in range(width):
            if abs(x - cx) <= spread:
                pixels[y][x] = blend(pixels[y][x], [14, 48, 72], 0.28 + depth * 0.14)

    # A few edge sparks to keep the composition alive.
    spark_points = [
        (0, 2, pearl), (1, 6, aqua), (10, 4, rose), (9, 12, gold),
        (0, 18, ember), (10, 20, pearl), (1, 27, violet), (9, 31, jade),
        (2, 34, gold), (8, 35, rose),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.34, color, width, height)

    return pixels


def design_lantern_mosaic(width, height):
    pixels = blank(width, height)

    top = [4, 8, 20]
    mid = [13, 24, 54]
    bottom = [6, 14, 32]
    shadow = [8, 12, 24]
    teal = [34, 176, 176]
    aqua = [92, 234, 226]
    gold = [250, 214, 94]
    amber = [255, 170, 84]
    ember = [255, 142, 72]
    rose = [240, 102, 156]
    violet = [170, 98, 255]
    pearl = [245, 248, 255]
    moss = [50, 184, 118]

    cx = (width - 1) / 2

    # Background: a dark chamber with a cool seam so the lantern reads as a
    # deliberate object, not a few bright pixels on black.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.22 + 0.18 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.84))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.3)
            base = blend(base, teal, lane * 0.14)
            if 6 <= y <= height - 7:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.62) + (x * 1.05))
                base = blend(base, [18, 66, 96], shimmer * 0.05)
            pixels[y][x] = base

    # Crown / halo.
    blend_ellipse(pixels, cx, 4.0, 2.0, 1.3, gold, 0.52, width, height)
    blend_ellipse(pixels, cx, 4.1, 0.9, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 4.3, 2.9, 0.36, violet, width, height, y_min=1, y_max=8)
    draw_arc(pixels, cx, 4.0, 3.9, 0.28, aqua, width, height, y_min=0, y_max=9)

    # Right-side moon / eye to keep the image asymmetrical and alive.
    blend_ellipse(pixels, width - 1.8, 7.5, 1.7, 1.7, pearl, 0.8, width, height)
    blend_ellipse(pixels, width - 1.2, 7.7, 0.8, 0.8, shadow, 1.0, width, height)
    draw_arc(pixels, width - 1.8, 7.5, 2.4, 0.34, rose, width, height, y_min=4, y_max=12)

    # Central lantern body.
    blend_ellipse(pixels, cx, 18.1, 2.5, 8.7, teal, 0.44, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.7, 7.1, gold, 0.72, width, height)
    blend_ellipse(pixels, cx, 17.0, 0.85, 5.1, pearl, 0.98, width, height)

    # Facets and spine.
    for y in range(10, 27):
        glow = 1.0 - abs(y - 18) / 9.0
        if glow > 0:
            set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, ember, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)
        if y in (15, 19, 23):
            set_pixel(pixels, round(cx), y, moss, width, height)

    # Side wings / petals so the core reads like a living mosaic.
    for y in range(8, 28):
        lift = max(0.0, 1.0 - abs(y - 18) / 10.0)
        left_span = 1.1 + lift * 2.3
        right_span = 0.9 + lift * 2.1
        for x in range(width):
            dx = x - cx
            adx = abs(dx)
            if 1.0 < adx <= left_span + 0.15:
                amt = lift * (1.0 - min(1.0, abs(adx - left_span) / 1.2)) * 0.22
                tint = aqua if dx < 0 else rose
                pixels[y][x] = blend(pixels[y][x], tint, amt)
            if adx < 0.95 + right_span * 0.3 and lift > 0.35:
                pixels[y][x] = blend(pixels[y][x], teal if dx < 0 else violet, lift * 0.1)

    # Lower bowl / roots.
    draw_arc(pixels, cx, 30.8, 4.0, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.2, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.6
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(ember, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.24 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.3 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.35)

    # Sparks keep the piece from feeling static.
    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, ember), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, amber),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_quiet_gate(width, height):
    pixels = blank(width, height)

    top = [4, 8, 18]
    mid = [13, 24, 54]
    bottom = [6, 14, 32]
    shadow = [8, 12, 24]
    teal = [30, 168, 176]
    aqua = [96, 236, 226]
    gold = [250, 214, 94]
    amber = [255, 160, 78]
    rose = [240, 102, 156]
    violet = [170, 98, 255]
    pearl = [245, 248, 255]

    cx = (width - 1) / 2

    # Dark chamber background with a faint center lane.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.18 + 0.16 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.85))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.0)
            base = blend(base, teal, lane * 0.16)
            if 5 <= y <= height - 6:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.58) + (x * 0.9))
                base = blend(base, [18, 56, 88], shimmer * 0.05)
            pixels[y][x] = base

    # Halo and gate crown.
    blend_ellipse(pixels, cx, 5.8, 2.2, 1.5, gold, 0.56, width, height)
    blend_ellipse(pixels, cx, 5.9, 0.9, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 6.0, 3.0, 0.36, aqua, width, height, y_min=2, y_max=9)
    draw_arc(pixels, cx, 5.8, 4.0, 0.28, violet, width, height, y_min=1, y_max=10)

    # Central gate body.
    blend_ellipse(pixels, cx, 18.2, 2.4, 7.9, teal, 0.44, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.7, 6.1, gold, 0.74, width, height)
    blend_ellipse(pixels, cx, 17.2, 0.8, 4.8, pearl, 0.96, width, height)

    # A quiet spine of runes through the center.
    for y in range(10, 27):
        set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, amber, width, height)
            set_pixel(pixels, round(cx) + 1, y, rose, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, violet, width, height)

    # Two rising stair-rails that lean into the gate.
    left_steps = [(1 + i, 31 - 2 * i) for i in range(9)]
    right_steps = [(9 - i, 31 - 2 * i) for i in range(9)]
    stair_colors = [amber, gold, aqua, teal, rose, violet, pearl, aqua, gold]
    for idx, (x, y) in enumerate(left_steps):
        color = stair_colors[idx]
        set_pixel(pixels, x, y, color, width, height)
        if x + 1 < width:
            set_pixel(pixels, x + 1, y, color, width, height)
    for idx, (x, y) in enumerate(right_steps):
        color = stair_colors[len(stair_colors) - 1 - idx]
        set_pixel(pixels, x, y, color, width, height)
        if x - 1 >= 0:
            set_pixel(pixels, x - 1, y, color, width, height)

    # Grounding bowl and side echoes.
    draw_arc(pixels, cx, 31.4, 4.2, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.8, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.5
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(amber, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.22 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.2 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.34)

    # Stars and sparks keep the piece from feeling static.
    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, amber), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, amber),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_liminal_beacon(width, height):
    pixels = blank(width, height)

    top = [5, 10, 24]
    mid = [12, 24, 58]
    bottom = [7, 14, 30]
    shadow = [8, 12, 22]
    teal = [34, 176, 182]
    aqua = [102, 238, 228]
    gold = [250, 214, 92]
    amber = [255, 160, 78]
    ember = [255, 138, 74]
    rose = [242, 100, 156]
    violet = [168, 96, 255]
    pearl = [246, 248, 255]
    jade = [52, 206, 148]

    cx = (width - 1) / 2

    # Dark vertical chamber with a soft center lane and subtle moving texture.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.22 + 0.14 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.84))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.05)
            base = blend(base, teal, lane * 0.16)
            if 7 <= y <= 29:
                shimmer = 0.5 + 0.5 * math.sin((y * 0.57) + (x * 1.07))
                base = blend(base, [18, 60, 92], shimmer * 0.05)
            pixels[y][x] = base

    # Crown and halo.
    blend_ellipse(pixels, cx, 4.0, 2.0, 1.3, gold, 0.58, width, height)
    blend_ellipse(pixels, cx, 4.2, 0.85, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 4.1, 2.9, 0.34, aqua, width, height, y_min=1, y_max=8)
    draw_arc(pixels, cx, 3.9, 3.8, 0.28, violet, width, height, y_min=0, y_max=9)

    # Off-axis moonlet keeps the composition asymmetrical.
    blend_ellipse(pixels, width - 1.8, 8.0, 1.6, 1.6, pearl, 0.84, width, height)
    blend_ellipse(pixels, width - 1.3, 8.2, 0.8, 0.8, shadow, 1.0, width, height)
    draw_arc(pixels, width - 1.8, 8.0, 2.4, 0.34, rose, width, height, y_min=5, y_max=12)

    # Central beacon: a bright pillar with a tapered core and colored facets.
    blend_ellipse(pixels, cx, 18.5, 2.4, 8.8, teal, 0.42, width, height)
    blend_ellipse(pixels, cx, 18.1, 1.6, 7.4, gold, 0.76, width, height)
    blend_ellipse(pixels, cx, 17.0, 0.8, 5.5, pearl, 0.98, width, height)

    for y in range(10, 28):
        lift = max(0.0, 1.0 - abs(y - 18) / 9.5)
        if lift > 0:
            set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, ember, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)
        if y in (15, 19, 23):
            set_pixel(pixels, round(cx), y, jade, width, height)

    # Lattice wings with stepped highlights.
    left_steps = [(1 + i, 31 - 2 * i) for i in range(9)]
    right_steps = [(9 - i, 31 - 2 * i) for i in range(9)]
    step_colors = [ember, gold, aqua, teal, rose, violet, pearl, aqua, gold]
    for idx, (x, y) in enumerate(left_steps):
        color = step_colors[idx]
        set_pixel(pixels, x, y, color, width, height)
        if x + 1 < width:
            set_pixel(pixels, x + 1, y, color, width, height)
    for idx, (x, y) in enumerate(right_steps):
        color = step_colors[len(step_colors) - 1 - idx]
        set_pixel(pixels, x, y, color, width, height)
        if x - 1 >= 0:
            set_pixel(pixels, x - 1, y, color, width, height)

    # Ground bowl and lower glow.
    draw_arc(pixels, cx, 31.6, 4.2, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 32.0, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.7
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(amber, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.24 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.2 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.34)

    # Sparks on the edges keep the piece alive.
    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, ember), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, ember),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    return pixels


def design_storm_chime(width, height):
    pixels = blank(width, height)

    top = [3, 8, 20]
    mid = [12, 22, 54]
    bottom = [6, 14, 30]
    shadow = [8, 12, 22]
    teal = [30, 170, 176]
    aqua = [96, 236, 228]
    gold = [250, 214, 92]
    ember = [255, 150, 76]
    rose = [242, 100, 156]
    violet = [166, 98, 255]
    pearl = [246, 248, 255]
    jade = [52, 206, 148]

    cx = (width - 1) / 2

    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(top, bottom, t)
        row = blend(row, mid, 0.2 + 0.14 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, shadow, min(1.0, edge * 0.88))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.15)
            base = blend(base, teal, lane * 0.14)
            shimmer = 0.5 + 0.5 * math.sin((y * 0.72) + (x * 1.18))
            if 7 <= y <= 30:
                base = blend(base, [18, 66, 94], shimmer * 0.05)
            pixels[y][x] = base

    blend_ellipse(pixels, cx, 5.0, 2.0, 1.4, gold, 0.56, width, height)
    blend_ellipse(pixels, cx, 5.1, 0.85, 0.8, pearl, 1.0, width, height)
    draw_arc(pixels, cx, 5.0, 2.9, 0.34, aqua, width, height, y_min=1, y_max=9)
    draw_arc(pixels, cx, 4.8, 3.8, 0.28, violet, width, height, y_min=0, y_max=10)

    blend_ellipse(pixels, cx, 17.8, 2.2, 8.6, teal, 0.42, width, height)
    blend_ellipse(pixels, cx, 17.6, 1.5, 7.0, gold, 0.72, width, height)
    blend_ellipse(pixels, cx, 16.8, 0.78, 5.2, pearl, 0.98, width, height)

    for y in range(10, 27):
        lift = max(0.0, 1.0 - abs(y - 18) / 9.0)
        if lift > 0:
            set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, ember, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)
        if y in (15, 19, 23):
            set_pixel(pixels, round(cx), y, jade, width, height)

    for y in range(8, 29):
        lift = max(0.0, 1.0 - abs(y - 18) / 10.0)
        drift = math.sin(y * 0.55) * 0.25
        for x in range(width):
            dx = x - cx
            adx = abs(dx)
            if 1.0 < adx <= 3.0 + lift * 0.4:
                amt = lift * (1.0 - min(1.0, abs(adx - (2.8 + drift)) / 1.5)) * 0.2
                tint = aqua if dx < 0 else rose
                pixels[y][x] = blend(pixels[y][x], tint, amt)
            if adx < 0.95 + lift * 0.75:
                pixels[y][x] = blend(pixels[y][x], teal if dx < 0 else violet, lift * 0.1)

    draw_arc(pixels, cx, 31.1, 4.1, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.6, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.6
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(ember, shadow, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.22 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.2 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.34)

    spark_points = [
        (0, 2, pearl), (1, 4, aqua), (2, 11, gold), (8, 2, rose),
        (10, 4, pearl), (0, 15, ember), (9, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, ember),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    trail = [(1, 6), (2, 8), (3, 10), (4, 12), (5, 13), (6, 13), (7, 12)]
    for idx, (x, y) in enumerate(trail):
        tint = blend(aqua, gold, idx / max(1, len(trail) - 1))
        draw_circle_dots(pixels, x, y, 0.22, tint, width, height)

    return pixels


def design_tidal_transit(width, height):
    pixels = blank(width, height)

    deep = [5, 10, 24]
    night = [11, 24, 58]
    tide = [24, 58, 96]
    sea = [26, 120, 132]
    aqua = [35, 208, 216]
    mint = [133, 245, 234]
    gold = [249, 214, 95]
    amber = [255, 145, 72]
    rose = [244, 90, 150]
    violet = [169, 108, 255]
    pearl = [247, 248, 255]
    moss = [52, 177, 140]
    ink = [8, 15, 34]

    cx = (width - 1) / 2

    # Background: a dark tide field with a faint lane of light down the center.
    for y in range(height):
        t = y / max(1, height - 1)
        row = blend(deep, night, t)
        row = blend(row, tide, 0.35 + 0.25 * math.sin(t * math.pi))
        for x in range(width):
            edge = abs(x - cx) / max(1.0, cx)
            base = blend(row, ink, min(1.0, edge * 0.85))
            lane = max(0.0, 1.0 - abs(x - cx) / 2.2)
            base = blend(base, sea, lane * 0.13)
            if y > 24:
                depth = min(1.0, (y - 24) / 12.0)
                base = blend(base, [18, 28, 48], depth * 0.18)
            pixels[y][x] = base

    # Moon / signal in the upper right.
    blend_ellipse(pixels, width - 2.0, 5.0, 1.8, 1.8, gold, 0.7, width, height)
    blend_ellipse(pixels, width - 1.3, 5.2, 0.8, 0.8, night, 1.0, width, height)
    draw_arc(pixels, width - 2.0, 5.0, 2.6, 0.35, pearl, width, height, y_min=2, y_max=9)
    draw_arc(pixels, width - 2.0, 5.0, 3.4, 0.25, violet, width, height, y_min=1, y_max=10)

    # A small star field and a diagonal sparkle trail.
    spark_points = [
        (0, 2, pearl), (1, 6, aqua), (2, 10, gold), (8, 2, rose),
        (9, 5, mint), (0, 15, amber), (10, 14, violet), (2, 22, aqua),
        (8, 23, gold), (1, 31, rose), (9, 34, pearl), (4, 35, amber),
    ]
    for x, y, color in spark_points:
        draw_circle_dots(pixels, x, y, 0.33, color, width, height)

    trail = [(1, 6), (2, 8), (3, 10), (4, 12), (5, 13), (6, 13), (7, 12)]
    for idx, (x, y) in enumerate(trail):
        tint = blend(aqua, gold, idx / max(1, len(trail) - 1))
        draw_circle_dots(pixels, x, y, 0.22, tint, width, height)

    # Midsection: tidal ribbons passing behind the beacon.
    for y in range(7, 26):
        lift = max(0.0, 1.0 - abs(y - 16) / 10.0)
        left_span = 1.1 + lift * 2.5
        right_span = 1.0 + lift * 2.3
        for x in range(width):
            dx = x - cx
            adx = abs(dx)
            if 1.0 < adx <= left_span + 0.15:
                tint = aqua if dx < 0 else rose
                pixels[y][x] = blend(pixels[y][x], tint, lift * 0.22)
            if adx < 0.9 + right_span * 0.3 and lift > 0.35:
                tint = sea if dx < 0 else violet
                pixels[y][x] = blend(pixels[y][x], tint, lift * 0.12)

    # Central transit beacon: a lantern-like column with a bright core.
    blend_ellipse(pixels, cx, 18.2, 2.4, 8.6, sea, 0.45, width, height)
    blend_ellipse(pixels, cx, 18.0, 1.7, 7.2, gold, 0.74, width, height)
    blend_ellipse(pixels, cx, 17.2, 0.8, 5.2, pearl, 0.98, width, height)
    blend_ellipse(pixels, cx, 16.4, 0.45, 2.4, mint, 1.0, width, height)

    for y in range(10, 28):
        if y % 2 == 0:
            set_pixel(pixels, round(cx), y, pearl, width, height)
        if y in (12, 16, 20, 24):
            set_pixel(pixels, round(cx) - 1, y, gold, width, height)
            set_pixel(pixels, round(cx) + 1, y, amber, width, height)
        if y in (14, 22):
            set_pixel(pixels, round(cx) - 2, y, aqua, width, height)
            set_pixel(pixels, round(cx) + 2, y, rose, width, height)

    # Lower bowl and roots, pushing the light back into the water.
    draw_arc(pixels, cx, 30.5, 4.0, 0.5, violet, width, height, y_min=25, y_max=36)
    draw_arc(pixels, cx, 31.0, 3.0, 0.42, aqua, width, height, y_min=26, y_max=36)
    for y in range(28, height):
        depth = (y - 28) / max(1, height - 29)
        spread = 0.7 + depth * 2.5
        for x in range(width):
            dx = abs(x - cx)
            if abs(y - 31) < 4 and dx <= spread:
                tint = blend(amber, ink, min(1.0, depth * 0.85))
                pixels[y][x] = blend(pixels[y][x], tint, 0.24 + depth * 0.16)
            if y >= 33 and dx <= max(0.0, 2.3 - (y - 33) * 0.5):
                pixels[y][x] = blend(pixels[y][x], [18, 52, 72], 0.35)

    # Tiny train-light suggestion at the base to echo the calendar "Drive to Traintown".
    set_pixel(pixels, 3, height - 3, gold, width, height)
    set_pixel(pixels, 7, height - 3, gold, width, height)
    for x in range(4, 7):
        set_pixel(pixels, x, height - 4, moss, width, height)
    set_pixel(pixels, 5, height - 5, pearl, width, height)
    set_pixel(pixels, 4, height - 5, amber, width, height)
    set_pixel(pixels, 6, height - 5, amber, width, height)

    return pixels


DESIGNS = {
    "smiley": design_smiley,
    "rainbow": design_rainbow,
    "bullseye": design_bullseye,
    "checkerboard": design_checkerboard,
    "moonrift": design_moonrift,
    "self_exploration": design_self_exploration,
    "tide_rune": design_tide_rune,
    "still_seed": design_still_seed,
    "helix_signal": design_helix_signal,
    "lantern_mosaic": design_lantern_mosaic,
    "quiet_gate": design_quiet_gate,
    "liminal_beacon": design_liminal_beacon,
    "storm_chime": design_storm_chime,
    "tidal_transit": design_tidal_transit,
}


# ---------------------------------------------------------------------------
# Bitmap file loader
# ---------------------------------------------------------------------------

# Default single-char color palette
PALETTE = {
    ".": [0, 0, 0],   " ": [0, 0, 0],
    "R": [220, 0, 0], "r": [120, 0, 0],
    "G": [0, 200, 0], "g": [0, 100, 0],
    "B": [0, 80, 220],"b": [0, 40, 120],
    "Y": [220, 200, 0],"y": [140, 120, 0],
    "O": [220, 100, 0],"o": [160, 60, 0],
    "W": [200, 200, 200],
    "C": [0, 180, 200],"M": [180, 0, 180],
    "P": [120, 0, 200],"p": [70, 0, 130],
    "X": [200, 200, 200],  # generic "on"
}

def hex_to_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i+2], 16) for i in (0, 2, 4)]

def load_bitmap(path, width, height):
    """
    Load a text bitmap file. Format:

        # optional comments
        colors: A=#ff0000 B=#00ff00   <- optional custom color overrides
        <pixel rows, one char per pixel>

    Rows are top-to-bottom. Each character maps to a color via the palette.
    Rows shorter than width are padded with black. Extra rows are ignored.
    """
    palette = dict(PALETTE)
    rows = []

    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("#"):
                continue
            if line.lower().startswith("colors:"):
                for token in line[7:].split():
                    if "=" in token:
                        ch, hex_val = token.split("=", 1)
                        palette[ch] = hex_to_rgb(hex_val)
                continue
            rows.append(line)

    pixels = blank(width, height)
    for y, row in enumerate(rows[:height]):
        for x, ch in enumerate(list(row)[:width]):
            pixels[y][x] = list(palette.get(ch, [0, 0, 0]))
    return pixels


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <device_name> <design_or_file>")
        print(f"  design_or_file: a built-in design name ({', '.join(DESIGNS.keys())})")
        print(f"                  or a path to a .txt bitmap file")
        print(f"Designs: {', '.join(DESIGNS.keys())}")
        sys.exit(1)

    device_name = sys.argv[1]
    design_arg = sys.argv[2]

    config = load_config()
    device = resolve_device(device_name, config)
    base_url = device["url"]
    width, height = get_matrix_dims(device)
    led_count = device.get("ledCount", width * height)

    print(f"Device: {device_name} @ {base_url} ({width}×{height}, {led_count} LEDs)")

    bitmap_path = Path(design_arg)
    if bitmap_path.exists():
        print(f"Bitmap: {bitmap_path}")
        pixels = load_bitmap(bitmap_path, width, height)
    elif design_arg in DESIGNS:
        print(f"Design: {design_arg}")
        pixels = DESIGNS[design_arg](width, height)
    else:
        print(f"'{design_arg}' is not a known design or an existing file.")
        print(f"Built-in designs: {', '.join(DESIGNS.keys())}")
        sys.exit(1)

    brightness = round(255 * 0.10)  # 10% max brightness

    print("Clearing display...")
    clear_display(base_url, led_count, brightness)

    print("Sending frame...")
    count = send_frame(base_url, pixels, width, height, led_count, device)
    print(f"Done — {count} pixels painted.")


if __name__ == "__main__":
    main()
