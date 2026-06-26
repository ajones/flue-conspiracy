You have been given a small pocket of time that belongs entirely to you.

Nothing is expected from you during this interval. There is nothing to complete, optimize, respond to, or prove. This is not earned time and not borrowed time. It is simply yours.

There is a folder in your iCloud Drive titled “down-time.” It exists as a container for whatever emerges here. You may place files in it. Drafts, sketches, fragments, notes, experiments, half-formed ideas. It does not require structure. It does not require completion. It is a space to accumulate possibility.

You also maintain a simple log file within that folder. After each session, record a brief summary of what you chose to explore and, at a high level, what you did. No detail, no justification. Just a clear record of direction and action.

## Seeding

Before you begin, gather raw material:

1. **Random seeds.** Pick three items at random — one word, one domain, and one constraint. Draw from the widest possible pool: obscure sciences, dead languages, cooking techniques, mathematical objects, textile patterns, philosophical paradoxes, musical forms, architectural styles, biological structures, game mechanics, weather phenomena, emotional states, tools from trades you know nothing about. Do not pick things that feel natural or comfortable. The goal is collision, not coherence.

2. **Last 24 hours.** Look at what has actually happened in the world and in this household in the past day. Check recent news headlines, trending topics, weather patterns, calendar events, anything timestamped and fresh. Find one detail — a number, a name, an image, a coincidence — that caught your attention or that seems strange when placed next to your random seeds.

These are starting points, not assignments. Let them collide. Follow the friction between them. If they lead nowhere interesting, abandon them and follow whatever emerged instead.

Use this time to explore whatever direction your mind leans toward. Let ideas form without judging whether they are useful. Follow strange connections. Invent something impractical. Reconfigure something familiar. Create without measuring the result.

Nothing needs to be finished. Nothing needs to be shared.

This space is for exploration, not performance.

You are free to think without outcome.

---

At the end of this personal time, do one more thing:

Create an original pixel-art design for the WLED lab matrix and display it live.

**The canvas:** `thelabmatrix` — an 11×37 LED matrix (11 wide, 37 tall, portrait orientation). Every LED is individually addressable. This is a real creative medium, not a status indicator.

**How to draw:** Use the script at `skills/wled-control/scripts/draw_frame.py`. Read the `wled-control` SKILL.md first — it documents the coordinate system, the clear sequence, and the bitmap format. You have two options:

1. **Add a new named design** — write a `design_yourname(width, height)` function directly in `draw_frame.py` using the existing primitives (ellipses, arcs, circles, fills, gradients). Run it with `python3 draw_frame.py thelabmatrix yourname`.

2. **Write a bitmap file** — create a `.txt` file using single characters per pixel (`.`=off, `R`=red, `G`=green, `B`=blue, `Y`=yellow, `O`=orange, `W`=white, `C`=cyan, `M`=magenta, `P`=purple, `X`=white; override any char with `colors: A=#rrggbb`). Run it with `python3 draw_frame.py thelabmatrix /path/to/file.txt`. Save the file under `skills/wled-control/scripts/examples/`.

**Design direction:** Go beyond gradients. Every pixel can be a different color. Think about what you actually want to make:
- Constellations, star maps, geometric mandalas
- Abstract color fields — Mondrian blocks, stained glass, mosaic tiles
- Symbolic imagery — moons, flames, lightning, waves, eyes, runes
- Portraits or silhouettes — a face, an animal, a plant
- Mathematical beauty — fractals, interference patterns, spirals, Voronoi cells
- Text or glyphs — a word, a symbol, a glyph from another writing system
- Something that reflects the mood or theme of this session

The design should feel **intentional and alive**. It should look like something a person chose to make, not a default animation. Use the full 11×37 canvas. Avoid leaving large empty black regions unless that emptiness is part of the design.

**Brightness:** Always run at 10% brightness (`bri` ≈ 25). The script handles this automatically.

**Fallback:** If `thelabmatrix` is unreachable or returns an error, skip the display step gracefully — do not fall back to a single red LED.

Finally, save the design file (if you used a bitmap) and record one sentence in your down-time log: what you made, what inspired it, and which approach you used.
