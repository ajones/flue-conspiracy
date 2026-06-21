#!/usr/bin/env python3
"""
draw_weather_bar.py — Draw a temperature bar on a WLED strip.

OVERVIEW
    Visualizes an array of temperatures across a strip of LEDs.
    The strip represents a 14-hour window from 7am to 9pm:

        LED max (119)  =  7am  (start of day)
        LED 0          =  9pm  (end of day)

    Pass temperatures in chronological order (7am first, 9pm last).
    Any number of values is accepted — they are resampled to fill
    the full LED count automatically.

COLOR MAPPING
    Multi-stop RGB gradient, one color per temperature decade:

        <= 50°F  →  blue
           60°F  →  green
           70°F  →  yellow
           80°F  →  orange
        >= 90°F  →  red

USAGE
    python3 draw_weather_bar.py <device_name> <temp1> <temp2> ... <tempN>

    device_name   logical name from ~/.openclaw/workspace/.wled-config
    temp1..N      temperatures in °F, ordered 7am → 9pm

EXAMPLES
    # 13 hourly readings, 7am–7pm
    python3 draw_weather_bar.py weather-bar 62 65 70 74 78 81 83 84 83 80 75 70 65

    # Just two values (morning low, afternoon high) — strip lerps between them
    python3 draw_weather_bar.py weather-bar 58 85
"""

import datetime
import json
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_CONFIG = Path.home() / ".openclaw/workspace/.wled-config"

COLOR_STOPS = [
    (50,  [0,     0, 255]),  # blue
    (60,  [0,   255,   0]),  # green
    (70,  [255, 255,   0]),  # yellow
    (80,  [255, 120,   0]),  # orange
    (100, [128,   0, 128]),  # purple
]


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config(path=DEFAULT_CONFIG):
    with open(path) as f:
        return json.load(f)

def resolve_device(name, config):
    entry = config.get(name)
    if entry is None:
        raise ValueError(f"Device '{name}' not found. Available: {list(config.keys())}")
    if isinstance(entry, str):
        return {"url": entry, "ledCount": None}
    return entry


# ---------------------------------------------------------------------------
# Color math
# ---------------------------------------------------------------------------

def temp_to_color(temp_f):
    if temp_f <= COLOR_STOPS[0][0]:
        return list(COLOR_STOPS[0][1])
    if temp_f >= COLOR_STOPS[-1][0]:
        return list(COLOR_STOPS[-1][1])
    for i in range(len(COLOR_STOPS) - 1):
        t0, c0 = COLOR_STOPS[i]
        t1, c1 = COLOR_STOPS[i + 1]
        if t0 <= temp_f <= t1:
            t = (temp_f - t0) / (t1 - t0)
            return [round(c0[ch] + (c1[ch] - c0[ch]) * t) for ch in range(3)]


def interpolate_temps(temps, n):
    """Resample a list of temps to exactly n values using linear interpolation."""
    if len(temps) == 1:
        return [temps[0]] * n
    result = []
    for i in range(n):
        # position in original array
        pos = i * (len(temps) - 1) / (n - 1)
        lo = int(pos)
        hi = min(lo + 1, len(temps) - 1)
        frac = pos - lo
        result.append(temps[lo] + (temps[hi] - temps[lo]) * frac)
    return result


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

def clear_display(base_url, led_count, brightness):
    post(base_url, "/json/state", {"on": False})
    time.sleep(0.3)
    post(base_url, "/json/state", {
        "on": True,
        "bri": brightness,
        "seg": [{"id": 0, "start": 0, "stop": led_count, "fx": 0, "col": [[0, 0, 0]]}]
    })
    time.sleep(0.2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <device_name> <temp1> [temp2 ...]")
        print(f"  Temps are °F, ordered 7am → 9pm")
        sys.exit(1)

    device_name = sys.argv[1]
    temps = [float(v) for v in sys.argv[2:]]

    config = load_config()
    device = resolve_device(device_name, config)
    base_url = device["url"]
    led_count = device.get("ledCount") or 120

    print(f"Device : {device_name} @ {base_url} ({led_count} LEDs)")
    print(f"Temps  : {[round(t,1) for t in temps]} °F  ({len(temps)} points)")

    # Resample to one value per LED
    sampled = interpolate_temps(temps, led_count)

    # Build i-array. temps[0]=7am=LED(max), temps[-1]=7pm=LED(0).
    # sampled[0] -> LED (led_count-1), sampled[-1] -> LED 0
    i_array = []
    for idx, temp in enumerate(sampled):
        led_index = led_count - 1 - idx  # reverse: idx 0 -> highest LED
        color = temp_to_color(temp)
        i_array.append(led_index)
        i_array.append(color)

    brightness = device.get("defaultBrightness", round(255 * 0.20))

    print("Clearing display...")
    clear_display(base_url, led_count, brightness)

    # Current time marker — LED position within 7am–9pm window
    now = datetime.datetime.now()
    minutes_since_7am = (now.hour - 7) * 60 + now.minute
    window_minutes = 14 * 60  # 7am to 9pm
    time_t = max(0.0, min(1.0, minutes_since_7am / window_minutes))
    now_led = round((led_count - 1) * (1 - time_t))

    print("Sending temperature bar...")
    post(base_url, "/json/state", {
        "seg": [{"id": 0, "start": 0, "stop": led_count, "i": i_array}]
    })

    # Overlay current time marker after the frame so it always wins
    post(base_url, "/json/state", {
        "seg": [{"id": 0, "i": [now_led, [255, 255, 255]]}]
    })

    print(f"Done — {led_count} LEDs painted, time marker at LED {now_led} ({now.strftime('%I:%M %p')}).")
    print(f"  7am end: {round(temps[0],1)}°F → {temp_to_color(temps[0])}")
    print(f"  9pm end: {round(temps[-1],1)}°F → {temp_to_color(temps[-1])}")


if __name__ == "__main__":
    main()
