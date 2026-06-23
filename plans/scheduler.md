# Native Scheduling System for flue-conspiracy

## Context

The system currently relies on **OpenClaw**, an external daemon, to manage 74 cron/interval/one-shot jobs stored in `~/.openclaw/cron/jobs.json`. Jobs are fired by OpenClaw and delivered to agents via a shell script (`session-agent-turn.sh`). This creates a dependency on a separate process and a disconnect from the Flue dispatch system.

The goal is to bring scheduling **native** into the flue-conspiracy gateway so it's self-contained: one process, one database, one dispatch path. Jobs should survive restarts, be manageable via API and CLI, and support all existing OpenClaw schedule types plus useful additions.

---

## Job Model

A job always runs in **isolation** (fresh session per run, no carry-over). No `sessionTarget` or `payload.kind` — every job is an agent turn with a prompt.

### Core Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Unique kebab-case slug |
| `agent` | string | yes | Target agent, e.g. `"raven-lead"` |
| `prompt` | string | yes | The work prompt — what data to gather/process |
| `resultPreference` | string | yes | Standing instruction for what the agent should do with the result — natural language, e.g. `"format the weather nicely and send it to the family BlueBubbles group"` or `"email a summary to foo@bar.com"` |
| `target` | string | yes | Channel conversation key for dispatch routing, e.g. `"telegram:chat:123456"` or `"bluebubbles:group:user1+user2"`. The agent turn lands in this conversation's history and the agent gets that channel's tools. |
| `schedule` | object | yes | When to run (see schedule types) |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `description` | string | `""` | Human-readable description |
| `enabled` | boolean | `true` | Whether the job fires |
| `scripts` | Script[] | `[]` | Pre-flight shell scripts (see below) |
| `deleteAfterRun` | boolean | `false` | Auto-delete after successful run (one-shots) |
| `maxRetries` | number | `0` | Retry count on dispatch failure |
| `retryDelayMs` | number | `60000` | Delay between retries |
| `concurrencyKey` | string | none | Prevent overlapping runs with same key |
| `tags` | string[] | `[]` | For filtering/organization |

### Pre-flight Scripts

Each job can define an array of shell scripts that run **in parallel** before the agent turn. Scripts inherit the gateway process's environment variables. Results are injected into the prompt at the specified location.

```typescript
interface Script {
  key: string;            // identifier, e.g. "weather-data"
  description: string;    // what this script gathers, e.g. "Current weather for Oakland, CA"
  command: string;        // shell command, e.g. "curl -s 'wttr.in/Oakland?format=j1'"
  timeout: number;        // ms, e.g. 30000
  injection: "before" | "after";  // relative to the prompt
  failureMessage: string; // message shown to agent on failure, e.g. "Weather API is down"
}
```

**Execution flow:**
1. All scripts run in parallel via `Bun.spawn` with the gateway's `process.env`
2. Wait for all to complete (or timeout)
3. Build the final prompt by injecting results at their specified locations

**Injection format on success:**
```
<script key="weather-data" description="Current weather for Oakland, CA">
{ ...stdout data... }
</script>
```

**Injection format on failure:**
```
<script key="weather-data" status="error" message="Weather API is down">
{ ...stderr/error, truncated to 25 lines... }
</script>
```

**Final prompt assembly:**
```
[before-injection scripts, concatenated]

{job.prompt}

[after-injection scripts, concatenated]
```

### Example Job

```json
{
  "name": "daily-weather-brief",
  "agent": "raven-lead",
  "prompt": "Gather the weather and calendar data provided and prepare a morning brief.",
  "resultPreference": "Format a friendly morning summary with weather highlights and today's schedule. Send it to the family BlueBubbles group.",
  "target": "bluebubbles:group:family",
  "schedule": { "kind": "cron", "expr": "0 7 * * *", "tz": "America/Los_Angeles" },
  "scripts": [
    {
      "key": "weather-data",
      "description": "Current weather forecast for Oakland, CA",
      "command": "curl -s 'wttr.in/Oakland?format=j1'",
      "timeout": 15000,
      "injection": "before",
      "failureMessage": "Weather API is unavailable — tell the user you couldn't fetch weather data."
    },
    {
      "key": "calendar-today",
      "description": "Today's calendar events",
      "command": "ical-reader today --json",
      "timeout": 10000,
      "injection": "before",
      "failureMessage": "Could not read calendar."
    }
  ]
}
```

---

## Schedule Types

| Kind | Description | `schedule` shape |
|------|-------------|------------------|
| `cron` | 5-field cron expression with timezone | `{ kind, expr, tz? }` |
| `every` | Fixed interval, drift-free from anchor | `{ kind, everyMs, anchorMs? }` |
| `at` | One-shot at an ISO-8601 timestamp | `{ kind, at }` |
| `relative` | "In N ms" convenience, resolved to absolute on creation | `{ kind, delayMs }` |
| `weekday` | Specific weekdays or every N business days | `{ kind, days?, everyNDays?, timeOfDay, tz?, skipHolidays? }` |

The `weekday` kind supports two modes:
- **Specific days**: `{ days: ["mon", "wed", "fri"], timeOfDay: "09:00", tz: "America/Los_Angeles" }`
- **Every N business days**: `{ everyNDays: 2, timeOfDay: "09:00", tz: "America/Los_Angeles", skipHolidays: true }`

Holiday list: static set of US federal holidays for the current year.

**Not in scope initially:** sunrise/sunset, natural language parsing, rate-limiting/debounce.

---

## Architecture

### Timer strategy
Single `setTimeout` pointing at the soonest due job. When it fires, query all jobs where `next_run_at <= now`, fire them, recompute, and set the next timer. No polling loop.

### Fire sequence
1. Run all `scripts` in parallel via `Bun.spawn` (inheriting `process.env`), each with its own timeout
2. Collect results, build the assembled prompt:
   ```
   [before-injection script results]

   {job.prompt}

   [after-injection script results]

   <result-preference>
   {job.resultPreference}
   </result-preference>
   ```
3. Dispatch to the **real channel conversation** using the job's `target` as the dispatch `id`:
   ```typescript
   dispatch({
     agent: job.agent,
     id: job.target,  // e.g. "bluebubbles:group:family" or "telegram:chat:123456"
     input: {
       type: 'scheduler.job',
       jobName: job.name,
       message: assembledPrompt,
     },
   })
   ```
   Because `id` matches a real channel conversation key, the agent gets that channel's tools (e.g. `post_telegram_message`) and the turn appears in the conversation history.
4. Fire-and-forget — dispatch accepted = job `ok`

### Separation of concerns
- **Job run history** (timing, script outputs, errors, assembled prompt) → stored in `raven_job_runs`
- **Agent conversation** (the agent's response, tool calls, delivery) → lives in the channel's conversation history via Flue's normal agent state, visible in the channel

### Crash recovery
On startup, mark any `running` runs as `error` ("gateway restarted"), recompute all `next_run_at` values, and catch up any missed jobs.

---

## New Files

```
src/scheduler/
  types.ts              - Interfaces + valibot schemas
  db.ts                 - SQLite schema, CRUD, queries (bun:sqlite on ./data/flue.db)
  cron.ts               - Schedule computation (wraps cron-parser)
  scripts.ts            - Script runner (Bun.spawn, parallel exec, output collection)
  engine.ts             - Scheduler class: timer mgmt, fire loop, prompt assembly
  routes.ts             - Hono sub-app for /api/jobs
  index.ts              - Re-exports
src/cli/jobs.ts         - CLI subcommands (talks to gateway via HTTP)
```

## Modified Files

- `src/app.ts` — mount scheduler routes, start scheduler
- `src/config.ts` — add `SchedulerConfig` interface
- `src/cli/index.ts` — add `jobs` command routing
- `raven.json5` — add `scheduler` config section

**Not in scope:** OpenClaw migration.

---

## SQLite Schema

Tables use `raven_` prefix to avoid collisions with Flue's `flue_` tables. Opened via `bun:sqlite` on the same `./data/flue.db`.

**`raven_jobs`** — job definitions with denormalized `next_run_at` for efficient due-job queries (indexed: `WHERE enabled = 1 AND next_run_at IS NOT NULL`).

Key columns: `id` (UUID), `name` (unique slug), `agent`, `prompt` (text), `result_preference` (text), `target` (text — channel conversation key), `scripts` (JSON array), `schedule_kind`, `schedule_data` (JSON), `description`, `enabled`, `delete_after_run`, `max_retries`, `retry_delay_ms`, `concurrency_key`, `tags` (JSON array), `next_run_at`, `last_run_at`, `last_status`, `consecutive_errors`, `created_at`, `updated_at`.

**`raven_job_runs`** — execution history with `job_id` FK, `status`, timestamps, `dispatch_id`, `error_message`, `retry_attempt`, `assembled_prompt` (the final prompt sent to the agent including script results).

---

## New Dependency

**`cron-parser`** — zero-dependency, timezone-aware cron expression parser. Handles DST transitions, returns `Date` objects for next occurrence.

---

## Config Addition (`raven.json5`)

```json5
scheduler: {
  maxConcurrent: 5,        // max simultaneous dispatches
  runRetentionDays: 30,    // prune history older than this
  defaultTimezone: "America/Los_Angeles",
}
```

---

## API Routes (mounted at `/api/jobs`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/jobs` | List jobs (filter: enabled, tag, agent) |
| POST | `/api/jobs` | Create job |
| GET | `/api/jobs/:id` | Get job by ID or name |
| PUT | `/api/jobs/:id` | Update job |
| DELETE | `/api/jobs/:id` | Delete job |
| POST | `/api/jobs/:id/enable` | Enable |
| POST | `/api/jobs/:id/disable` | Disable |
| POST | `/api/jobs/:id/trigger` | Manual trigger |
| GET | `/api/jobs/:id/runs` | Job run history |
| GET | `/api/job-runs` | Global run history |

---

## CLI Commands (`raven jobs`)

| Command | Description |
|---------|-------------|
| `raven jobs list` | Table of all jobs. Flags: `--enabled`, `--disabled`, `--json` |
| `raven jobs show <name>` | Job details + recent runs |
| `raven jobs enable <name>` | Enable a job |
| `raven jobs disable <name>` | Disable a job |
| `raven jobs delete <name>` | Delete with confirmation |
| `raven jobs trigger <name>` | Manual run |
| `raven jobs history [name]` | Execution history |

---

## Implementation Order

1. **Types + DB** — `types.ts`, `db.ts`, install `cron-parser`
2. **Script runner** — `scripts.ts`
3. **Engine** — `cron.ts`, `engine.ts`, `index.ts`
4. **Integration** — `routes.ts`, `app.ts` changes, `config.ts` changes
5. **CLI** — `jobs.ts`, `index.ts` routing

---

## Verification

1. Start gateway (`raven start`), create a test job via API with `schedule: { kind: "relative", delayMs: 10000 }` and a script that runs `echo "hello"`
2. Watch logs for script execution and dispatch firing after 10 seconds
3. Create a cron job (`*/1 * * * *`), verify it fires each minute
4. Stop and restart gateway, verify missed jobs catch up
5. Use `raven jobs list` to verify job appears, `raven jobs history` to see the run record and assembled prompt
