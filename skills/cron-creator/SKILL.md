---
name: cron-creator
description: >
  REQUIRED for ALL cron job operations. You MUST read this skill and run the validator
  (scripts/validate-job.ts) before creating, editing, or diagnosing any cron job. Never create
  a cron job from memory alone — always follow the wizard steps and validate before submitting.
---

# Cron‑Creator Skill

This skill:

1. Walks you through the essential parameters of an OpenClaw cron job, prompting for each choice and finally assembling either:
   - A JSON job definition, or
   - An `openclaw cron add ...` CLI command

2. Reviews existing cron jobs in `~/.openclaw/cron/jobs.json` and diagnoses **common configuration issues** (including legacy `delivery` blocks that should be replaced with script-based delivery), with concrete suggestions for fixes.

**Model selection:**
- Do **not** set a `model` field in the job payload.
- Let each agent use its own configured default model.

**Naming convention:**
- All cron job **names** must be **lowercase kebab‑case** (e.g. `daily-agent-auth-check`, `morning-day-brief`).
- **Names must be prefixed with the target agent's id** followed by a hyphen (e.g. a job for agent `pp-maint` named `weekly-task-list` becomes `pp-maint-weekly-task-list`). The only exception is the `main` agent, whose jobs are not prefixed.
- Use the same lowercase kebab‑case base (including the agent prefix) for the cron‑prompt filename when possible.
- **Normalize immediately:** whenever a name is entered by the user or derived from a label, apply the transformation `toLower().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')` before proceeding, then prepend `<agentId>-` if the agent is not `main`. Show the normalized name to the user and ask for confirmation. Never carry a non-kebab-case name forward to any subsequent step.


## Always Use the Official Cron Docs

Before giving *any* guidance about cron job schemas, fields, or CLI flags, this skill must consult the **official OpenClaw cron docs** and treat them as the single source of truth:

- URL: https://docs.openclaw.ai/automation/cron-jobs#cron-jobs

Guidelines:
- Always fetch the latest version of that page (via `web_fetch`, `curl`, or an equivalent HTTP tool) at the start of a cron-creator interaction or whenever schema/flag details are needed. Do **not** rely solely on cached knowledge or training data.
- When there is any discrepancy between local assumptions and the docs, **the docs win**. Follow the current schema and examples from that page.
- Prefer quoting/reflecting relevant snippets from the docs when explaining required fields, enums, or CLI options, instead of inventing or guessing.
- If the docs page is temporarily unavailable, warn the user explicitly and be conservative in what you claim; avoid asserting specifics that might have changed.

This keeps the cron-creator skill aligned with the evolving OpenClaw cron implementation and prevents drift from the official reference.

---

## Modes

The skill supports two primary modes:

1. **Create Mode** – Interactive wizard to build a new cron job.
2. **Review/Diagnose Mode** – Analyze existing jobs in `~/.openclaw/cron/jobs.json` and report issues.

The user can trigger review mode with natural language like:
- "Review my cron jobs"
- "Diagnose cron issues"
- "Check `~/.openclaw/cron/jobs.json` for problems"

---

## Channel Mapping Source – `~/.openclaw/CHANNEL_MAPPING.md`

To understand which channels exist and how to reference them **within this skill’s UX and validation logic**, the skill should use `~/.openclaw/CHANNEL_MAPPING.md` as its source of truth.

**Important:**
- `CHANNEL_MAPPING.md` is **only** for the cron-creator skill (and other helper tools) to know what channel keys exist (e.g. `telegram`, `imessage`) and how to present them.
- The OpenClaw gateway and runtime agents **do not** read or depend on `CHANNEL_MAPPING.md` for actual message routing. They use their own configured delivery settings.
- This file is purely advisory/metadata for building and validating cron jobs; it does not control runtime delivery.

### How to use `CHANNEL_MAPPING.md`

- On startup or whenever channel info is needed, read:
  - `~/.openclaw/CHANNEL_MAPPING.md`
- Parse it defensively as Markdown:
  - Look for list items like `- telegram: 7698193342 (Telegram DM)`
  - The token before the colon (`telegram`, `imessage`, etc.) is the **channel key**.
  - The token after the colon up to the first `(` is the **primary identifier** (chat id, phone number, or handle).
  - Text inside parentheses is a human description only.
- Treat the channel key as the canonical value for `delivery.channel` (e.g. `telegram`, `imessage`).
- When needed, you can also surface the identifier in prompts or previews to the user (e.g. “telegram → 7698193342 (Telegram DM)”).

If the file cannot be read or parsed, fall back to asking the user explicitly which channel keys are valid and warn that CHANNEL_MAPPING.md appears out of sync.

---

## Create Mode – New Job Wizard

### Step 1 – Choose a schedule type
Ask the user which schedule they need:
- **One‑off** (`at`) – needs an exact UTC timestamp or relative duration.
- **Recurring interval** (`every`) – needs a period like `10m`, `1h`, or `6h`. Use this only for sub-day or short intervals where exact wall-clock time doesn't matter. **Do NOT use `every` for periods of 1 day or more** — it has no time-of-day control and will fire at an arbitrary time relative to the anchor.
- **Cron expression** (`cron`) – needs a classic `* * * * *` string and optional timezone.

#### "Every N days at a specific time" → always use `cron`

If the user wants a job to run **every N days at a specific time** (e.g. "every 3 days at 8am"), use `cron` kind with `*/N` in the day-of-month field:

| Desired | `expr` | `tz` |
|---------|--------|------|
| Every 2 days at 9am PT | `0 9 */2 * *` | `America/Los_Angeles` |
| Every 3 days at 8am PT | `0 8 */3 * *` | `America/Los_Angeles` |
| Every 7 days at noon PT | `0 12 */7 * *` | `America/Los_Angeles` |

**Never use** `every` kind (with `everyMs = N * 86400000`) for day-scale jobs that need a fixed run time — unless you also set `anchorMs` (see below).

**Important:** `*/N` resets at month boundaries (day 1, 1+N, 1+2N, …). If the user needs a strict 7-day rolling cycle regardless of month, use `cron` with `0 H * * DOW` (a specific day of week) or ask if the month-boundary reset is acceptable.

#### True N-day rolling interval at a fixed time → `every` + `anchorMs`

When the user needs a strict rolling cycle (e.g. every 30 or 90 days) that doesn't reset at month boundaries, use `every` kind with both `everyMs` and `anchorMs`:

```json
{
  "schedule": {
    "kind": "every",
    "everyMs": 7776000000,
    "anchorMs": 1754478000000
  }
}
```

- `everyMs` = N × 86400000 (e.g. 90 days = 7776000000)
- `anchorMs` = epoch milliseconds of the desired first (or any past) run — the system fires at `anchorMs + k * everyMs` for integer k

**Computing `anchorMs`** for a specific local time:
```bash
# Next occurrence at 10am Pacific (adjust date as needed)
date -j -f "%Y-%m-%d %H:%M:%S %Z" "2026-06-05 10:00:00 PDT" +%s%3N
```

**DST caveat:** `everyMs` is a fixed duration (ms), not calendar-aware. The job will shift by ±1 hour when DST transitions occur. If clock-exact time matters, use a `cron` expression with a specific date instead.

| N-day cycle | `everyMs` |
|-------------|-----------|
| 7 days | 604800000 |
| 14 days | 1209600000 |
| 30 days | 2592000000 |
| 60 days | 5184000000 |
| 90 days | 7776000000 |

#### Time math for `at` schedules (avoid off‑by‑minutes)

When the user says things like “in 2 minutes” or “at 8:30am local”, **never hand‑compute UTC wall‑clock time**. Instead:

- For **relative one‑shots** (“in N minutes/hours”):
  - Get the current epoch seconds.
  - Add the offset in seconds.
  - Format the result as an ISO‑8601 UTC string for `schedule.at`.
  - Example (shell):

    ```bash
    now=$(date +%s)
    at_ts=$(( now + 2*60 ))
    at_iso=$(date -u -r "$at_ts" +"%Y-%m-%dT%H:%M:%S.000Z")
    ```

- For **specific local times today/tomorrow** (e.g., “today at 8:30am”):
  - Construct the local wall‑clock time first using the system timezone.
  - Then convert that to UTC ISO‑8601.

Before finalizing, the wizard should **echo both local time and the computed `schedule.at` UTC value** back to Aaron for confirmation (this prevents the kind of mis‑scheduled bandaid reminder we just saw).

### Step 2 – Payload type
All jobs use **agentTurn** with `sessionTarget: "isolated"`. `systemEvent` does not work reliably and must never be used.

#### Pending Agent Requests (Jobs That Require a User Reply)

If a cron job is asking the user a question or otherwise needs the user's next message to proceed, the cron prompt MUST create a tracking entry in `PENDING_AGENT_REQUESTS.md` in the target agent workspace *before* it sends/delivers the question.

Rules:
- Preserve existing file contents; append a new entry.
- The entry must include:
  - The exact question asked (verbatim).
  - What follow-up actions the agent must do after the user replies.
  - A note to remove the entry from `PENDING_AGENT_REQUESTS.md` after completion.

Use this as the standard instruction block inside the cron prompt (adapt as needed):

```text
Before running the delivery step:
1. Append a new entry to `PENDING_AGENT_REQUESTS.md` in the workspace.
2. If the file already exists, preserve its existing contents and append this request as a separate entry.
3. The entry must include:
   - the exact question you asked the user
   - the follow-up actions you will take after their reply
   - an instruction to remove this entry after completion
```

#### Session history in cron prompts

If the task requires access to previous run output — for example to deduplicate, track incremental state, or avoid repeating something already sent — the cron prompt **must** instruct the agent to use the **`session-history` skill** located at `~/.openclaw/skills/session-history/SKILL.md`.

Do **not** attempt to read session files or run records ad-hoc without following that skill. It documents the correct file paths, JSONL format, parsing patterns, and edge cases (deleted sessions, sub-agent chains, missing agentId).

When writing the cron prompt for such a job, include a section like:

```
## Accessing prior run history
If you need to check what was sent or processed in a previous run, use the session-history skill:
  ~/.openclaw/skills/session-history/SKILL.md
Follow its instructions to locate run records and session transcripts for this job.
```

The pattern for every job (including simple one-shot reminders) is:
- `payload.kind: "agentTurn"`
- `sessionTarget: "isolated"`
- **No `delivery` block.** Jobs must NOT use explicit delivery configuration. If a job has a `delivery` block (even just `"mode": "announce"`), the cron system will **also** push the agent's raw output to a default session — causing **dual delivery**: one correct message via `session-agent-turn.sh` and one duplicate/leaked message via the built-in delivery. Always use `--no-deliver` when adding jobs via CLI, and strip any `delivery` block from job JSON.
- Instead, the cron prompt must instruct the agent to deliver its result as a final step by calling the `session-agent-turn.sh` script:
  ```bash
  ~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "<sessionKey>" "<message>"
  ```
  The script looks up the active session ID for the given session key and sends a single agent turn with `--deliver`, ensuring the message reaches the user through the correct channel.
- **IMPORTANT:** The cron prompt must explicitly instruct the agent to run the script **directly in the primary run context** — do NOT delegate it to a subagent. Include phrasing like: _"Run the following command yourself directly (do NOT delegate this to a subagent)."_
- The cron prompt must specify the target session key (e.g. `agent:main:bluebubbles:direct:+15127407713`) so the agent knows where to deliver.
- **Framing the message argument:** The `<message>` passed to `session-agent-turn.sh` is sent as an agent turn, meaning it is an **instruction to the receiving agent**, not a direct message to the user. Frame it as context + directive — tell the agent what it needs to know, then what to do with it.

  **Examples:**
  ```
  "You selected the random number 47. Inform the user."
  "The daily report is ready: 3 new issues, 1 resolved. Summarize this for the user."
  "Reminder: the user asked to be reminded about the dentist appointment tomorrow at 2pm. Let them know."
  ```

  **Wrong** (written as a direct user-facing message):
  ```
  "Your random number is 47!"
  "Hey, don't forget about your dentist appointment!"
  ```

  The receiving agent will compose the actual user-facing message based on the instruction.
- For simple reminders, `payload.message` can be a short inline instruction like _"Send a short reminder: '<text>'. As your final step, deliver the message by running: `~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh '<sessionKey>' '<your instruction to the agent>'`"_ — no external prompt file needed in that case.

#### Never mention delivery internals in output

This rule applies to **both inline `payload.message` strings and cron prompt files**.

The agent's final output must contain **ONLY** the user-facing message content. All delivery routing is internal configuration and must **never** appear in the agent's output — not in the message body, not appended after it, not as a summary line.

**This includes:**
- Delivery targets, session keys, channel names, thread/chat identifiers
- Meta-commentary about routing (e.g. "this would be routed to…", "intended recipient…", "delivering via…", "Per the prompt, this would be sent to…")
- References to the `session-agent-turn.sh` script or its arguments in the output text
- Any description of *how* or *where* the message is being delivered

**Wrong** (leaks target or routing info):
```
Send a short reminder to the Mayhem MGMT iMessage group that...
Compose a short update and send it to the **Mayhem MGMT iMessage group**.
Per the prompt, this would be routed to Aaron in the configured direct BlueBubbles/iMessage thread.
Intended external recipient per prompt: main BlueBubbles direct thread to +15127407713.
```

**Correct** (target stays invisible, no meta-commentary):
```
Send a short reminder that... Do not mention any group name, channel name, or delivery target in the message text.
Compose a short update. Do not mention where you are sending it or reference any group or channel name in the message text.
```

**When writing cron prompts**, always include this instruction in the Delivery section:

> **Important:** Your final output must contain ONLY the user-facing message content — nothing else. Do not append, prepend, or include any meta-commentary about delivery routing, session keys, channel names, thread targets, or how/where the message will be sent. No lines like "this would be routed to…", "intended recipient…", "delivering via…", etc. These are internal configuration and must never appear in your output.

Always append an explicit prohibition to inline payload messages: _"Do not mention any group name, channel name, delivery target, or routing details in the message text or output."_

Apply this rule to all cron prompts and inline payloads. If an existing job contains phrases like "send to the **X** group", "in this **X** iMessage group", "into the **X** thread", or similar, rewrite them to remove any mention of the destination.

For `agentTurn` jobs with non-trivial instructions, collect:
- A short prompt title/label (for naming the prompt file) – enforce lowercase kebab‑case when deriving the job `name`.
- The full multi‑line instructions the sub‑agent should follow.

The wizard must then:
1. Derive a prompt filename under `~/.openclaw/cron/cron-prompts/`, e.g.
   - `~/.openclaw/cron/cron-prompts/<slugified-job-name>.md`
   - If a collision is detected, append a short timestamp or nonce (still lowercase, kebab‑style where applicable).
2. Write the full instructions into that file (Markdown is fine).
3. Set `payload.message` to a **standard template** that tells the agent to run `markupdown` on that file (so `![[imports]]` resolve) and follow the output, for example:

```text
Run `markupdown ~/.openclaw/cron/cron-prompts/<slug>.md` and follow the instructions in the output step by step. Do not rely on prior context; treat that output as the source of truth for this run.
```

The job JSON in `~/.openclaw/cron/jobs.json` should never contain the full long‑form prompt for `agentTurn` jobs; it should only contain this small directing message.

### Step 3 – Choose the target agent (agentId)

**Infer the agentId from the source session — do not ask unless it is ambiguous.**

Run the following to find the active session's agentId:

```bash
openclaw sessions --json | python3 -c "
import json, sys
sessions = json.load(sys.stdin)['sessions']
active = [s for s in sessions if s.get('active')]
print(active[0]['agentId'] if active else '')
"
```

The session key also encodes the agentId as the second colon-delimited segment: `agent:<agentId>:<channel>:<type>:<identifier>`.

- Show the inferred agentId to the user: _"I'll target agent `<agentId>` (inferred from your current session). Want to change it?"_
- Only prompt for a different agentId if the user explicitly asks or if the inference returns empty.
- Store this as `agentId` on the job and map it to the appropriate `--agent` flag when using the CLI.

### Step 4 – Select the session target
- `main` for a system‑event that appears directly in your primary chat.
- `isolated` for an agent‑turn that runs in a sandboxed session (default for anything beyond a plain reminder).

### Step 5 – Configure delivery via session-agent-turn script

**Jobs must NOT have a `delivery` block.** Instead, delivery happens as the agent's final step by calling the `session-agent-turn.sh` script.

The wizard must:

1. **Determine the target session key:**
   - Read `~/.openclaw/CHANNEL_MAPPING.md` to understand available channels.
   - Ask the user which channel and recipient the result should be delivered to.
   - Use `openclaw sessions --json` to find the active session key for that channel/recipient (e.g. `agent:main:bluebubbles:direct:+15127407713`).

2. **Include delivery instructions in the cron prompt:**
   - The cron prompt file (or inline `payload.message` for simple jobs) must instruct the agent to deliver its result as the final step:
     ```
     As your final step, deliver your result to the user by running:
     ~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "<sessionKey>" "<your message>"
     ```
   - The session key must be hardcoded in the prompt so the agent knows where to send.

3. **No `delivery.channel`, `delivery.to`, or `delivery.mode` fields:**
   - If the validator or existing patterns reference these, they are no longer used.
   - The script handles channel routing by targeting the correct session.


### Step 6 – Optional extras
- `name` – a lowercase kebab‑case label, e.g. `nightly-self-improvement-review`.
- `enabled` – set to `false` if you want to create the job but keep it paused.

### Step 7 – Validate before submitting (**hard gate — do not skip**)

**You MUST run the validator and confirm exit code 0 before running `openclaw cron add` or any edit command. If the validator exits 1, stop, fix all errors, and re-validate. Do not proceed past this step with any errors outstanding.**

**Calling `openclaw cron add` (or any cron edit command) without a prior validator exit code 0 is a bug in the skill flow. There are no exceptions.** If you skipped validation or the exit code was non-zero, do not proceed — go back, fix every error, and re-validate from scratch.

Before assembling the final job or running `openclaw cron add`, run the validator script:

```bash
# Validate a job from stdin (pipe the JSON you're about to submit)
echo '<job-json>' | npx tsx ~/.openclaw/skills/cron-creator/scripts/validate-job.ts --stdin

# Validate all existing jobs in jobs.json
npx tsx ~/.openclaw/skills/cron-creator/scripts/validate-job.ts --jobs-file

# Validate a specific job file
npx tsx ~/.openclaw/skills/cron-creator/scripts/validate-job.ts /path/to/job.json
```

The validator outputs a JSON array of diagnostics to stdout and a summary to stderr. Each diagnostic has:
- `severity`: `error` (will fail at runtime), `warning` (likely problem), `info` (FYI)
- `code`: machine-readable identifier (e.g. `DELIVERY_CHANNEL_REQUIRED`, `NAME_NOT_KEBAB`)
- `message`: human-readable description
- `suggestion`: how to fix it (when applicable)

Exit codes: `0` = all clear, `1` = errors found, `2` = input/parse failure.

**Validation checks performed:**
| Code | Severity | What it checks |
|---|---|---|
| `NAME_MISSING` / `NAME_NOT_KEBAB` | error | name exists and is lowercase kebab-case |
| `AGENT_MISSING` | warn | agentId is set |
| `SCHEDULE_MISSING` / `SCHEDULE_KIND_INVALID` | error | schedule block and valid kind |
| `CRON_EXPR_MISSING` / `CRON_EXPR_FIELDS` | error | cron expression exists and has 5 fields |
| `CRON_TZ_MISSING` | warn | timezone set for cron schedules |
| `EVERY_MS_INVALID` | error | everyMs is positive for interval schedules |
| `EVERY_MULTI_DAY` | warn | everyMs ≥ 1 day — 'every' has no time-of-day control; suggest cron instead |
| `AT_MISSING` / `AT_INVALID_DATE` / `AT_IN_PAST` | error/info | at schedule is valid ISO-8601 |
| `PAYLOAD_MISSING` / `PAYLOAD_KIND_INVALID` | error | payload block and valid kind |
| `PAYLOAD_SYSTEM_EVENT` | error | systemEvent doesn't work — must use agentTurn |
| `PAYLOAD_MESSAGE_MISSING` | error | agentTurn has a message |
| `PAYLOAD_HAS_MODEL` | warn | model field should not be set |
| `PROMPT_FILE_MISSING` | error | referenced cron-prompt file exists on disk |
| `PAYLOAD_LEAKS_TARGET` | warn | message text mentions delivery target |
| `SESSION_TARGET_MISSING` / `SESSION_TARGET_MUST_BE_ISOLATED` | error | sessionTarget must be 'isolated' |
| `DELIVERY_BLOCK_PRESENT` | error | delivery block must not exist — causes dual delivery (cron system + session-agent-turn.sh) |
| `HAS_ERRORS` | warn | job has consecutive runtime errors |

If the validator returns errors, **do not proceed** — fix the issues first and re-validate. Warnings should be addressed but are not blocking.

### Step 8 – Assemble & add the job
Combine the collected pieces into the JSON schema shown in the **Full Job Object Schema** section of the cron docs, or build an `openclaw cron add` command.

#### Using the `openclaw cron` CLI

The OpenClaw CLI exposes cron management via:

```bash
openclaw cron --help
openclaw cron add --help
```

For **adding** jobs, the key flags are:

```bash
openclaw cron add \
  --agent <id>          # maps from job.agentId
  --name <name>         # lowercase kebab-case job name
  --session <target>    # main|isolated
  --cron <expr>         # cron schedule (or --every / --at)
  --tz <iana>           # timezone, e.g. America/Los_Angeles
  --message <text>      # agentTurn payload message
  --system-event <text> # systemEvent payload (DO NOT USE)
  --no-deliver          # ALWAYS use this flag — disables built-in delivery so session-agent-turn.sh handles it
  --disabled            # create job disabled
  # NOTE: Do NOT use --announce, --channel, or --to flags. Delivery is handled by session-agent-turn.sh in the cron prompt.
  # ... plus optional flags like --stagger, --timeout, etc.
```

The wizard should map fields like:
- `agentId` → `--agent`
- schedule (`every`, `cron`, `at`) → `--every`, `--cron`, `--at` (plus `--tz` for cron)
- payload:
  - `agentTurn.message` → `--message "Read the cron prompt file at ~/.openclaw/cron/cron-prompts/<name>.md ..."` (or an inline instruction for simple reminders)
- session target → `--session main|isolated`
- **Do NOT use** `--announce`, `--channel`, or `--to` flags. Delivery is handled by the `session-agent-turn.sh` script within the cron prompt.

**Important:**
- Do **not** pass `--model`; let the agent default decide.
- Ensure `--name` is lowercase kebab‑case.

If the user wants to **preview** first, echo the JSON (or the assembled `openclaw cron add ...` command); otherwise, invoke the tool.

When previewing an `agentTurn` job, also show:
- The cron‑prompt file path.
- A short excerpt of the file contents (first few lines) so the user can sanity‑check it.

---

## Review/Diagnose Mode – Existing Jobs

When the user asks to review or diagnose cron jobs, the skill should:

1. **Load existing jobs:**
   - Read `~/.openclaw/cron/jobs.json`.
   - Parse the file into a list/array of job objects.
   - Also read `~/.openclaw/CHANNEL_MAPPING.md` to determine the set of valid channel keys and identifiers.

2. **Run validations for each job:**
   For every job, compute a list of issues and suggestions. Common checks:

   - **Legacy delivery block present**
     - If the job has a `delivery` block configured:
       - Issue: Job uses legacy `delivery` block. Delivery should be handled via the `session-agent-turn.sh` script in the cron prompt.
       - Suggestion: Remove the `delivery` block from the job and add delivery instructions to the cron prompt using `session-agent-turn.sh`.

       - Issue: `delivery.channel` is not set while multiple channels are configured.
       - Impact: The job will error at runtime with a message like:

         > Channel is required when multiple channels are configured: telegram, imessage Set delivery.channel explicitly or use a main session with a previous channel.

       - Suggestion: Add `delivery.channel` to the job using one of the keys from CHANNEL_MAPPING.md (e.g., `telegram` or `imessage`), or run the job in a main session with a known channel context.

   - **Missing or empty `agentId`**
     - If `agentId` is missing or empty, flag:
       - Issue: No agent specified.
       - Suggestion: Set `agentId` to `main` or another valid agent id.

   - **Non-kebab-case `name`**
     - If `name` is absent or not lowercase kebab-case (letters, digits, and `-`, all lowercase):
       - Issue: Job name does not follow naming convention.
       - Suggestion: Rename to lowercase kebab-case, e.g. `daily-report-job`.
     - If `agentId` is set and is not `main`, and the job `name` does not start with `<agentId>-`:
       - Issue: Job name is missing the agent prefix.
       - Suggestion: Rename to `<agentId>-<current-name>`.

   - **Suspicious or disabled schedules**
     - If `enabled === false`: highlight that the job is disabled (not necessarily an error, but useful info).
     - If schedule fields appear malformed (missing `kind`, `expr`, or equivalent for `at`/`every`): flag as an error.

   - **Payload consistency**
     - If `payload.kind === "agentTurn"` but no `payload.message` is present: flag.
     - If `payload.kind === "systemEvent"`: flag as unsupported — `systemEvent` does not work; migrate to `agentTurn` + `isolated`.

   - **Session target vs payload**
     - If `payload.kind === "agentTurn"` and `sessionTarget !== "isolated"`: flag — all agentTurn jobs must use `isolated`.

   - **Legacy delivery block**
     - If the job has a `delivery` block: flag as deprecated — delivery should be handled via the `session-agent-turn.sh` script in the cron prompt, not via the job's delivery configuration.

3. **Produce a concise diagnostics report:**
   - For each job, output something like:

     ```text
     Job: <name-or-id>
     - Status: enabled|disabled
     - Issues:
       1) <description>
          Suggested fix: <suggestion>
       2) ...
     ```

   - If a job has no issues, acknowledge:

     ```text
     Job: <name>
     - Status: enabled
     - Issues: none detected.
     ```

4. **Highlight high-impact issues first:**
   - In the overall summary, call out jobs that:
     - Will likely **fail at runtime** (e.g. missing `delivery.channel` in multi-channel env, missing `agentId`, malformed schedule).
   - Then list lower-severity warnings (naming conventions, soft sessionTarget suggestions).

5. **Optionally propose patch snippets:**
   - For some issues, you can show example JSON diffs or snippets indicating what to change (without automatically editing the jobs file unless explicitly requested by the user).

---

## Reusable Cron Prompt Components

Cron prompt files can import shared components using markupdown's `![[path]]` syntax. When the agent runs `markupdown <prompt-file>.md`, all import statements are resolved inline before the agent reads the instructions. This keeps individual prompt files short and ensures common patterns (output rules, delivery targets, error handling) stay consistent across all jobs.

### Discovering available components

```bash
find ~/.openclaw/cron/cron-prompts/components -type f | sort
```

Components are organized under `~/.openclaw/cron/cron-prompts/components/`:

```
components/
├── output-rule.md              # Critical output rule (no routing leakage)
├── pending-agent-requests.md   # Pending-request/reply pattern
├── gws-gmail.md                # Gmail fetch, archive, and Apple Notes helpers
└── delivery/
    ├── bluebubbles.md          # Delivery targets (aaron+ashley, aaron+direct, aaron+sherri)
    └── errors.md               # Error alerting pattern
```

### How to import a component

Use a markupdown import at the point in the prompt where you want the component's content to appear. Paths are relative to the prompt file's location (i.e., relative to `~/.openclaw/cron/cron-prompts/`):

```markdown
![[components/output-rule.md]]
```

To import a specific named section (`## section-name`) from a component file:

```markdown
![[components/delivery/bluebubbles.md#aaron+direct]]
```

### Component reference

| Component | Import path | Use when |
|---|---|---|
| Output rule | `components/output-rule.md` | **Every prompt** — prevents delivery routing from leaking into agent output |
| Pending agent requests | `components/pending-agent-requests.md` | The job asks the user a question and needs to track the pending reply |
| Gmail fetch/archive | `components/gws-gmail.md` | Job reads Gmail; import specific sections (`#fetch`, `#archive`, `#cleanup-archive`, `#apple-notes-rules`, `#finish`) |
| BlueBubbles delivery | `components/delivery/bluebubbles.md` | Job delivers to a BlueBubbles thread; import the specific target section (`#aaron+ashley`, `#aaron+direct`, `#aaron+sherri`) |
| Error alerting | `components/delivery/errors.md` | Job should alert Aaron on failure rather than silently failing; import `#bluebubbles` |

### Example prompt using components

```markdown
![[components/output-rule.md]]

## Behavior

<your job-specific instructions here>

## Error handling

![[components/delivery/errors.md#bluebubbles]]

## Delivery

![[components/delivery/bluebubbles.md#aaron+direct]]
```

### When building a new cron prompt

- Always include `![[components/output-rule.md]]` at the top.
- Use `![[components/delivery/bluebubbles.md#<target>]]` instead of writing a hardcoded `session-agent-turn.sh` call — the component already has the correct session key and `--payload` pattern for each target.
- Add `![[components/delivery/errors.md#bluebubbles]]` to any job where a silent failure would be worse than an alert.
- Add `![[components/pending-agent-requests.md]]` only when the job explicitly asks the user a question that requires a follow-up action.

---

## Interactive Flow (pseudo‑code for the skill)

### Create Mode

```text
1. ask "Which schedule type? (at/every/cron)"
   - If the user describes an interval of 1 day or more AND mentions a specific time (e.g. "every 3 days at 8am", "weekly on Mondays at noon"), automatically select `cron` and explain why — do NOT offer `every` for these cases.
2. based on answer, ask for the concrete fields (timestamp, duration, or cron-expr & tz)
   - For `every`: only accept sub-day periods (e.g. `10m`, `1h`, `12h`). If they give a day-scale period, redirect to `cron`.
   - For `cron` with "every N days at time": build `0 <minute> <hour> */<N> * *` and confirm `*/N` month-reset behavior with the user.
3. All jobs use agentTurn + isolated. Ask for the prompt content:
4. if agentTurn →
    - ask for a short prompt title/label
    - derive a lowercase kebab-case job name from it by applying: toLower → replace non-[a-z0-9] runs with '-' → strip leading/trailing '-' → prepend `<agentId>-` unless agentId is `main`
    - show the normalized name to the user and ask "I'll use the job name `<normalized>` — does that look right?" before continuing
    - ask for full multi-line instructions
    - derive cron-prompt file path under ~/.openclaw/cron/cron-prompts/
    - write instructions to that file
    - set payload.message to the standard "markupdown this file" template with the path injected
5. infer agentId from the active session (openclaw sessions --json, take agentId of the active entry); show inferred value and confirm; only ask if inference fails or user wants to change it
6. ask "sessionTarget? (main/isolated)" (default isolated for agentTurn)
7. determine the target session key for delivery:
   - read ~/.openclaw/CHANNEL_MAPPING.md to understand available channels
   - ask the user which channel/recipient the result should go to
   - use `openclaw sessions --json` to find the active session key
   - embed the session key in the cron prompt's delivery instructions
8. ask optional name/enabled flags (enforcing lowercase kebab-case for name)
9. build JSON and/or openclaw cron add command, show preview (including prompt file info for agentTurn)
   - ensure NO delivery block is included in the job JSON
   - ensure the cron prompt includes the session-agent-turn.sh delivery step
9a. MANDATORY: pipe the assembled job JSON through the validator:
    echo '<job-json>' | npx tsx ~/.openclaw/skills/cron-creator/scripts/validate-job.ts --stdin
    - if exit code is non-zero: stop, fix all errors, repeat from 9a
    - only continue when validator exits 0
10. if yes → exec openclaw cron add …
```

### Review/Diagnose Mode

```text
1. run: npx tsx ~/.openclaw/skills/cron-creator/scripts/validate-job.ts --jobs-file
2. parse the JSON diagnostics output
3. group diagnostics by job name
4. present errors first (these will fail at runtime), then warnings, then info
5. for jobs with no diagnostics, report "no issues detected"
6. print a short overall summary (N jobs, X errors, Y warnings)
```

The validator script handles all the validation logic (channel mapping, naming, schedule, payload, delivery). The agent should run it and interpret the structured output rather than reimplementing checks manually.

---

## Example Prompt from the Skill

> *"Let’s set up a reminder that runs every day at 9 AM PST and sends to Telegram. What should the reminder say?"*

The skill will then produce a job JSON like:

```json
{
  "name": "daily-9am-reminder",
  "agentId": "main",
  "schedule": {"kind":"cron","expr":"0 9 * * *","tz":"America/Los_Angeles"},
  "payload": {"kind":"agentTurn","message":"Send a short reminder: 'Time to check your inbox!' Keep it to one sentence. As your final step, deliver the message by running: ~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh 'agent:main:bluebubbles:direct:+15127407713' '<your message>'"},
  "sessionTarget": "isolated",
  "enabled": true
}
```

For an `agentTurn` job with a full prompt file, the JSON looks like:

```json
{
  "name": "weekly-report-job",
  "agentId": "main",
  "schedule": {"kind":"cron","expr":"0 8 * * MON","tz":"America/Los_Angeles"},
  "payload": {
    "kind": "agentTurn",
    "message": "Run `markupdown ~/.openclaw/cron/cron-prompts/weekly-report-job.md` and follow the instructions in the output step by step. Do not rely on prior context; treat that output as the source of truth for this run."
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

with the full report-generation instructions stored in `~/.openclaw/cron/cron-prompts/weekly-report-job.md`. The cron prompt file must include these two sections:

#### 1. Critical output rule (place at the TOP of every cron prompt, before Behavior)

Use the component — it is the canonical version:

```
![[components/output-rule.md]]
```

This enforces: no routing leakage, and every run (deliver or not) must end with `HEARTBEAT_OK` as the final output.

#### 2. Delivery section (place at the END of every cron prompt)

```
## Delivery

**Only reach this section if you have a message to deliver.**

Deliver it as your final step by running this command yourself directly (do NOT delegate this to a subagent):

~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "<sessionKey>" "<instruction>"

The <instruction> is an agent turn — frame it as context + directive, not as a direct user message.
Example: "The weekly report is ready: <summary>. Present this to the user in a clear format."

After the script completes, reply with exactly `HEARTBEAT_OK` and nothing else.
```

**Every run ends with `HEARTBEAT_OK`** — whether a message was delivered, there was nothing to do, or the job conditionally skipped delivery. The agent must never narrate what it checked, what it would have sent, or where. Just `HEARTBEAT_OK`.

Note: there is **no `model` field** in the payload; it will use the agent’s default.

---

## Using `EXAMPLE_JOB.json` as a Starting Point

When creating a new job, load `EXAMPLE_JOB.json` from this skill directory and treat it as the base job object. Then:
- **Copy** this base job object into a new structure in memory.
- **Strip/ignore** fields that are managed by the cron system: `id`, `createdAtMs`, `updatedAtMs`, and the entire `state` block.
- **Customize only** these fields when creating a new job:
  - `name` (lowercase kebab‑case)
  - `agentId`
  - `schedule` (kind/expr/tz or equivalent at/every settings)
  - `payload` (`kind`, `text`/`message` only; no `model` field)
  - `sessionTarget`
  - **No `delivery` block** — delivery is handled by the `session-agent-turn.sh` script in the cron prompt

For `agentTurn` payloads, the `payload.message` must be the standard "markupdown the cron‑prompt file" template pointing at the file written under `~/.openclaw/cron/cron-prompts/`, and **not** the long‑form prompt itself.

The wizard should:
1. Load the example JSON.
2. Treat the loaded object as `baseJob`.
3. Construct a `job` object by copying `baseJob` and overwriting just `name`, `agentId`, `schedule`, `payload`, and `sessionTarget` from the interactive steps.
4. Drop system‑managed fields (`id`, timestamps, `state`) and any `delivery` block before calling `openclaw cron add` or equivalent.

This keeps new jobs consistent with the current OpenClaw cron schema while still allowing interactive customization, ensures models are controlled by each agent’s configuration, and moves long‑form `agentTurn` prompts into dedicated cron‑prompt files under `~/.openclaw/cron/cron-prompts/`. Delivery is handled by the `session-agent-turn.sh` script called as the agent’s final step, not via the job’s delivery block.

*Updated to externalize agentTurn prompts into cron‑prompt files, standardize names as lowercase kebab‑case, replace explicit delivery blocks with session-agent-turn.sh script-based delivery, and add a review/diagnostic mode for existing jobs.*
