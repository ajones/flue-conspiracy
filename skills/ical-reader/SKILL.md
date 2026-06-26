---
name: ical-reader
description: Safely register, sync, and query secret iCal feeds via Bun scripts.
metadata:
---

# ical-reader

## Overview

`ical-reader` is a local helper skill for working with **secret iCal URLs**. It provides Bun/TypeScript scripts to:

- Register calendars from private iCal URLs without ever re‑emitting the URL.
- Fetch and cache ICS feeds with conditional HTTP requests (ETag / Last‑Modified / content hash).
- Parse events into a SQLite database for **past** events and serve **future** events from the cached ICS.
- Answer JSON‑only queries with flexible date ranges and fuzzy text search.

All outputs are structured JSON suitable for piping into `jq` or higher‑level tools.

## Usage

### Files and Storage

- **Credentials registry**: `.ical.credentials` in your workspace
  - One line per calendar:
    - `URL|||calendar_name|||extra_details`
  - `URL` is secret and treated as write‑only.
  - `calendar_name` is the human‑friendly identifier (e.g. `Aaron Personal`, `Bun Calendar`).
  - `extra_details` is arbitrary metadata (JSON or free text), preserved but not interpreted.
- **SQLite DB**: `.ical-events.sqlite` in your workspace
  - Stores **past events** only (based on event end time).
  - See `IMPLEMENTATION.md` for full schema.
- **Cache directory**: `.ical-cache/` in your workspace
  - Raw ICS: `<url_hash>.ics`
  - Metadata: `<url_hash>.meta.json` (etag, lastModified, contentHash, lastSync, etc.).

> The skill never logs or returns raw iCal URLs; only URL hashes and calendar names are used after initial registration.

### Scripts

All commands are run from the `skills/ical-reader` directory:

```bash
cd skills/ical-reader
```

#### 1. Register a calendar – `ical-add`

```bash
bun run ical-add --url "<SECRET_ICAL_URL>" --name "Calendar Name" [--details "<extra details>"]
```

- **Required flags**:
  - `--url`: secret iCal URL (only used once; never printed back).
  - `--name`: unique calendar name (must not collide with an existing name in `.ical.credentials`).
- **Optional flags**:
  - `--details`: free‑form metadata string (often JSON).
- **Behavior**:
  - Fetches and validates the ICS:
    - If invalid or unreachable → returns `ok: false` and **does not** store the URL.
  - Ensures `--name` is unique; on conflict:
    - Returns `errorType: "duplicate_name"`.
  - On success:
    - Appends `URL|||name|||details` to `.ical.credentials`.
    - Upserts a `calendars` row keyed by `name` and `url_hash`.
    - Returns JSON similar to:

```json
{
  "ok": true,
  "calendar": {
    "name": "Calendar Name",
    "details": "..."
  }
}
```

#### 2. Sync calendars – `ical-sync`

```bash
bun run ical-sync [--calendar "Name"]...
```

- **Optional flags**:
  - `--calendar NAME` (repeatable): restricts sync to specific calendars. If omitted, syncs all calendars from `.ical.credentials`.
- **Behavior**:
  - For each calendar:
    - Uses cached ETag / Last‑Modified / contentHash to avoid unnecessary re‑parsing.
    - Fetches ICS when needed and parses events.
    - Partitions events:
      - **Past** (end < now) → upserted into `events` table.
      - **Future** (end ≥ now) → kept in memory and available via cached ICS for queries.
  - Returns a summary:

```json
{
  "ok": true,
  "calendars": [
    {
      "name": "Aaron Personal",
      "status": "ok",
      "pastEventsUpserted": 2746,
      "futureEventsCount": 11,
      "lastSync": "2026-02-27T00:35:17.390Z"
    }
  ],
  "errors": []
}
```

#### 3. Query events – `ical-query`

```bash
bun run ical-query [MODE FLAGS] [COMMON FLAGS]
```

**Modes** (mutually exclusive):

- `--range` – events in a date/time range.
- `--fuzzy-range` – range + fuzzy text query.
- `--next` – upcoming window (by days or named range).
- `--last` – most recent event matching a fuzzy query.

**Common flags**:

- `--from ISO` / `--to ISO`:
  - Used with `--range` / `--fuzzy-range`.
  - Accepts full timestamps or date‑only `YYYY-MM-DD` (treated as whole‑day ranges).
- `--next-days N`:
  - Used with `--next` to mean “from now to N days ahead”.
- `--time-range today|tomorrow|this_week`:
  - Alternative to `--next-days` (mutually exclusive).
- `--query TEXT`:
  - Free‑text fuzzy search across `summary`, `location`, and `description`.
- `--calendar NAME` (repeatable):
  - Restrict to one or more calendars by name; default is all calendars.
- `--limit N`:
  - Maximum number of events to return.
- `--all-day true|false`:
  - Filter all‑day vs timed events.
- `--sort start_asc|start_desc`:
  - Sort by start time (ascending default, or descending).
- `--tz-convert IANA_TZ`:
  - Reserved flag; current implementation preserves event times as stored (UTC ISO); conversion can be added later.

**Examples**:

- Next 7 days:

```bash
bun run ical-query --next --next-days 7 --limit 10
```

- Fuzzy range:

```bash
bun run ical-query --fuzzy-range --from 2026-02-01 --to 2026-02-29 --query "soccer practice"
```

- Last matching event:

```bash
bun run ical-query --last --query "parent teacher conference"
```

### Response Shape

All queries return JSON of this form:

```json
{
  "ok": true,
  "query": {
    "mode": "next",
    "calendars": ["Aaron Personal"],
    "from": "2026-02-26T00:00:00.000Z",
    "to": "2026-03-05T00:00:00.000Z",
    "nextDays": 7,
    "timeRange": null,
    "text": "soccer",
    "tzConvert": null
  },
  "calendar_info": [
    { "id": 1, "name": "Aaron Personal" },
    { "id": 2, "name": "Bun Calendar" }
  ],
  "events": [
    {
      "calendarId": 1,
      "uid": "abc123@google.com",
      "summary": "Soccer practice",
      "description": "Field 3",
      "location": "Parkmead",
      "start": "2026-02-27T00:00:00.000Z",
      "end": "2026-02-27T01:00:00.000Z",
      "allDay": false,
      "fuzzyScore": 0.87
    }
  ],
  "errors": []
}
```

- `calendar_info` lets consumers map `events[*].calendarId` back to human‑readable names.
- `errors` is an array of calendar‑scoped issues (e.g., fetch failures) when partial results are possible.

## References

- Implementation details: `skills/ical-reader/IMPLEMENTATION.md`
- Scripts:
  - `skills/ical-reader/src/scripts/ical-add.ts`
  - `skills/ical-reader/src/scripts/ical-sync.ts`
  - `skills/ical-reader/src/scripts/ical-query.ts`
- Libraries:
  - `skills/ical-reader/src/lib/credentials.ts` – `.ical.credentials` parsing and URL hashing
  - `skills/ical-reader/src/lib/http.ts` – ICS fetch + cache
  - `skills/ical-reader/src/lib/ics.ts` – minimal ICS parser
  - `skills/ical-reader/src/lib/db.ts` / `db-events.ts` – SQLite access
  - `skills/ical-reader/src/lib/fuzzy.ts` – local fuzzy scoring
  - `skills/ical-reader/src/lib/json.ts` – JSON helpers and error wrapper

## Guardrails

- **Secret URLs**:
  - Treat iCal URLs as **secrets**:
    - Do **not** log, echo, or return URLs once captured.
    - Only `ical-add` ever accepts the raw URL; all other scripts work via `calendar_name` and `url_hash`.
- **JSON‑only output**:
  - Scripts must only print structured JSON to stdout.
  - Avoid mixing human text with JSON; callers are expected to parse JSON.
- **Name uniqueness**:
  - Calendar names must be unique; on collision, `ical-add` returns `errorType: "duplicate_name"`.
- **Time handling**:
  - Event times are stored as ISO strings in **UTC** in the database (e.g. `2026-03-10T01:30:00.000Z`).
  - `ical-query` now supports `--tz-convert <IANA_TZ>` and will convert `start`/`end` to **local wall time** for that zone (returned as ISO-like strings without a trailing `Z`).
  - For Aaron’s default use, pass `--tz-convert America/Los_Angeles` so all times come out in PST/PDT.
  - Never treat already-converted `start`/`end` values as UTC and convert again; that will double-apply the offset and shift times.
  - Date‑only inputs (e.g., `2026-02-26`) are treated as full‑day ranges.
  - `--next` windows are computed from the current system time; long‑running processes should re‑query as needed.
- **Limits and performance**:
  - Use `--limit` for high‑volume calendars to avoid excessively large JSON responses.
  - Reuse `ical-sync` and cached ICS where possible instead of re‑fetching feeds.

