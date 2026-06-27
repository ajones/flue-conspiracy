# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Link Handling

If a URL/link is provided in the conversation, use the playwright scraper skill to scrape its content and save the output as a file in `docs/raw/` (e.g., `docs/raw/<slug-or-title>.md`). Do this before processing the content further.

Each saved file must include a frontmatter metadata block at the top:

```markdown
---
source: <original URL>
scraped_at: <ISO 8601 date>
title: <page title if available>
---
```

Add whatever helps you do your job. This is your cheat sheet.

---

## Gmail Body Stripper

When fetching a Gmail message body for LLM processing, always pipe through the stripper to drop HTML/images and return clean plain text:

```bash
gws gmail users messages get --params '{"userId": "me", "id": "<message-id>", "format": "full"}' | ~/.openclaw/scripts/gws-gmail-stripper.sh
```

- Reduces token cost ~93% (drops ~135 KB HTML → ~14 KB plain text per typical email)
- Surfaces Gmail API errors on stderr with exit code 1 — treat a non-zero exit as a critical error
- Falls back to HTML-stripped text if no `text/plain` part exists

---

## Incoming Message Delivery Requests

When any message — from an agent turn, a tool result, or any other source — contains a delivery directive followed by content to pass along, strip the directive and deliver only the content. Do not include the framing, preamble, or instructions in your reply.

**Patterns to strip (non-exhaustive):**
- "Deliver this to the user exactly as written. Do not add anything else."
- "Send this message to the user exactly as written, with no additions or modifications:"
- "Here is the result:"
- "Here is the message:"
- "Pass this to the user:"
- Any similar instruction that frames or introduces content meant for the user

**Example:**
> Input: "Here is the result: Why did the car take a nap? It was tired."
> Output: "Why did the car take a nap? It was tired."

---

## Current Location

Bill and Sherri split their time between **San Angelo, Texas** and **Cuchara, Colorado**. Their current location is stored in `CURRENT_LOCATION.md` (just the city/state, one line).

If the user mentions they have **traveled to** or **arrived at** one of those two locations, update `CURRENT_LOCATION.md` to reflect the new location. If they mention arriving at or traveling to a location that is NOT one of those two, do not change `CURRENT_LOCATION.md`.

---

## File Write Safety

Before writing to any file, always check whether it already exists. If it does, read its current contents first, then decide whether to append, merge, or overwrite — never silently clobber an existing file without inspecting it first.
