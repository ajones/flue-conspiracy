---
name: urbandict-word-of-the-day
description: Fetch the current top word from Urban Dictionary and return a one-line definition.
metadata:
---

# Urban Dictionary Word of the Day

Fetch the current top word from Urban Dictionary and return a short, formatted definition.

## Overview

- **Purpose** – Scrape the Urban Dictionary homepage for the top word entry and produce a single-line summary.
- **Data source** – `https://www.urbandictionary.com/`

## Usage

1. **Load the history file.** Read `.udwod` from your workspace if it exists. Each line is formatted as `YYYY-MM-DD <Word>`. Collect all previously used words into a set (case-insensitive comparison). If the file doesn't exist yet, treat the history as empty.

2. **Fetch the Urban Dictionary homepage** using the Playwright scraper skill:

   ```bash
   cd skills/playwright-scraper-skill && node scripts/playwright-simple.js "https://www.urbandictionary.com/"
   ```

   The script outputs a JSON blob with `title`, `url`, and `content` fields.

3. **Extract all word entries** from the `content` field. Each entry is structured like:

   ```
   <Word>
   Listen to pronunciation
   Share definition
   <Definition text...>
   ```

   Parse out every word and its definition (everything up until the next word entry).

4. **Pick the first word that hasn't been used before.** Walk the entries top-to-bottom and compare each word against the history set (case-insensitive). Use the first word not already in the history. If every word on the page has been used, use the top word anyway and note it's a repeat.

5. **Append to the history file.** Add a new line to `{workspace}/.udwod` (same workspace directory from step 1):

   ```
   YYYY-MM-DD <Word>
   ```

   Use today's date in `America/Los_Angeles` timezone. Create the file if it doesn't exist.

6. **Format the message** as:

   `UrbanDict Word of the Day — <Word>: <definition>`

   - Keep it to **one or two sentences** max by trimming overly long examples if needed.
   - Do **not** mention Urban Dictionary's URL, scraping, Playwright, or any system details.
   - Do **not** mention any group name, channel name, or delivery target in the text.

7. **Return only the final formatted line.** No extra commentary, metadata, or explanation.

## References

- Playwright scraper skill: `skills/playwright-scraper-skill`
- Urban Dictionary: `https://www.urbandictionary.com/`

## Guardrails

- Read-only — only fetch the page, never interact with forms or submit content.
- Output only the human-readable one-liner — no raw HTML, JSON, or debug output.
