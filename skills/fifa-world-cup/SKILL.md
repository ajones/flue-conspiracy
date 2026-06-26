---
name: fifa-world-cup
description: Fetch FIFA World Cup group standings and match results via the football-data.org API and write them to a `.world-cup-<YEAR>` file in the agent's workspace. Use when asked about World Cup standings, group tables, scores, or results, or when a cron job needs to refresh the standings file.
metadata:
---

# FIFA World Cup Skill

## Overview

Fetch FIFA World Cup group standings and results from the [football-data.org](https://www.football-data.org/) API (competition code `WC`) and maintain a standings file at `{workspace}/.world-cup-<YEAR>`.

**Environment variable required:** `FOOTBALL_DATA_TOKEN` — a free API key from https://www.football-data.org/client/register. Sent as the `X-Auth-Token` header on every request.

If `FOOTBALL_DATA_TOKEN` is not set, tell the user to register for a free key and add it to the environment — do not proceed without it.

**Rate limit:** the free tier allows ~10 requests/minute. Don't loop calls unnecessarily — fetch standings and matches each in a single call.

## Determining the workspace and year

- Workspace directory is provided to the agent at runtime.
- The standings file is `{workspace}/.world-cup-<YEAR>`, where `<YEAR>` is the year of the current/most recent World Cup tournament (e.g. `.world-cup-2026`).

## 1. Fetch group standings

```bash
curl -s -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/standings"
```

Returns a `standings` array, one entry per group, each with a `group` name (e.g. `GROUP_A`) and a `table` array of teams with `position`, `team.name`, `playedGames`, `won`, `draw`, `lost`, `points`, `goalsFor`, `goalsAgainst`, `goalDifference`.

## 2. Fetch recent and upcoming matches

```bash
curl -s -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/matches"
```

Each match has `utcDate`, `status` (`SCHEDULED`, `LIVE`, `IN_PLAY`, `PAUSED`, `FINISHED`), `stage`, `group`, `homeTeam.name`, `awayTeam.name`, and `score.fullTime.{home,away}`.

- Convert `utcDate` to Pacific time (America/Los_Angeles) before displaying:
  ```bash
  TZ=America/Los_Angeles date -jf '%Y-%m-%dT%H:%M:%S' "$(echo '<utcDate>' | sed 's/Z$//')" '+%Y-%m-%d %I:%M %p %Z'
  ```

## 3. Write the standings file

Write (overwrite) `{workspace}/.world-cup-<YEAR>` with a markdown summary:

```
# FIFA World Cup <YEAR> — Standings
Updated: <today's date, Pacific time>

## Group A
| Pos | Team | P | W | D | L | GF | GA | GD | Pts |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ... | ... |

## Group B
...

## Recent Results
- <Date>: <Home> <score> – <score> <Away> (Group X)

## Upcoming Matches
- <Date Pacific>: <Home> vs <Away> (Group X)
```

- Include all groups returned by the standings endpoint.
- "Recent Results" = matches with `status: FINISHED`, most recent first, limited to a reasonable number (e.g. last 10).
- "Upcoming Matches" = matches with `status: SCHEDULED`, soonest first, limited to a reasonable number (e.g. next 10).

## 4. Reporting changes (for cron use)

If a job needs to report what changed since the last update:
1. Read the existing `{workspace}/.world-cup-<YEAR>` (if present) **before** overwriting it.
2. Diff group tables and finished-match lists against the new data.
3. After writing the new file, summarize notable changes (e.g. new results, position changes, a team eliminated/advanced) for delivery.
4. If nothing changed since last run, say so plainly — don't fabricate changes.

## Guardrails

- Read-only against the API — never call write/POST endpoints (football-data.org is read-only anyway).
- Don't hardcode team lists or group assignments — always read them from the API response, since the 2026 tournament has 48 teams across 12 groups.
- Don't overwrite `.world-cup-<YEAR>` with partial data if a fetch fails — keep the existing file and report the error instead.
