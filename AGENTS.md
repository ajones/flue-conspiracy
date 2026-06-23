# Agents

## Framework

This project uses [Flue](https://github.com/withastro/flue) — a TypeScript sandbox agent framework providing durable execution, subagents, tools, and MCP server integration.

Core packages: `@flue/runtime`, `@flue/cli`, `@flue/sdk`.

## Implementation Phases

Work proceeds in four phases. Each phase must be complete and tested before starting the next.

### Phase 1 — Auth & Token Management

Build the OAuth 2.0 module first. Nothing else works without valid tokens.

Files: `src/auth/oauth.ts`, `src/auth/tokens.ts`

### Phase 2 — Basic Agent + Flue TUI

Define the agent in `src/agent.ts`, bind it to Codex through the auth module, and use the Flue TUI for chat. Do not build a custom chat interface — the Flue TUI (`npx flue dev`) handles all terminal interaction.

### Phase 3 — Agent Functionality

Add tools, subagents, and skills that define what this agent can actually do. All tools live in `src/tools/`.

### Phase 4 — iMessage via `imsg`

Add iMessage as a Flue channel using the local `imsg` CLI. The adapter lives in `src/channels/imessage.ts`.

## Architecture

The agent is defined in `src/agent.ts` using `@flue/runtime`. Tools live in `src/tools/` as typed actions. Auth logic is isolated in `src/auth/`. The iMessage channel adapter is in `src/channels/imessage.ts`.

## Chat Interface

Use the Flue TUI exclusively. Do not build a custom terminal UI, web UI, or any other chat frontend. The TUI is started with `npx flue dev` and handles input, output, history, and rendering.

## OpenAI Codex OAuth

All Codex API access goes through OAuth 2.0 authorization code flow. Never use API keys directly.

### Token Lifecycle

- **Access tokens** are short-lived. Check expiry before every Codex call; refresh transparently if expired.
- **Refresh tokens** are long-lived. Encrypt at rest using `TOKEN_ENCRYPTION_KEY`. If a refresh fails with a 401, clear stored tokens and re-initiate the auth flow.
- Token exchange and refresh happen in `src/auth/tokens.ts`. The OAuth flow (redirect, callback) is in `src/auth/oauth.ts`.

### Rules

- Never log or expose tokens in plaintext — not in tool output, agent responses, or telemetry.
- Always validate `state` parameter on OAuth callbacks to prevent CSRF.
- Store tokens encrypted. No plaintext persistence.
- Handle refresh races: if multiple concurrent calls detect an expired token, only one should refresh; others wait for the result.
- Treat refresh token rotation responses correctly — if OpenAI returns a new refresh token alongside the access token, persist the new one and discard the old.

## iMessage Channel (Phase 4)

The `imsg` CLI provides iMessage send/receive. The channel adapter in `src/channels/imessage.ts` must:

- Accept incoming messages via webhook or polling
- Route them to the agent as Flue channel events
- Send agent responses back through `imsg` as iMessage replies
- Handle delivery receipts and errors gracefully

Environment: `BLLEW_API_KEY`, `BLLEW_PHONE_NUMBER`.

Each iMessage conversation must be configured with an explicit `agent`. Do not rely on a shared default agent or fallback routing.

## Tools

Tools in `src/tools/` are typed Flue tool definitions. Each tool that calls the Codex API must obtain a valid access token via the auth module before making requests. Tools should not handle token refresh themselves — that is the auth module's responsibility.

## Adding a New Tool

1. Create a file in `src/tools/` exporting a Flue tool definition.
2. Register it in `src/agent.ts`.
3. If the tool calls Codex, import `getAccessToken()` from `src/auth/tokens.ts`.

## Scheduled Jobs

Jobs are managed through the raven gateway's HTTP API at `http://localhost:7284/api/jobs`. The CLI (`raven jobs`) handles listing, showing, enabling, disabling, deleting, and triggering — but creation is done via the API directly.

### Creating a Job

`POST /api/jobs` with a JSON body:

```json
{
  "name": "my-job",
  "agent": "raven-lead",
  "prompt": "What the agent should do when the job fires.",
  "resultPreference": "How the agent should deliver the result.",
  "target": "telegram:v1:regular:chat:<chatId>:thread::direct:",
  "schedule": { ... },
  "description": "Optional human-readable description",
  "enabled": true,
  "deleteAfterRun": false,
  "tags": ["optional", "tags"]
}
```

Required fields: `name` (kebab-case), `agent`, `prompt`, `resultPreference`, `target`, `schedule`.

### Schedule Types

**One-shot at a specific time:**
```json
{ "kind": "at", "at": "2026-06-23T07:00:00-07:00" }
```

**Recurring daily/weekly with time of day:**
```json
{
  "kind": "weekday",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  "timeOfDay": "07:00",
  "tz": "America/Los_Angeles"
}
```
Omit `days` and use `"everyNDays": 2` for every-N-days patterns.

**Cron expression:**
```json
{ "kind": "cron", "expr": "0 7 * * *", "tz": "America/Los_Angeles" }
```

**Fixed interval:**
```json
{ "kind": "every", "everyMs": 3600000 }
```

**Relative delay (converted to `at` internally):**
```json
{ "kind": "relative", "delayMs": 60000 }
```

### Target Format

The `target` is a conversation key that tells the agent where to send results. For Telegram:
```
telegram:v1:regular:chat:<chatId>:thread::direct:
```
Find existing chat IDs by querying the `flue_sessions` table in `data/flue.db`.

### Updating a Job

`PUT /api/jobs/<name>` with any subset of fields to update.

### CLI Management

```
raven jobs list              # List all jobs
raven jobs show <name>       # Show job details + recent runs
raven jobs enable <name>     # Enable a disabled job
raven jobs disable <name>    # Disable a job
raven jobs delete <name>     # Delete a job
raven jobs trigger <name>    # Trigger a manual run now
raven jobs history [name]    # Show execution history
```

### Options

- `deleteAfterRun`: If true, the job is removed after a successful one-shot run.
- `maxRetries` / `retryDelayMs`: Retry on failure (default: no retries).
- `concurrencyKey`: Prevents overlapping runs for jobs sharing the same key.
- `scripts`: Pre/post-flight shell commands. Output can be injected into the prompt.

## Environment

Required env vars are listed in the README. The `.env.example` file is the source of truth for what's needed.
