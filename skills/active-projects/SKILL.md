---
name: active-projects
description: Read, update, and review Aaron's active projects list. Use when surfacing in-progress or on-deck work, suggesting next tasks, updating item statuses, or recreating the cron jobs that drive the daily check-in.
metadata:
  openclaw:
    emoji: "📋"
    requires: { bins: [] }
    install: []
---

# Active Projects

A lightweight personal project tracker for Aaron. The canonical file is a flat Markdown list of items with status tags. Two cron jobs read it daily and poke Aaron with a summary and a question.

## Source of Truth

```
~/.openclaw/workspace/ACTIVE_PROJECTS.md
```

The file contains an **Agent Instructions** section at the top that defines the review and suggestion behavior. Always read that section first — it is the authoritative spec for how any agent should interact with this file.

## Status Values

| Tag | Meaning |
|-----|---------|
| `[in progress]` | Actively being worked on. `[started]` is a synonym. |
| `[on deck]` | Queued and ready to start soon. |
| `[not started]` | In the backlog; no action yet. |
| `[done]` | Complete. Keep for history — do not delete. |

## Check-after / Follow-up Timing

When Aaron replies to a check-in from `active-project-daily-checkin`, the reply handler must set a `check_after: YYYY-MM-DD` property on that project (directly below its status line, before `- Updates:`). The date is inferred from his reply:

- Specific date/event mentioned → convert to that date
- Vague "still working on it" → tomorrow (next day)
- Implied next step with timeline → day after that step would complete
- Project done or dropped → no `check_after` needed (remove the line if present)
- **Floor:** never set `check_after` to today or earlier — minimum is tomorrow regardless of what was inferred

`daily-projects-check` also sets `check_after` on reply:
- Any on-deck item Aaron moves to in-progress → `check_after: tomorrow`
- Any suggested item Aaron picks up → `check_after: tomorrow`
- Same floor applies: never today or earlier

If a `check_after` line already exists, replace it. The `active-project-daily-checkin` job skips any project whose `check_after` date is still in the future, so this is the primary mechanism preventing same-day re-asks.

## Agent Behavior

Defined in the **Agent Instructions** section of `ACTIVE_PROJECTS.md`. Summary:

1. **Active items exist** — present in-progress and on-deck groups, then ask whether any on-deck items are ready to move to in progress.
2. **Both groups are empty** — pull `[not started]` items and recent `[done]` items for follow-ons, group similar items (e.g. GitHub repos / tech tools → "try a new tech tool"), and offer 3–5 casual suggestions.
3. **On reply** — update statuses in the file and append a dated update line to any item that changes.

Always defer to the instructions in the file itself; do not re-implement the logic from memory.

## Cron Jobs

### `daily-projects-check` — Daily 10am PT

- **Job ID:** `7741138e-69c7-422b-a07a-6f0266b5a5d6`
- **Schedule:** `0 10 * * *` America/Los_Angeles
- **Prompt:** `~/.openclaw/cron/cron-prompts/daily-projects-check.md`
- **What it does:** Reads `ACTIVE_PROJECTS.md`, follows the Agent Instructions, sends Aaron a summary + question via aaron+direct (BlueBubbles), and logs a pending reply entry in `workspace/PENDING_AGENT_REQUESTS.md`.

### `haircut-reminder` — Every 3 Weeks ~12:37pm PT

- **Job ID:** `b4497281-144c-4ee8-b043-0ad025d77f40`
- **Schedule:** `every` 21 days, anchored to 2026-05-27T12:37 PDT
- **Prompt:** `~/.openclaw/cron/cron-prompts/haircut-reminder.md`
- **What it does:** Checks `ACTIVE_PROJECTS.md` for an existing `[in progress]` or `[on deck]` hair cut entry; if absent, adds one under `## On Deck`. Then sends Aaron a short casual reminder via aaron+direct.

## Recreating the Jobs

If either job needs to be rebuilt, use the `cron-creator` skill and follow its wizard. Key parameters to restore:

### daily-projects-check

```bash
openclaw cron add \
  --agent main \
  --name daily-projects-check \
  --session isolated \
  --cron "0 10 * * *" \
  --tz "America/Los_Angeles" \
  --message 'Run `markupdown ~/.openclaw/cron/cron-prompts/daily-projects-check.md` and follow the instructions in the output step by step. Do not rely on prior context; treat that output as the source of truth for this run.' \
  --no-deliver
```

### haircut-reminder

```bash
openclaw cron add \
  --agent main \
  --name haircut-reminder \
  --session isolated \
  --every 21d \
  --message 'Run `markupdown ~/.openclaw/cron/cron-prompts/haircut-reminder.md` and follow the instructions in the output step by step. Do not rely on prior context; treat that output as the source of truth for this run.' \
  --no-deliver
```

> **Note:** The `every` schedule anchors to creation time. If the haircut reminder needs to fire at a specific time of day, run the add command at that time.

## Cron Prompt Files

| Prompt | Purpose |
|--------|---------|
| `~/.openclaw/cron/cron-prompts/daily-projects-check.md` | Daily review — delegates all logic to the Agent Instructions in `ACTIVE_PROJECTS.md` |
| `~/.openclaw/cron/cron-prompts/haircut-reminder.md` | Haircut nudge — adds a project entry and pings Aaron |

## Update Rules

- Always append a dated update line (`- YYYY-MM-DD: ...`) to any item whose status or state changes.
- Never delete `[done]` items — they serve as history.
- New items go under `## On Deck` with a `[not started]` or `[in progress]` tag and a dated update line explaining why they were added.
- Do not reorder or reformat existing items unless explicitly asked.

## Guardrails

- Never remove or replace the **Agent Instructions** section at the top of `ACTIVE_PROJECTS.md`.
- Do not auto-move items to `[done]` unless Aaron explicitly says so.
- Do not send unsolicited project updates outside of the defined cron jobs.
- Pending reply tracking lives in `~/.openclaw/workspace/PENDING_AGENT_REQUESTS.md` — always clean up completed request blocks after processing a reply.
