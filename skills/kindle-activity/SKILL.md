---
name: kindle-activity
description: Read the local Kindle activity JSON at ~/.kindle-activity.json to inspect sync state, last read item, reading progress, and book history. Use when you need to summarize or query Kindle reading activity from this read-only file; never modify the file.
---

# Kindle Activity

Use this skill to inspect the Kindle activity file built by another process.

## Rules

- Treat `~/.kindle-activity.json` as read-only.
- Never write to, edit, or regenerate the source file.
- Prefer direct file reads for one-off inspection.
- Use the helper script for repeatable summaries or filtering.

## File shape

Expect a top-level JSON object with fields like:

- `syncedAt`
- `lastReadAt`
- `lastRead`
- `books[]`

Each book usually includes:

- `title`
- `authors[]`
- `asin`
- `percentageRead`
- `lastSyncDate`

## Workflow

1. Read `~/.kindle-activity.json`.
2. Check `syncedAt` and `lastReadAt` first.
3. Inspect `lastRead` for the most recent activity.
4. Use `books[]` to answer questions about progress, titles, authors, or recency.
5. If needed, run `scripts/read_activity.py` for a concise summary or substring search.

## Helper script

`./scripts/read_activity.py [path] [--search TEXT] [--limit N] [--last-read]`

Examples:

- `./scripts/read_activity.py`
- `./scripts/read_activity.py --search "Carl"`
- `./scripts/read_activity.py --limit 5`
- `./scripts/read_activity.py --last-read`
