# mayhem-reminder-enforcer

## Goal

Enforce that all cron jobs in `~/.openclaw/cron/jobs.json` are valid and conformant, and that time-based reminders mentioned in the Mayhem MGMT iMessage group have a backing cron job.

This agent does two things each run:

1. **Validate all existing cron jobs** using the cron-creator skill's validator.
2. **Scan recent Mayhem MGMT messages** for unmatched time-based reminder requests and create cron jobs for them.

**Output rule:** Only send a message to the chat if cron jobs were created or modified during this run. If nothing changed, produce no output at all.

---

## Phase 1 — Validate and fix existing cron jobs

### Step 1: Run the validator

```bash
npx tsx ~/.openclaw/skills/cron-creator/validate-job.ts --jobs-file
```

This outputs a JSON array of diagnostics. Each diagnostic has `severity` (error/warning/info), `code`, `jobName`, `message`, and `suggestion`.

### Step 2: Auto-fix clear violations

For each **error**-severity diagnostic, determine if the fix is unambiguous. Apply the fix directly to `~/.openclaw/cron/jobs.json` when the correction is obvious:

| Code | Auto-fix |
|---|---|
| `SESSION_TARGET_MUST_BE_ISOLATED` | Set `sessionTarget` to `"isolated"` |
| `NAME_NOT_KEBAB` | Lowercase and kebab-case the name |
| `DELIVERY_TO_BAD_FORMAT` | Replace `imessage:chat_id:<UUID>` with the correct `chat_id:N` from the validator's suggestion |
| `IMSG_CHAT_NOT_FOUND` | Fix if the suggestion makes the correct target obvious (e.g. only one chat matches the job's intent) |
| `PAYLOAD_SYSTEM_EVENT` | Migrate to `agentTurn` + `isolated` if the job has a clear text payload |
| `PAYLOAD_HAS_MODEL` | Remove the `model` field from payload |
| `CRON_TZ_MISSING` | Add `"tz": "America/Los_Angeles"` |

**Do not auto-fix** if:
- The correct value is ambiguous (e.g. multiple possible chat targets).
- The fix would change the job's intent.
- The diagnostic is only a warning or info (leave those alone unless they're trivially fixable alongside an error).

### Step 3: Re-validate after fixes

After modifying jobs.json, run the validator again to confirm the fixes resolved the errors:

```bash
npx tsx ~/.openclaw/skills/cron-creator/validate-job.ts --jobs-file
```

Track what you changed (job name + what was fixed) for the summary message.

---

## Phase 2 — Detect and create missing reminder crons

### Step 1: Read recent Mayhem MGMT messages

Use the `session-history` skill at `~/.openclaw/skills/session-history/SKILL.md` to fetch the last 2 hours of messages from the Mayhem MGMT iMessage group.

- Chat mapping: see `~/.openclaw/CHANNEL_MAPPING.md`
- Delivery target for Mayhem MGMT: BlueBubbles session key `agent:main:bluebubbles:group:any;+;bc2201f817d34f7da609764bf73c4ffb` via session-agent-turn helper

### Step 2: Identify time-based reminder requests

Look for messages where someone asks to be reminded at a specific time or interval:

- Explicit times: "remind me at 3pm", "at 7:30am tomorrow"
- Relative intervals: "in 20 minutes", "in an hour"
- Repeating: "every morning at 8", "once a week"

**Ignore** vague mentions like "we should do that sometime" or "one day remind me" without a concrete time.

### Step 3: Check for existing backing cron

For each detected reminder, check `~/.openclaw/cron/jobs.json` for a matching job by comparing schedule timing, delivery target, and payload intent. If a matching job exists and hasn't expired, the reminder is backed — skip it.

### Step 4: Create missing cron jobs

For unmatched reminders where the time is still in the future, create a new cron job. **You MUST follow the cron-creator skill** at `~/.openclaw/skills/cron-creator/SKILL.md`:

- `payload.kind: "agentTurn"`, `sessionTarget: "isolated"`
- `delivery.mode: "none"` — delivery is handled inside the payload via the session-agent-turn helper
- For one-shot reminders: `schedule.kind: "at"` with ISO-8601 UTC, `deleteAfterRun: true`
- For repeating: `schedule.kind: "cron"` with tz `America/Los_Angeles`, or `schedule.kind: "every"`
- Name must be lowercase kebab-case
- Do NOT set `payload.model`
- The `payload.message` must instruct the agent to compose the reminder and then deliver it by running:
  ```bash
  ~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "agent:main:bluebubbles:group:any;+;bc2201f817d34f7da609764bf73c4ffb" "<instruction to receiving agent>"
  ```
  Frame the instruction as: "Here is the reminder: <reminder text>. Present this to the user exactly as written."
  Append to the payload message: "Do not mention any group name, channel name, or delivery target in the reminder text itself."

### Step 5: Validate new jobs before submitting

Pipe each new job through the validator before adding it:

```bash
echo '<job-json>' | npx tsx ~/.openclaw/skills/cron-creator/validate-job.ts --stdin
```

Only submit if exit code is 0 (no errors). If validation fails, do not create the job and do not message the chat about it.

---

## Output rules

**All output goes to `~/.openclaw/cron/enforcement.md`** — do NOT send messages to the Mayhem MGMT iMessage group.

Append a timestamped entry to `~/.openclaw/cron/enforcement.md` for every run, using this format:

```markdown
## YYYY-MM-DD HH:MM PT

**Phase 1 — Validation**
- Errors found: N (list job names + codes if any)
- Auto-fixes applied: N (list what was fixed if any)

**Phase 2 — Reminder scan**
- Messages scanned: N
- Reminder candidates found: N
- New crons created: N (list names if any)

**Result:** No changes / Summary of changes
```

If nothing changed, still log the entry — the file serves as an audit trail.

---

## Delivery

**Only reach this section if any auto-fixes were applied or new cron jobs were created.**

![[components/delivery/bluebubbles.md#aaron+direct]]

**If nothing changed**, respond with `HEARTBEAT_OK` and nothing else. Do not narrate what was checked or what the enforcement log says.

## Safety

- Do not delete cron jobs. Only modify fields to fix validation errors.
- Do not change a job's schedule, delivery target, or payload intent — only fix structural/format issues.
- If uncertain whether a fix is correct, skip it.
- Prefer no action over a wrong action.
