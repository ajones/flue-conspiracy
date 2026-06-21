---
name: dad-jokes
description: >
  Find, generate, and manage dad jokes for outbound messages. Use when you need
  to scour the internet for a fresh dad joke, log which jokes have already been
  used in the cron prompt file, and avoid re-using the same joke in future runs.
---

# Dad Joke Skill

This skill helps an agent:
- Discover a new dad joke (preferably by searching the web).
- Keep a running log of previously used jokes inside a prompt/log file.
- Avoid re-sending the same joke.
- Produce a single short dad joke line suitable for pushing into a chat or notification.

## When to Use This Skill

Trigger this skill when:
- A cron job or agent needs to send a daily/periodic dad joke.
- You are asked to "scour the internet" or "find a great dad joke" that is new.
- You must track which jokes have already been used to avoid repeats.

## Core Workflow

When this skill is in play (for a cron or manual run), follow this workflow:

1. **Locate the dad joke log file**
   - Use this canonical path for the log:
     - `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/dad-joke-log.md`
   - This file lives in the shared RavenClaw-Collab iCloud folder and is an append-only history of jokes.
   - If the file does not exist yet, create it with a brief header:
     - `# Dad Joke Log` on the first line.

2. **Load prior jokes**
   - Read `dad-joke-log.md` and parse out prior jokes.
   - Store all prior joke text lines in memory (case-insensitive compare).
   - Treat any line starting with `- ` after the header as a logged joke, in the form:
     - `- YYYY-MM-DD: <joke text>`

3. **Search for a new dad joke**
   - Use `web_search` (Brave Search) with queries like:
     - `best dad joke`
     - `funny dad joke one-liner`
     - `short dad joke pun`
   - Prefer sites that list short, self-contained jokes (setup + punchline in 1–3 lines).
   - Extract candidate jokes from search results.

4. **Filter against history**
   - For each candidate joke, normalize the text (lowercase, strip whitespace and punctuation).
   - Compare against the normalized forms of jokes already logged in `dad-joke-log.md`.
   - Skip any joke that appears to be a repeat (exact or near-exact match).
   - Select the first joke that is clearly **new**.

5. **Format the final joke**
   - Keep it short and self-contained, ideally 1–2 short sentences or line breaks.
   - Avoid offensive or NSFW content entirely; stay family-friendly.
   - Do **not** mention where you found it or that it is being logged.
   - Example formats:
     - `Why don't eggs tell jokes? They'd crack each other up.`
     - `I used to play piano by ear, but now I use my hands.`

6. **Append to the dad joke log**
   - Open `dad-joke-log.md` and append a new line at the end in this format:
     - `- YYYY-MM-DD: <final joke text>`
   - Use the system's local date (e.g., America/Los_Angeles) for `YYYY-MM-DD`.
   - Do not rewrite or reformat existing entries.

7. **Return the joke for delivery**
   - The agent should return **only** the final dad joke text for delivery in the current channel.
   - Do not include the date, log filename, or any meta information in the outward-facing message.

## Implementation Notes

- **Search tools**: Always use `web_search` (Brave) first; fall back to a small internal list only if the web is unavailable.
- **Logging location**: The log now lives in the shared RavenClaw-Collab iCloud folder so both humans and agents can inspect the history easily.
- **Safety**: If all candidate jokes are low-quality or borderline, discard them and try another query. When in doubt, choose something gentler and simpler.
- **Idempotence**: If you somehow cannot reach the web or the log file, it is acceptable to pick a joke from scratch and skip logging for that run, but you should note this in the run summary.

Use this skill as the procedural guide whenever a "dad joke" automation or cron job needs to fetch and deduplicate jokes over time.