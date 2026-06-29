---
name: wnr
description: Check Parkmead Walk N Roll SignUpGenius page and report open slots for the next event date.
metadata:
---

# WNR Signups

Check the Parkmead Walk N Roll SignUpGenius page, find the next upcoming event date, and produce a concise summary of who is signed up and which roles are still open.

## Overview

- **Purpose** – Scrape the Walk N Roll signup page and report slot availability for the next event.
- **Data source** – SignUpGenius page: `https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/`

## Usage

1. Use the Playwright scraper skill to load the dynamic content for the signup page.
   - Change directory to the skill: `skills/playwright-scraper`.
   - Run the simple Playwright script:
     - Command: `node scripts/playwright-simple.js "https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/"`
   - Before reading the schedule, scroll all the way to the bottom of the rendered signup page so the full table is loaded.
   - Capture the JSON output and parse the `content` field, which contains the rendered signup table as text.

2. From the parsed content:
   - Identify all listed dates (e.g., `02/04/2026`, `03/18/2026`, etc.).
   - Treat dates as mm/dd/yyyy.
   - Determine **today's date in America/Los_Angeles** timezone and select the **earliest signup date that is today or in the future**.

3. For that next upcoming date only:
   - Extract each row/slot for that date.
   - For each slot, capture:
     - Role/slot name (e.g., `Magnolia Lead Scanner`, `Newell Assistant Scanner`, or themed names like `St. Patty's - Magnolia Lead`).
     - Whether the slot is `Full` or still open (`Sign Up`, `0 of 1 slots filled`).
     - If full, the name of the person signed up.

4. Compose a concise summary message in this exact structure (no extra commentary):

   - First line: `Next Parkmead Walk N Roll date: <mm/dd/yyyy> (<weekday>)`
   - Follow with one bullet per slot for that date:

     - If the slot is full:
       `- <Role>: Full – <Name>`

     - If the slot is open:
       `- <Role>: OPEN (0 of 1 filled)`

   Example shape (values are illustrative):

   ```
   Next Parkmead Walk N Roll date: 03/18/2026 (Wednesday)
   - Magnolia Lead Scanner: OPEN (0 of 1 filled)
   - Newell Lead Scanner: Full – Tony Almeida
   - Magnolia Assistant Scanner: OPEN (0 of 1 filled)
   - Newell Assistant Scanner: OPEN (0 of 1 filled)
   ```

5. Output exactly that summary text as your final reply. Do not include any extra explanation, metadata, or JSON—just the human-readable message.

## References

- Playwright scraper skill: `skills/playwright-scraper`
- SignUpGenius page: `https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/`

## Guardrails

- Only read data from the signup page; never modify or interact with sign-up buttons.
- Output only the human-readable summary—no raw HTML, JSON, or debug output.
