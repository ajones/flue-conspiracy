---
name: wled-control
description: Control WLED LED controllers over their HTTP/JSON API and presets. Use when the user wants to change colors, effects, brightness, power state, presets, or draw pixel art and custom designs on LED matrix devices, by name, using a local config file.
---

# WLED Control Skill

## Overview

Use this skill whenever you need to control one or more WLED devices over the network via their HTTP JSON API.
It assumes devices are referenced by *logical names* (e.g. `desk-strip`, `tv-backlight`) that are resolved to base URLs
using a local config file in the agent workspace.

Core capabilities this skill is meant to support:

- Turn a specific WLED device **on/off**
- Set **brightness**
- Set **solid colors** (RGB / RGBW) on the default segment or all segments
- Select an **effect** and **palette** by index or by name
- Apply a **preset** or playlist by ID
- Operate on **segments** (e.g. choose segment, color, effect per segment) when needed
- Query basic **state/info** for a device (for debugging or UI)
- **Address individual LEDs** on a matrix using the `i` field — draw pixel art, text, shapes, gradients, and arbitrary designs
- Perform **auto-discovery** of WLED devices on the local network when the config is missing or incomplete (best-effort)

All control is done via HTTP requests to the device’s `/json` and `/json/state` endpoints.

## Device Mapping Config (`.wled-config`)

The mapping file lives in the agent workspace and is the single source of truth for resolving
logical device names to their HTTP base URLs:

- Path: `~/.openclaw/workspace/.wled-config`
- Format: JSON object mapping **device name → config**.
- The config value can be either:
  - A **string** base URL (simple form), or
  - An **object** containing `url` and optional metadata (extended form).

Simple form example (URL only):

```json
{
  "desk-strip":  "http://192.168.1.50",
  "tv-backlight": "http://192.168.1.51",
  "kitchen":      "http://kitchen-wled.local"
}
```

Extended form example (URL + captured layout info):

```json
{
  "thelabmatrix": {
    "url": "http://thelabmatrix.local",
    "ledCount": 407,
    "matrix": { "w": 37, "h": 11 },
    "maxSegments": 32
  },
  "desk-strip": "http://192.168.1.50"
}
```

Rules:

- **No default device**: the caller must always specify which device to control.
- Keys are arbitrary strings (lowercase-with-hyphens recommended) but must be stable once used.
- When the value is a string, treat it as the base URL.
- When the value is an object, read `url` as the base URL and treat other fields as read-only metadata.
- The skill should **fail fast and clearly** if a requested device name is not in this map.

When receiving a user request:

1. Extract the intended device name from the request (e.g. "desk strip", "tv backlight").
2. Normalize it to the configured key (e.g. `desk strip` → `desk-strip`) using simple heuristics if needed.
3. Load `.wled-config` and look up the base URL.
4. If missing, either:
   - Ask the user to provide the IP/hostname, or
   - Offer to run auto-discovery and then update `.wled-config`.

## WLED JSON API Basics

All control goes through the JSON API:

- Base endpoint: `http://<device-base>/json`
- `GET /json` → returns an object with:
  - `state` – current state of the light (this is what you POST to change things)
  - `info` – device info (version, LED count, name, etc.)
  - `effects` – array of effect names
  - `palettes` – array of palette names
- You can also GET the parts individually:
  - `/json/state`, `/json/info`, `/json/eff`, `/json/pal`

### Setting State

To change anything, send a JSON body to `/json` or `/json/state` containing **only** the fields you want to modify
in the `state` object.

Common patterns:

- Power on/off:
  - `{ "on": true }` or `{ "on": false }`
- Set brightness (0–255):
  - `{ "bri": 128 }`
- Toggle power and return new state (v0.13+):
  - `{ "on": "t", "v": true }`
- Set first segment color to teal (RGB):
  - `{ "seg": [ { "col": [ [0, 255, 200] ] } ] }`
- Toggle segment X:
  - `{ "seg": [ { "id": X, "on": "t" } ] }`

Segment fields (per entry in `seg`):

- `start`, `stop`, `len` – LED index range
- `col` – up to 3 colors `[[r,g,b,w],[...],[...]]`
- `fx` – effect index
- `sx` – speed
- `ix` – intensity
- `pal` – palette index
- `sel` – selected
- `rev` – reversed
- `cln` – clone from other segment

The skill should **prefer minimal JSON**: only include properties that need to change, and avoid overwriting other state unnecessarily.

## Discovering Strip Dimensions (LED Count & Segments)

When you need to know how many LEDs a WLED device has, or how its segments are laid out, query either `/json/info` or `/json/state`:

1. **LED count and hardware info**
   - Perform `GET <base-url>/json/info`.
   - Inspect `info.leds`:
     - `info.leds.count` – total number of LEDs configured.
     - `info.leds.rgbw` – whether the strip is RGBW.
     - `info.leds.maxseg` – maximum allowed segments.
   - Example `info.leds` object:

```json
"leds": {
  "count": 150,
  "rgbw": true,
  "pin": [2],
  "pwr": 0,
  "maxpwr": 65000,
  "maxseg": 12
}
```

2. **Segment layout**
   - Perform `GET <base-url>/json/state` (or full `GET <base-url>/json`).
   - Inspect the `state.seg` array:
     - Each entry represents a segment with `start`, `stop`, and `len`.
     - Example:

```json
"seg": [
  {
    "id": 0,
    "start": 0,
    "stop": 50,
    "len": 50
  },
  {
    "id": 1,
    "start": 50,
    "stop": 100,
    "len": 50
  }
]
```

Use `info.leds.count` as the overall strip length and `state.seg` to understand how that length is split into segments. Prefer `info.leds.count` for global operations ("fill the entire strip"), and segment `start/stop` when targeting specific sections.

## Auto-Discovery of WLED Devices

Auto-discovery is best-effort and environment-dependent. Use it to *propose* entries for `.wled-config`,
not as a replacement for explicit mapping.

Recommended approaches (choose what is available in the environment):

1. **mDNS / Bonjour scan**
   - Discover hosts advertising typical WLED service or hostname patterns (e.g. `wled.local` or `wled-*.local`).
   - For each candidate host, probe `http://<host>/json/info` and verify that:
     - The response is JSON and contains `info.brand == "WLED"` (or similar identifying fields).
   - Propose a device name based on the hostname (e.g. `wled-tv` → `tv`, `wled-desk` → `desk-strip`).

2. **IP range scan (fallback)**
   - Only if explicitly requested by the user (since it can be slow and noisy).
   - Scan a constrained local CIDR (e.g. `192.168.1.0/24`) and probe `http://<ip>/json/info`.
   - Treat hosts that respond with WLED-like `info` objects as valid devices.

When auto-discovery finds devices:

1. For each candidate device, query layout metadata:
   - `GET <base-url>/json/info` and read:
     - `info.leds.count` → total LED count.
     - `info.leds.matrix.w` / `info.leds.matrix.h` (if present) → matrix width/height.
     - `info.leds.maxseg` → maximum segments.
   - Optionally, `GET <base-url>/json/state` to inspect `state.seg` for current segment layout.

2. Present the discovered devices to the user with:
   - Proposed logical name
   - Base URL
   - Captured layout info, e.g. "37×11 matrix, 407 LEDs, up to 32 segments".

3. After user confirmation, write entries into `.wled-config` using the **extended form**:

```json
{
  "thelabmatrix": {
    "url": "http://thelabmatrix.local",
    "ledCount": 407,
    "matrix": { "w": 37, "h": 11 },
    "maxSegments": 32
  }
}
```

4. Only update `.wled-config` after the user confirms the mapping and captured metadata.

## Common Operations & Examples

### 1. Turn a device on/off

**Example user intents**
- "Turn off the desk strip"
- "Turn on tv-backlight"

**Steps**
1. Resolve device name via `.wled-config` → base URL (e.g. `http://192.168.1.50`).
2. Build minimal JSON based on intent:
   - Power on: `{ "on": true }`
   - Power off: `{ "on": false }`
3. POST to `<base-url>/json/state` with `Content-Type: application/json`.

**cURL examples**

```bash
# Turn on "desk-strip"
curl -X POST "http://192.168.1.50/json/state" \
  -H "Content-Type: application/json" \
  -d '{"on":true}'

# Turn off "tv-backlight"
curl -X POST "http://192.168.1.51/json/state" \
  -H "Content-Type: application/json" \
  -d '{"on":false}'
```

### 2. Set a solid color (with optional brightness)

**Example user intents**
- "Set desk-strip to solid red"
- "Make tv-backlight a soft teal at 50% brightness"

**Interpretation**
- Map color name → RGB (e.g. `red` → `[255,0,0]`, `teal` → `[0,255,200]`).
- Convert human brightness percent → `bri` (0–255): `bri = round(255 * percent/100)`.
- Apply color to first (or selected) segment via `seg[0].col[0]`.

**Minimal JSON patterns**

- Solid color only (no brightness change):

```json
{ "seg": [ { "col": [ [R, G, B] ] } ] }
```

- Solid color + brightness:

```json
{ "bri": BRIGHTNESS, "seg": [ { "col": [ [R, G, B] ] } ] }
```

**Concrete JSON examples**

- "Set desk-strip to solid red":

```json
{ "seg": [ { "col": [ [255, 0, 0] ] } ] }
```

- "Make tv-backlight a soft teal at 50% brightness":

```json
{ "bri": 128, "seg": [ { "col": [ [0, 255, 200] ] } ] }
```

**cURL examples**

```bash
# Solid red on desk-strip
curl -X POST "http://192.168.1.50/json/state" \
  -H "Content-Type: application/json" \
  -d '{"seg":[{"col":[[255,0,0]]}]}'

# Soft teal at ~50% on tv-backlight
curl -X POST "http://192.168.1.51/json/state" \
  -H "Content-Type: application/json" \
  -d '{"bri":128,"seg":[{"col":[[0,255,200]]}]}'
```

### 2b. Static gradients with the Palette effect (no animation)

Sometimes you want a **non-moving gradient** (e.g. top→bottom) instead of a solid color or animated effect. WLED supports this via the **Palette** effect with speed set to 0.

Key points:
- The Palette effect index is device-dependent. Always discover it from `/json`:
  - `GET /json` → find the index where `effects[index] == "Palette"`.
  - On THELAB-MATRIX this was `fx:65`, not `fx:0`.
- `sx` controls **speed**; `0` disables animation.
- `ix` controls **scale/stretch** of the palette across the segment (lower = stretched, fewer repeats).
- `pal` selects which palette to use. Palette `3` ("Colors 1&2") makes WLED interpolate between `col[0]` and `col[1]`.

### Practical brightness limits (THELAB-MATRIX)

On `thelabmatrix` (37×11, 407 LEDs), perceptual testing showed:
- If the dark end of the gradient falls too close to black, the **bottom ~⅓ of the panel appears effectively off**.
- A good, usable range for a warm orange gradient was:
  - Bright end around `[180, 100, 0]` at `bri ≈ 180`.
  - Dark end around `[100, 50, 0]`.
- Below roughly `[100, 50, 0]` on that gradient, brightness changes were barely noticeable.

**Guideline for gradients on THELAB-MATRIX:**
- Avoid driving “display” gradients all the way to black.
- Target a **global brightness band** of roughly `bri ≈ 110–140` for normal use.
- When computing colors programmatically:
  - Treat the **dark end** as having per-channel values of at least ~50–60% of the bright end, instead of anything near 0.
  - For warm orange-ish gradients, a practical floor that looked good was:
    - Bright end ≈ `[180, 100, 0]`
    - Dark end ≈ `[100, 50, 0]`
    - With `bri` around 120
  - Clamp each non-zero channel so it never goes below ~100 (or the equivalent perceptual floor) when scaling designs to this band.
- When an agent designs a gradient for THELAB-MATRIX, it should **scale both the bright and dark colors into this band**, rather than choosing arbitrarily bright tops or near-black bottoms.
- This keeps the entire matrix visually active and avoids a dead-looking lower third while preventing the top from being uncomfortably bright.

**Example: static red→blue gradient on segment 0**

```json
{
  "seg": [
    {
      "id": 0,
      "fx": 65,        // Palette effect index from .effects
      "sx": 0,         // no animation
      "ix": 120,       // gradient stretched along the segment
      "pal": 3,        // "Colors 1&2" palette
      "col": [
        [255, 0, 0],    // start color (red)
        [0, 0, 255],    // end color (blue)
        [0, 0, 0]
      ]
    }
  ]
}
```

Notes:
- With `fx:0` (Solid), WLED will **ignore** the palette for gradients and just use `col[0]` → you get a solid fill.
- Always use the actual **Palette effect index** from your device (e.g. 65), not a hardcoded `0`.
- To aim the gradient along a specific physical axis (e.g. top→bottom on a matrix), the matrix mapping/orientation must be configured correctly in WLED; the JSON API can only control the 1D segment direction.

### 3. Apply a preset

Presets in WLED are saved states (including colors, effects, palettes, and sometimes playlists) that can be recalled by ID.
Use preset control when the user talks about a named or numbered scene that already exists on the device.

**Example user intents**
- "Apply preset 5 on desk-strip"
- "Set tv-backlight to the 'movie time' preset"

**Key state fields**

- `ps` – active preset ID (integer). Setting this recalls that preset.
- `ps` = `-1` – means "no preset" / custom live state.

**Minimal JSON pattern**

- Apply preset by numeric ID:

```json
{ "ps": PRESET_ID }
```

**Numeric preset example**

- "Apply preset 5 on desk-strip":

```json
{ "ps": 5 }
```

**cURL example**

```bash
# Apply preset 5 on desk-strip
curl -X POST "http://192.168.1.50/json/state" \
  -H "Content-Type: application/json" \
  -d '{"ps":5}'
```

**Named presets**

If the user refers to presets by name (e.g. "movie time"), the skill should:

1. Query the device for its presets list if accessible (via the appropriate WLED endpoint or config).
2. Map the human name to a preset ID using best-effort string matching (case-insensitive, ignore spaces/underscores).
3. If multiple candidates match, ask the user which one they meant.
4. Apply the resolved preset ID using `{"ps": <id>}`.

## Individual LED Addressing (Matrix Pixel Art & Custom Designs)

This is the most powerful capability for matrix devices. WLED's `i` field inside a segment lets you set every LED to an arbitrary color in a single POST.

### Critical: virtual vs physical coordinates

**The `i` field uses WLED's virtual coordinate space, not physical LED indices.**

When WLED has a 2D matrix configured, it remaps virtual positions to physical LEDs internally (handling serpentine wiring, orientation, etc.). The `i` field always addresses virtual positions using simple **row-major order**: `index = y * width + x`. Do NOT apply serpentine math yourself — WLED does it.

For `thelabmatrix` (w=11, h=37): the `i` field treats the display as 11 columns × 37 rows, top-left origin, left-to-right, top-to-bottom. Physical wiring is column-by-column serpentine, but that's invisible to the caller.

**Do NOT include `start`/`stop` in the same POST as the `i` field on a 2D matrix.** Sending `stop=ledCount` (e.g. 407) alongside `i` pushes WLED out of 2D matrix mode into 1D interpretation — virtual indices no longer map to the correct physical LEDs and the drawn frame appears entirely black with no error. Set the segment geometry once (during the clear), then send `i` in a separate payload that contains only `id` and `i`. The segment geometry persists between calls and does not need to be repeated.

### The `i` field format

Inside a `seg` object, `i` is a flat array alternating between **LED index** (integer) and **color** (`[R,G,B]`):

```json
{
  "seg": [{
    "i": [
      0,  [255, 0,   0],
      1,  [0,   255, 0],
      2,  [0,   0, 255]
    ]
  }]
}
```

- Indices not listed keep their current color.
- For a full-frame repaint, list all LED indices explicitly.
- **Do NOT use `{"seg":[{"col":[[0,0,0]]}]}` to clear** — it does not override per-LED colors set by `i`. See clearing instructions below.

### Clearing the display

The only reliable clear sequence:
```bash
# 1. Turn off
POST /json/state  {"on": false}
# wait 300ms
# 2. Turn on with solid black over the full segment, and explicitly unfreeze
POST /json/state  {"on": true, "seg": [{"id": 0, "start": 0, "stop": <ledCount>, "fx": 0, "col": [[0,0,0]], "frz": false}]}
```

**Always include `"frz": false` in the clear.** WLED's segment freeze flag (`frz`) can be set accidentally via the web UI or an API call. When `frz: true`, the device accepts POST requests without error but silently ignores all LED updates — the display stays frozen on whatever frame was last shown. Including `"frz": false` in every clear sequence prevents this from silently breaking future draws.

### Matrix coordinate → LED index

WLED lays out matrix LEDs in 1D order. The mapping depends on the wiring topology configured in WLED hardware settings. The two most common:

**Sequential (simple row-major):**
```
index = y * width + x
```

**Serpentine (alternating row direction — most common for LED matrices):**
```
if y is even:  index = y * width + x
if y is odd:   index = y * width + (width - 1 - x)
```

Always check `state.seg[0].mi` (mirror/serpentine flag) or just test empirically: light up index 0, 1, 2 and observe which physical LEDs respond.

**THELAB-MATRIX specifics (37×11, serpentine):**
- `width = 37`, `height = 11`
- Origin `(0,0)` is top-left
- Even rows (0, 2, 4…) go left→right; odd rows go right→left
- `index(x, y) = y*37 + (x if y%2==0 else 36-x)`

### Building a full frame

When drawing a full design, generate the frame as a pixel grid first, then serialize to the `i` array:

**Python-style pseudocode for a full-frame paint:**

```python
width, height = 37, 11

def xy_to_index(x, y):
    if y % 2 == 0:
        return y * width + x
    else:
        return y * width + (width - 1 - x)

# Build your pixel grid: pixels[y][x] = [R, G, B]
pixels = [[[0,0,0]] * width for _ in range(height)]

# ... fill in pixels ...

# Serialize to WLED i-array
i_array = []
for y in range(height):
    for x in range(width):
        color = pixels[y][x]
        if color != [0, 0, 0]:  # skip black to reduce payload size
            i_array.append(xy_to_index(x, y))
            i_array.append(color)

payload = {"seg": [{"i": i_array}]}
```

Omitting black pixels keeps the JSON payload smaller — but only if you pre-cleared the display to black first.

### Payload size & limits

WLED's HTTP JSON API accepts payloads up to ~8 KB by default. For a 37×11 matrix:
- Worst case (all 407 LEDs listed): ~407 × ~14 bytes ≈ ~5.7 KB — fits fine.
- Typical designs with sparse pixels are much smaller.
- If you hit limits, split into multiple POSTs targeting different segment ranges.

For very high-frequency animation (>5 fps), prefer UDP protocols (DDP, E1.31/sACN, Warls) — but for one-shot designs and slow animation, the JSON API is sufficient.

### Design primitives

Use these building blocks to compose complex designs:

**Fill all:**
```python
for y in range(height):
    for x in range(width):
        pixels[y][x] = color
```

**Horizontal line at row `r`:**
```python
for x in range(width):
    pixels[r][x] = color
```

**Vertical line at column `c`:**
```python
for y in range(height):
    pixels[y][c] = color
```

**Rectangle (outline):**
```python
for x in range(x0, x1+1):
    pixels[y0][x] = color
    pixels[y1][x] = color
for y in range(y0, y1+1):
    pixels[y][x0] = color
    pixels[y][x1] = color
```

**Filled rectangle:**
```python
for y in range(y0, y1+1):
    for x in range(x0, x1+1):
        pixels[y][x] = color
```

**Circle (Bresenham):**
```python
def draw_circle(cx, cy, r, color, filled=False):
    for y in range(height):
        for x in range(width):
            dist = ((x-cx)**2 + (y-cy)**2) ** 0.5
            if filled and dist <= r:
                pixels[y][x] = color
            elif not filled and abs(dist - r) < 0.7:
                pixels[y][x] = color
```

**Diagonal gradient (color shifts with x+y):**
```python
for y in range(height):
    for x in range(width):
        t = (x + y) / (width + height - 2)
        pixels[y][x] = blend(color_a, color_b, t)
```

**Checkerboard:**
```python
for y in range(height):
    for x in range(width):
        pixels[y][x] = color_a if (x + y) % 2 == 0 else color_b
```

**5×7 bitmap text (pixel font)**

For short messages, encode characters as 5-wide × 7-tall bitmaps and stamp them at x offsets. Each character occupies 5 columns + 1 column gap. THELAB-MATRIX (37 wide, 11 tall) fits ~6 characters centered vertically with 2 rows of margin.

Example: define a minimal font dict mapping characters to 5×7 bit arrays, then:
```python
def draw_char(char, x_offset, y_offset, color):
    bitmap = FONT[char]  # 7 rows × 5 cols, 1 = lit
    for row_idx, row in enumerate(bitmap):
        for col_idx, bit in enumerate(row):
            if bit:
                px = x_offset + col_idx
                py = y_offset + row_idx
                if 0 <= px < width and 0 <= py < height:
                    pixels[py][px] = color
```

### Example designs for THELAB-MATRIX (37×11)

**Diagonal rainbow stripe:**
```python
RAINBOW = [
    [255,0,0],[255,127,0],[255,255,0],
    [0,255,0],[0,0,255],[75,0,130],[148,0,211]
]
for y in range(11):
    for x in range(37):
        pixels[y][x] = RAINBOW[(x + y) % len(RAINBOW)]
```

**Bullseye (concentric rings):**
```python
cx, cy = 18, 5
ring_colors = [[255,0,0],[255,165,0],[255,255,0],[0,200,0],[0,100,255]]
for y in range(11):
    for x in range(37):
        dist = round(((x-cx)**2 + (y-cy)**2)**0.5)
        pixels[y][x] = ring_colors[dist % len(ring_colors)]
```

**VU meter bars (e.g. 4 channels):**
```python
bar_heights = [8, 5, 9, 3]  # 0–11 for each column group
bar_width = 8
for ch, h in enumerate(bar_heights):
    for y in range(11):
        for x in range(ch*bar_width+1, (ch+1)*bar_width):
            lit = (11 - y) <= h
            pixels[y][x] = [0,220,0] if lit and h < 8 else [255,50,0] if lit else [10,10,10]
```

### Workflow for matrix designs

1. **Check device config** — read `.wled-config` to get `width`, `height`, `serpentine` for the target device.
2. **Confirm serpentine wiring** — if unknown, light up indices 0–3 and observe physical positions.
3. **Clear the display** — POST `{"seg":[{"fx":0,"col":[[0,0,0]]}]}` to set all LEDs black.
4. **Build the pixel grid** — compute each pixel's `[R,G,B]` using the design logic.
5. **Serialize to `i` array** — convert `(x,y)` → index, skip black pixels if pre-cleared.
6. **POST to `/json/state`** — send `{"seg":[{"i": [...]}]}`.
7. **Summarize** — describe what was drawn in human terms.

### Storing serpentine/wiring info in `.wled-config`

Extend the device entry to capture wiring topology so future calls don't need to re-query:

```json
{
  "thelabmatrix": {
    "url": "http://thelabmatrix.local",
    "ledCount": 407,
    "matrix": { "w": 37, "h": 11 },
    "maxSegments": 32,
    "serpentine": true,
    "origin": "top-left"
  }
}
```

## High-Level Workflow for This Skill

When the user asks to control WLED, follow this general flow:

1. **Parse intent**
   - Identify the target device name (required).
   - Identify the desired operation: power, brightness, color, effect, palette, preset, segment changes, pixel art / matrix design, or query.

2. **Resolve device**
   - Load `.wled-config` and resolve the device name → base URL.
   - If not found, ask the user for the URL or offer auto-discovery.

3. **Map intent to JSON**
   - Construct the minimal JSON body that represents the requested change using the WLED `state` schema.
   - For human-friendly color names, convert to RGB values before building the JSON.
   - For effects/palettes by name, map to indices using `GET /json` (or `/json/eff` / `/json/pal`).

4. **Send HTTP request**
   - POST JSON to `<base-url>/json/state` (or `/json` when needed).
   - Handle and surface any HTTP or JSON errors clearly (e.g. device offline, bad JSON).

5. **Confirm / summarize**
   - Optionally fetch updated state via `GET /json/state` for verification.
   - Summarize what changed in human terms (e.g. "Set `desk-strip` to solid teal at 70% brightness").

## Scripts

### `scripts/draw_frame.py`

Sends a full pixel frame to a WLED matrix device. Accepts built-in design names or `.txt` bitmap files.

### `scripts/draw_weather_bar.py`

Draws a temperature bar across the `weather-bar` strip to visualize a day's temperatures.

**When to use:** any time the user asks to display weather, temperature, or forecast data on the `weather-bar` device.

**LED layout**

The strip maps a 12-hour window from 7am to 7pm:

```
LED 119  =  7am  (start of day, left/top physical end)
LED 0    =  7pm  (end of day,   right/bottom physical end)
```

**Input**

Pass temperatures in °F in chronological order (7am first, 7pm last). Any number of values is accepted — they are automatically resampled to fill all 120 LEDs. The minimum useful input is two values (morning low, afternoon high).

**Color mapping**

Pure red/blue mix — green channel is always 0. Cold = blue, hot = red, middle = purple:

| Temp (°F) | Color  |
|-----------|--------|
| ≤ 50      | Blue   |
| 70        | Purple |
| ≥ 90      | Red    |

**Invocation**

```bash
# 13 hourly readings, 7am–7pm
python3 scripts/draw_weather_bar.py weather-bar 62 65 70 74 78 81 83 84 83 80 75 70 65

# Two values only (morning low → afternoon high)
python3 scripts/draw_weather_bar.py weather-bar 58 85
```

**What it does internally**

1. Loads `weather-bar` from `.wled-config` to get the base URL and LED count.
2. Resamples the input temps array to `ledCount` values via linear interpolation.
3. Maps each value to a color via HSV hue lerp (blue→red).
4. Clears the strip, then sends a single POST with the full `i`-array to `/json/state`.
5. Brightness is set to 40% (`bri ≈ 102`) during the clear — adjust in the script if needed.

This SKILL.md is the procedural guide; scripts or helpers for discovery and HTTP calls can be added later under
`scripts/` if needed.
