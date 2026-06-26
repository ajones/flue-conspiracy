# Purpose

`ical-reader` is a general iCal helper for arbitrary **secret** iCal URLs. It provides a small set of Bun/TypeScript scripts to:

- Safely register secret iCal feed URLs.
- Efficiently fetch and cache ICS data from multiple calendars.
- Parse and persist past events into SQLite for historical queries.
- Keep future events in memory for fast, up-to-date queries.
- Expose JSON-only query interfaces with fuzzy text search and flexible date filters.

All scripts are intended to be composed from the command line or other tools, with output suitable for piping into `jq` or further automation.

---

## Data Storage

### Credentials / Calendars Registry

- File: `.ical.credentials` in your workspace
- Purpose: durable registry of known calendars.
- Format: **one calendar per line**, using a robust separator:
  - `URL|||calendar_name|||extra_details`
- `URL` is the secret iCal URL (write-only once captured).
- `calendar_name` is a human-friendly identifier (e.g., `family`, `work`, `school`), used for filtering.
- `extra_details` is a free-form JSON-ish or text field for future metadata (e.g., `{"color":"#ff0000"}`), not interpreted by v1 but preserved.

### Local Cache & Metadata

- Directory: `skills/ical-reader/cache/` (created on demand).
- Per-calendar cache files keyed by URL-derived hash (to avoid storing the URL itself in filenames):
  - Raw ICS: `<hash>.ics`
  - Metadata: `<hash>.meta.json` (ETag, Last-Modified, content hash, calendar_name, last_sync, etc.).
- The metadata file stores:
  - `calendarName`
  - `calendarHash` (hash of URL)
  - `etag` (if provided by server)
  - `lastModified` (if provided by server)
  - `contentHash` (hash of latest raw ICS payload)
  - `lastSync` timestamp
  - Any parsing stats (event counts, last error).

### SQLite Database

- File: `skills/ical-reader/ical-events.sqlite`
- Purpose: long-term storage of **past events** for historical queries; future events remain in memory per run.
- Core tables (v1):

```sql
-- Calendars registered locally (does NOT store secret URLs)
CREATE TABLE IF NOT EXISTS calendars (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  url_hash        TEXT NOT NULL,        -- stable hash of URL
  extra_details   TEXT,                 -- copy of .ical.credentials "extra_details"
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Events (past events persisted; future events kept in memory per-sync)
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id     INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid             TEXT NOT NULL,       -- ICS UID
  recurrence_id   TEXT,                -- for recurring instance exceptions
  dtstart         TEXT NOT NULL,       -- ISO 8601; stored in original event timezone
  dtend           TEXT,                -- ISO 8601; stored in original event timezone
  all_day         INTEGER NOT NULL,    -- 0/1
  tzid_start      TEXT,                -- original DTSTART timezone identifier, if any
  tzid_end        TEXT,                -- original DTEND timezone identifier, if any
  summary         TEXT,
  location        TEXT,
  description     TEXT,
  last_modified   TEXT,                -- from ICS LAST-MODIFIED, if present
  sequence        INTEGER,             -- from ICS SEQUENCE, if present

  -- Fuzzy search support (simple indices + future embeddings)
  tokens_summary  TEXT,                -- normalized tokens for summary
  tokens_location TEXT,                -- normalized tokens for location
  tokens_body     TEXT,                -- normalized tokens for description
  embedding       BLOB,                -- reserved for future semantic search (unused in v1)

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  UNIQUE (calendar_id, uid, IFNULL(recurrence_id, ''))
);

CREATE INDEX IF NOT EXISTS idx_events_calendar_start
  ON events (calendar_id, dtstart);

CREATE INDEX IF NOT EXISTS idx_events_start
  ON events (dtstart);

CREATE INDEX IF NOT EXISTS idx_events_tokens
  ON events (tokens_summary, tokens_location, tokens_body);
```

- **Past vs Future events**
  - Past events (end time before now) are **upserted** into `events` on each sync.
  - Future events (end time at or after now) are **kept in-memory** in the sync/query process; they are not required for historical "last event" queries and can be re-parsed cheaply from cache.

---

## URL Handling

### Initial Add (Registration)

- Script: `scripts/ical-add.ts`
- Responsibilities:
  1. Accept an iCal URL plus `calendar_name` and optional `extra_details`.
  2. **Validate the URL** by fetching and parsing the ICS **before** writing anything to `.ical.credentials`.
  3. If validation succeeds:
     - Append a new line to `.ical.credentials` in the format:
       - `URL|||calendar_name|||extra_details` (with `extra_details` allowed to be empty).
     - Ensure `calendar_name` is unique (or fail with a structured JSON error).
     - Insert or update a row in the `calendars` table (using only `url_hash`, not the raw URL).
  4. If validation fails:
     - **Do NOT store** the URL anywhere.
     - Return a JSON error object with details, without echoing the URL.

### Secret URL Protection

- The iCal URL is treated as **write-only** once provided:
  - The scripts must never log, print, or re-emit the URL after initial capture.
  - Any logs or JSON outputs refer to calendars using `calendar_name` or `url_hash`, never the raw URL.
  - Cache filenames are derived from a hash of the URL, not the URL itself.

---

## Caching Strategy

### Fetching with Conditional Requests

- Script primarily responsible: `scripts/ical-sync.ts`.
- For each calendar entry in `.ical.credentials`:
  1. Compute or look up `url_hash` to locate its cache metadata.
  2. When issuing the HTTP request, include conditional headers when available:
     - `If-None-Match: <etag>` if an ETag was previously stored.
     - `If-Modified-Since: <lastModified>` if a Last-Modified value was stored.
  3. Interpret responses:
     - **304 Not Modified**: do **not** refetch or re-parse; load and reuse the last cached raw ICS + metadata.
     - **200 OK**:
       - Save new raw ICS to `<hash>.ics`.
       - Compute `contentHash` (e.g., SHA-256) to detect changes when no ETag/Last-Modified is available.
       - Update `<hash>.meta.json` with new ETag / Last-Modified if present.
     - Other HTTP failures: record a per-calendar error; see Error Handling.

### Avoiding Unnecessary Re-parsing

- If the server provides neither ETag nor Last-Modified:
  - `ical-sync` always downloads the ICS.
  - Before parsing, compute `contentHash` and compare to stored `contentHash`:
    - If unchanged, skip re-parsing and reuse the most recent parsed representation where appropriate.
    - If changed, parse and update persisted events.

### Per-Run Event Lifecycle

- On each sync run:
  - For each calendar:
    - Load or fetch ICS according to caching strategy.
    - Parse ICS into event objects (including recurrence expansion as needed).
    - Partition events into:
      - **Past events** (e.g., events where `dtend < now`): upsert into SQLite `events` table.
      - **Future events** (where `dtend >= now`): stored in an in-memory structure keyed by `calendar_id`.
  - The in-memory future events are available for immediate queries in the same process (e.g., if `ical-query.ts` is invoked as part of a long-running process or shares state).
  - For short-lived scripts, `ical-query.ts` can re-parse from cache when needed to get current/future events.

---

## Query Capabilities

### Core Script: `scripts/ical-query.ts`

- General behavior:
  - Accepts CLI flags (and optionally JSON input via stdin) specifying query type and parameters.
  - Talks to the SQLite database for **historical events**.
  - Uses in-memory or cache-parsed future events to provide a complete view from "now" forward.
  - Always returns **JSON-only** structured responses.

### CLI Interface & Modes

- `ical-query.ts` is split into mutually-exclusive, flag-driven modes rather than a `--mode` enum.
- Key flags:
  - `--range`: events in a date range.
  - `--fuzzy-range`: events in a date range with fuzzy text search.
  - `--next`: events in the next N days (or shortcut windows).
  - `--last`: "when was the last event matching A?".
- Each mode requires a specific combination of arguments; if a required combination is missing or invalid, the script returns a clear JSON error describing what is wrong (rather than guessing).

#### Common Flags

- `--from`: date or datetime (ISO). Date-only forms like `2026-02-23` are allowed and interpreted as whole-day ranges in the active timezone context.
- `--to`: date or datetime (ISO), same handling as `--from`.
- `--next-days`: integer N; used with `--next`.
- `--time-range`: shortcut for next windows (`today | tomorrow | this_week`); mutually exclusive with `--next-days`.
- `--query`: free-text search string; required for `--fuzzy-range`, `--next` (when doing text search), and `--last`.
- `--calendar`: may be repeated to restrict to specific calendars; default is **all calendars**.
- `--limit`: maximum number of events to return.
- `--all-day`: `true | false` to filter all-day vs timed events.
- `--sort`: `start_asc | start_desc`.
- `--tz-convert`: IANA timezone string for output conversion.

#### Mode-specific Expectations

- `--range`:
  - Requires: `--from` and `--to` (date or datetime, ISO-ish).
  - Optional: `--calendar`, `--limit`, `--all-day`, `--sort`, `--tz-convert`.

- `--fuzzy-range`:
  - Requires: `--from`, `--to`, and `--query`.
  - Optional: `--calendar`, `--limit`, `--all-day`, `--sort`, `--tz-convert`.

- `--next`:
  - Requires: either `--next-days` **or** `--time-range`.
  - Optional: `--query` (to filter by fuzzy match), `--calendar`, `--limit`, `--all-day`, `--sort`, `--tz-convert`.

- `--last`:
  - Requires: `--query`.
  - Optional: `--calendar`, `--all-day`, `--tz-convert`.

If a required flag is missing (e.g., `--range` without `--from`), or conflicting flags are provided (e.g., both `--next-days` and `--time-range`), the script returns a structured JSON error with `ok: false` and a clear `message` explaining what combination is expected.

### Query Types

1. **Events in a date range** (`--range`)
   - Input:
     - `from` (ISO 8601 string; date-only allowed).
     - `to` (ISO 8601 string; date-only allowed).
     - Optional `calendar` filters.
   - Behavior:
     - Return all events whose start/end intersects the `[from, to]` interval.
     - Combine past events (from SQLite) and relevant future events.

2. **Events matching a fuzzy query A between dates A and B** (`--fuzzy-range`)
   - Input:
     - `query` (free text string; non-exact by design).
     - `from`, `to` date range.
     - Optional `calendar` filters.
   - Behavior:
     - Retrieve candidate events in the date range.
     - Apply fuzzy similarity scoring across `summary`, `location`, and `description`.
     - Sort by time (and when relevant, by score) depending on request.

3. **Events matching a query A in the next N days / shortcuts** (`--next`)
   - Input:
     - Either `--next-days=<N>` or `--time-range=today|tomorrow|this_week`.
     - Optional `query` (free text) for fuzzy filtering.
     - Optional `calendar` filters.
   - Behavior:
     - Derive `[from, to]` based on `now`, `next-days` or `time-range`.
     - Run the same fuzzy search as in (2) when `query` is provided; otherwise return all events in that window.

4. **"When was the last event matching A?"** (`--last`)
   - Input:
     - `query` (free text).
     - Optional `calendar` filters.
   - Behavior:
     - Search **historical events only** (SQLite) for events whose fields fuzzy-match `query`.
     - Sort in descending order by `dtstart`.
     - Return the first (most recent) matching event.

### Filters

All query types support optional filters:

- `from`, `to`: ISO 8601 strings; date-only forms allowed and treated as whole days.
- `limit`: maximum number of results to return.
- `allDay`: filter for all-day vs scheduled events.
- `sortOrder`:
  - Default: `start_asc` (start time ascending).
  - For "last event" queries: internal sort by `start_desc` to pick the most recent.

### Fuzzy Search Implementation

- Assumptions:
  - Query strings are **never exact matches**; the implementation always uses fuzzy/similarity-based matching.

- Local-only implementation (v1):
  - No external APIs or embeddings.
  - Techniques:
    - Tokenization and normalization of `summary`, `location`, and `description` into stored `tokens_*` columns.
    - For a given `query`:
      - Normalize to tokens.
      - Compute a composite score per event using:
        - Token overlap / Jaccard-like similarity.
        - Simple edit distance (e.g., Levenshtein or Hamming) between key tokens where appropriate.
      - Weight fields differently (`summary` > `location` > `description`).
  - Fuzzy scoring happens in TypeScript over candidate rows selected by date and coarse text filters.

- Fields included in fuzzy matching (v1):
  - `summary`
  - `location`
  - `description`

- Future design:
  - Schema and code are structured to support adding semantic similarity via embeddings later:
    - `embedding` BLOB column can store vector data.
    - A future version can compute embeddings on insert/update and use vector similarity search.

### JSON Response Shape

- Default JSON output structure is designed for jq-friendly processing and includes query echo, events, and errors.

Example for a typical query:

```json
{
  "ok": true,
  "query": {
    "mode": "last",            
    "calendars": ["kids", "personal"],
    "from": "2026-02-23T00:00:00-08:00",
    "to": "2026-02-24T00:00:00-08:00",
    "text": "soccer",
    "tzConvert": "America/Los_Angeles"
  },
  "events": [
    {
      "calendar": "kids",
      "uid": "abc123",
      "summary": "Soccer practice",
      "description": "Field 3",
      "location": "Parkmead",
      "start": "2026-02-23T15:30:00-08:00",
      "end": "2026-02-23T16:30:00-08:00",
      "allDay": false,
      "originalTz": "America/Los_Angeles",
      "fuzzyScore": 0.87
    }
  ],
  "errors": [
    {
      "calendar": "work",
      "code": "FETCH_FAILED",
      "message": "Failed to fetch or parse calendar"
    }
  ]
}
```

(Exact field names can be adjusted slightly during implementation but should follow this shape.)

---

## Time Zones

- **Default behavior:**
  - Preserve the **original event timezone information** in outputs.
  - Store `dtstart`/`dtend` in ISO 8601 including offsets, and record `tzid_start` / `tzid_end` when available.

- **Optional conversion flag:**
  - CLI flag: `--tz-convert=<IANA_TZ>` (e.g., `--tz-convert=America/Los_Angeles`).
  - When provided:
    - Convert all event times into the specified timezone.
    - Maintain original timezone metadata:
      - `start.originalTzid` and `end.originalTzid` when serializing.
      - Optionally include both converted and original ISO strings if needed.

- Conversion is performed at query time (in `ical-query.ts`) so that raw storage remains faithful to the original ICS data.

---

## Error Handling

### Initial Add Errors (`ical-add.ts`)

- If the URL is invalid, unreachable, or the body is not valid ICS:
  - Do **not** write to `.ical.credentials`.
  - Do **not** insert into SQLite.
  - Return a JSON error object, for example:

```json
{
  "ok": false,
  "errorType": "validation_failed",
  "message": "Failed to fetch or parse calendar",
  "details": {
    "reason": "http_error" | "invalid_url" | "parse_error",
    "statusCode": 404,
    "calendarName": "family"
  }
}
```

- The `details` section may include the human-provided `calendarName`, but never the raw URL.

### Sync Errors (`ical-sync.ts`)

- For stored calendars, if fetch or parse fails:
  - The failure is captured per calendar in a structured manner.
  - `ical-sync.ts` should produce a JSON summary such as:

```json
{
  "ok": true,
  "calendars": [
    {
      "name": "family",
      "status": "ok",
      "eventsUpdated": 123,
      "futureEvents": 45
    },
    {
      "name": "work",
      "status": "error",
      "error": {
        "errorType": "fetch_failed",
        "message": "Network timeout",
        "details": {
          "reason": "timeout"
        }
      }
    }
  ]
}
```

- Errors may mention `calendarName` but never the secret URL.

### Query Errors (`ical-query.ts`)

- Multi-calendar queries return partial results when possible:

```json
{
  "ok": true,
  "events": [ /* events from successful calendars */ ],
  "errors": [
    {
      "calendarName": "work",
      "errorType": "fetch_failed" | "parse_failed" | "database_error",
      "message": "...",
      "details": { }
    }
  ]
}
```

- If the entire query cannot be served (e.g., DB unavailable, invalid flag combination), return `ok: false` with a top-level error, such as:

```json
{
  "ok": false,
  "errorType": "invalid_arguments",
  "message": "--range requires both --from and --to",
  "details": {
    "missing": ["from", "to"],
    "mode": "range"
  }
}
```

---

## Scripts / Interfaces

All scripts are implemented in **TypeScript** and run with **Bun**. They are designed to be called from the command line or other tooling, and they emit **JSON-only** output.

To keep the implementation DRY, shared logic (e.g., reading `.ical.credentials`, computing URL hashes, HTTP fetch with conditionals, ICS parsing, SQLite access, and fuzzy scoring) should live in common utility modules (e.g., `src/lib/credentials.ts`, `src/lib/http.ts`, `src/lib/ics.ts`, `src/lib/db.ts`, `src/lib/fuzzy.ts`) which the individual scripts import.

### 1. `scripts/ical-add.ts`

- Purpose: Register a new iCal calendar.
- Inputs (CLI flags or JSON via stdin):
  - `--url` (required, only used at add-time; never logged back out).
  - `--name` (required, unique `calendar_name`).
  - `--details` (optional string, e.g., JSON or free text).
- Behavior:
  1. Fetch ICS from `--url`.
  2. Validate that the body is parseable as ICS and contains at least one VEVENT.
  3. On success:
     - Append `URL|||name|||details` to `.ical.credentials`.
     - Insert/update `calendars` row with `name`, `url_hash`, `extra_details`.
     - Return JSON success object with calendar metadata (no URL).
  4. On failure: return structured JSON error as described above.

### 2. `scripts/ical-sync.ts`

- Purpose: Fetch, cache, and parse all registered calendars.
- Inputs:
  - Optional `--calendar` or `--calendars` to restrict sync to specific named calendars.
  - Optional `--since` for incremental backfill (e.g., only process events after a certain date).
- Behavior:
  1. Read `.ical.credentials` and map to known calendars.
  2. For each calendar:
     - Use ETag/Last-Modified/`contentHash` to decide whether to fetch and/or re-parse.
     - Parse ICS into events.
     - Split into past vs future by current time.
     - Upsert past events into `events` table, using `uid`/`recurrence_id` and metadata (`last_modified`, `sequence`) to handle updates.
     - Keep future events in memory for this run (or serialize to a temporary structure if needed by callers).
  3. Return a JSON summary per calendar (counts, status, errors).

- Output example:

```json
{
  "ok": true,
  "calendars": [
    {
      "name": "family",
      "status": "ok",
      "pastEventsUpserted": 320,
      "futureEventsCount": 45,
      "lastSync": "2026-02-22T16:10:00-08:00"
    }
  ],
  "errors": []
}
```

### 3. `scripts/ical-query.ts`

- Purpose: Answer questions about events using SQLite (historical) plus current/future events.
- Inputs (CLI flags or JSON):
  - Mode flags (mutually exclusive): `--range`, `--fuzzy-range`, `--next`, `--last`.
  - `--from`, `--to`: ISO timestamps when applicable (date-only forms allowed).
  - `--query`: free-text search string.
  - `--next-days`: integer for `--next` mode.
  - `--time-range`: `today | tomorrow | this_week` for `--next` mode.
  - `--calendar`: may be repeated to restrict to specific calendars.
  - `--limit`: maximum number of events.
  - `--all-day`: `true | false` to filter all-day vs timed events.
  - `--sort`: `start_asc | start_desc`.
  - `--tz-convert`: IANA timezone string for output conversion.

- Behavior:
  - Validate flags and ensure a single mode is selected with the appropriate arguments; otherwise return a JSON error with `ok: false` and a clear `message`.
  - Build the appropriate date range and calendar filters.
  - Query SQLite for relevant historical events.
  - Incorporate future events via in-memory or cache-parsed data.
  - Apply fuzzy scoring where a `query` string is provided, using `summary`, `location`, and `description`.
  - Apply filters, sorting, and limit.
  - Return structured JSON as described in Query Capabilities and JSON Response Shape.

---

## Implementation Notes

- All scripts should:
  - Avoid writing secret URLs to logs, stdout, or stderr after initial capture.
  - Use robust error handling and clearly structured JSON responses.
  - Factor shared logic into reusable utility modules to keep `ical-add.ts`, `ical-sync.ts`, and `ical-query.ts` thin and focused on CLI wiring.
- Future versions can add:
  - Embedding computation for semantic search using the reserved `embedding` column.
  - Additional query types (e.g., "next occurrence of X", recurring pattern summaries).
  - Integration with other skills or notification systems using the JSON outputs from `ical-query.ts`.