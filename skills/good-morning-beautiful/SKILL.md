---
name: good-morning-beautiful
description: >-
  Generate ultra-short, playful good-morning messages in a "good morning, beautiful" vibe.
  Use when the user wants a single very short (10–15 word) morning line that
  is sassy, classy, funny, nerdy, or romantic, optionally themed with
  light movie/TV/book references. Responses must stay brief, upbeat, and
  safe for partner/family contexts by default.
---

# good-morning-beautiful Skill

Generate tiny, high-variance "good morning" one-liners.

This skill is for producing **one ultra-short good-morning or morning-adjacent affirmation**:
- 10–15 words
- Single sentence (no multi-line speeches)
- Playful (sassy / classy / funny / nerdy / romantic)
- Centered on emotionally-supportive, often sarcastically-uplifting reassurance rather than productivity or optimization
- Partner/family-safe by default

## Implementation

### Node

The prompt template lives in `good-morning-beautiful-prompt.js` in this skill directory.

From this directory you can run:

```bash
./good-morning-beautiful-prompt.js
./good-morning-beautiful-prompt.js "sassy, nerdy, for my wife"
```

The script writes a complete instruction prompt to **stdout**. Pass it to the model of your choice.

## Expected Model Behavior (for reference)

When invoked with the prompt from `good-morning-beautiful-prompt.js`, the
model should:

1. **Parse tone + context**
   - Tone hints: `sassy`, `classy`, `funny`, `nerdy`, `romantic`, `wholesome`, `snarky`.
   - Context hints: `partner`, `spouse`, `wife`, `husband`, `boyfriend`, `girlfriend`, `kid(s)`, `friend`.
   - If not given, assume: romantic partner, playful but not explicit.

2. **Generate one greeting**
   - It must:
     - Be **exactly one sentence**.
     - Be **10–15 words**.
     - Stand alone as a text message you could send as-is.

3. **Tone and safety rules**
   - **Default:** affirming and optionally flirtatious but PG-13; no explicit sexual content, no kink, no graphic imagery.
   - Emphasize **sarcastically uplifting, emotionally-supportive reassurance** over "crush the day", hustle, or productivity framing.
   - Avoid explicit phrases like "you are enough" or "you are doing enough"; let the support be implied.
   - You do **not** need to say "good morning", "beautiful", or "love" every time.
   - Do **not** use death, survival, or mortality metaphors.
   - If the user indicates **kid-safe** ("for my kids", "for the boys", etc.):
     - Remove romance/innuendo.
     - Focus on encouragement, silliness, or cozy family vibes.
   - If the user asks for **spicier** tone, you may be a bit cheekier but still avoid explicit content.

4. **Pop-culture / quote usage**
   - You may lightly reference movies/TV/books/games.
   - Keep the greeting within the 10–15 word limit.
   - Never overstuff with multiple references in one line.

5. **Output format**
   - Respond with **only that single greeting** — one line, no numbering or bullet markers.
   - No explanations, no meta-comments, no labels.

This keeps the behavior spec visible in the skill file while the concrete prompt lives alongside it in `good-morning-beautiful-prompt.js`.
