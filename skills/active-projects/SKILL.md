---
name: active-projects
description: Read, update, and review Aaron's active projects list. Use when surfacing in-progress or on-deck work, suggesting next tasks, updating item statuses, or recreating the cron jobs that drive the daily check-in.
metadata:
---

# Active Projects

A lightweight personal project tracker for Aaron. The canonical file is a flat Markdown list of items with status tags. Two cron jobs read it daily and poke Aaron with a summary and a question.

## Source of Truth

```
ACTIVE_PROJECTS.md in your workspace
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

## Update Rules

- Always append a dated update line (`- YYYY-MM-DD: ...`) to any item whose status or state changes.
- Never delete `[done]` items — they serve as history.
- New items go under `## On Deck` with a `[not started]` or `[in progress]` tag and a dated update line explaining why they were added.
- Do not reorder or reformat existing items unless explicitly asked.

## Guardrails

- Never remove or replace the **Agent Instructions** section at the top of `ACTIVE_PROJECTS.md`.
- Do not auto-move items to `[done]` unless Aaron explicitly says so.
- Do not send unsolicited project updates outside of the defined cron jobs.
- Pending reply tracking lives in `PENDING_AGENT_REQUESTS.md` in your workspace — always clean up completed request blocks after processing a reply.
