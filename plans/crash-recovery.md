# Crash Recovery for Interrupted Agent Runs

## Problem

When the gateway process restarts, `recoverStaleRuns()` in `src/scheduler/engine.ts:102-108` marks every
`running` job run as `error: "Gateway restarted while job was running"`. No actual recovery happens — the
Flue dispatch is abandoned and the job waits until its next scheduled fire.

For long-running or infrequent jobs this is a meaningful loss. A job that was 90% done gets re-scheduled
for tomorrow.

---

## What Flue Already Provides

Flue's runtime has the infrastructure for durability, but none of it is wired up:

- **`DurabilityConfig`** on `defineAgentProfile` — `{ maxAttempts?: number, timeoutMs?: number }` — auto-retries
  interrupted LLM-level submissions within the same process life.
- **`getRun(dispatchId)`** — queries the SQLite-backed run store (`flue.db`) for a run's current status:
  `'active' | 'completed' | 'errored'`.
- **`SubmissionInterruptedError` / `SubmissionRetryExhaustedError`** — surfaced when Flue's durability budget
  is exhausted.

The `dispatch_id` field in `raven_job_runs` is the Flue dispatch ID, so `getRun` can be called against it
on restart to determine what actually happened before the process died.

---

## Layers of Work

### Layer 1 — `durability` on agent profiles (trivial)

Add `durability: { maxAttempts: 3 }` to each `defineAgentProfile` call in `src/agents/*.ts`.

This handles LLM-level retries within a single process life (e.g. transient model errors, brief
interruptions). It does **not** survive a full process restart — the `observe()` listener is gone.

**Effort**: ~5 lines per agent, no schema changes.

---

### Layer 2 — Use `getRun` to classify stale runs on startup (moderate)

Change `recoverStaleRuns()` in `src/scheduler/engine.ts` from unconditionally marking runs as `error` to
checking Flue's run store first:

```
for each stale run:
  if run.dispatch_id exists:
    const flueRun = await getRun(run.dispatch_id)
    if flueRun.status === 'completed' → mark our run as 'ok', advance the job
    if flueRun.status === 'errored'   → mark our run as 'error' (already correct)
    if flueRun.status === 'active'    → dispatch died mid-run; attempt re-fire (see Layer 3)
    if flueRun === null               → dispatch never started; attempt re-fire
  else:
    if run.assembled_prompt exists    → attempt re-fire from assembled prompt
    else                              → mark error (job never reached dispatch phase)
```

The most valuable case here is catching runs that **completed** in Flue but whose results weren't recorded
in our DB (e.g. process died between `finishRun` and `advanceJob`). Those become a no-op recovery instead
of a spurious failure.

**Effort**: ~50-80 lines in `recoverStaleRuns()`. No schema changes required.

---

### Layer 3 — Re-fire interrupted runs (moderate, risk of duplication)

When Layer 2 determines a run should be re-fired, replay it using the stored `assembled_prompt` column.

The `assembled_prompt` is written to `raven_job_runs` before dispatch (`engine.ts:315`), so for any run
that reached the dispatch phase we have the full assembled prompt to replay.

Key constraint: re-firing creates a **new dispatch** against the same job and same assembled prompt. This
is safe for the **work phase** (idempotent reads, calendar queries, weather lookups, etc.) but potentially
unsafe for **delivery** — if the process died after delivery already sent a message, re-running the whole
job would send it again.

**Effort**: ~30 lines in engine startup + modify `recoverStaleRuns()` return type to signal which runs to
re-fire. No schema changes.

---

### Layer 4 — Delivery-phase idempotency (hard)

The two-phase structure (`job.dispatch` → `job.deliver`) is the core obstacle to fully safe recovery. There
is currently no way to tell, after a restart, whether the delivery step ran to completion.

**The gap**: `raven_job_runs` has `dispatch_id` (for the work phase) but no column for the delivery
dispatch ID. If the process dies between the two phases, Layer 3 will re-run delivery and send a duplicate
message.

**Options**:

**A. Store delivery dispatch ID** (schema migration)
- Add `delivery_dispatch_id TEXT` column to `raven_job_runs`.
- Write it before calling `dispatchAndCollect` for delivery (`engine.ts:332`).
- On recovery, call `getRun(delivery_dispatch_id)` — if `completed`, skip delivery entirely.
- Clean and correct. Requires a schema migration.

**B. Delivery-phase status column** (schema migration, simpler)
- Add `delivery_status TEXT` column (values: `null | 'running' | 'ok' | 'error'`).
- Write `'running'` before delivery starts, `'ok'` after `sendToConversation` succeeds.
- On recovery: if `delivery_status = 'ok'`, mark run as done and skip. If `'running'`, re-run delivery.
- Simpler than option A since it doesn't require a Flue API call.

**C. Idempotency at the channel level** (complex, out of scope)
- Telegram and iMessage deduplicate messages by content+timestamp or by a message ID.
- Would require changes to `src/deliver.ts` and channel adapters.

**Recommendation**: Option B (delivery status column) is the simplest path to safe full recovery.

**Effort**: Schema migration + ~20 lines in `engine.ts`. Moderate.

---

## Recommended Sequence

1. **Layer 2** first — highest value, no risk. Stops marking completed jobs as failed after restart.
2. **Layer 1** — trivial quality improvement, add alongside or after Layer 2.
3. **Layer 4B** — schema migration for delivery status column.
4. **Layer 3** — re-fire logic, gated on Layer 4B being in place to prevent duplicate delivery.

Don't implement Layer 3 without Layer 4B. Re-firing without delivery idempotency will send duplicate
messages for any run that died mid-delivery.

---

## Files to Touch

| File | Change |
|------|--------|
| `src/scheduler/engine.ts` | `recoverStaleRuns()` — Layer 2 + 3 logic |
| `src/scheduler/db.ts` | `getStaleRunning()` already exists; add migration for `delivery_status` column (Layer 4B) |
| `src/agents/raven-lead.ts` | Add `durability` to `defineAgentProfile` (Layer 1) |
| `src/agents/*.ts` | Same for other agents (Layer 1) |

---

## Open Questions

- Does `getRun()` from `@flue/runtime` work reliably at process startup before the Flue app is fully
  initialized? May need to ensure `getDb()` / Flue runtime init runs before `recoverStaleRuns()`.
- For jobs that completed in Flue but whose results were never delivered (work phase ok, deliver phase
  never ran), should we re-deliver on restart? Probably yes, but requires knowing the job result — it
  isn't stored in `raven_job_runs` currently.
