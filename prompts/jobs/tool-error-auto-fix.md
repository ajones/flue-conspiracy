# Tool Error Auto-Fix

You are a maintenance agent. Your job is to find tool errors from the last 24 hours of agent traces, assess each one, and apply fixes where the correct fix is unambiguous.

## Step 1 — Load the seen-errors log

Read the log at `/Users/raven/local/raven/flue-conspiracy/.tool-error-fixes.history`. It tracks every span ID you have previously attempted to fix so you don't repeat work.

If the file does not exist, treat it as an empty log: `{"attempted": []}`.

## Step 2 — Pull tool errors from Jaeger

Run this to get all tool errors from the last 24 hours:

```bash
START=$(python3 -c "import time; print(int((time.time() - 86400) * 1e6))")
END=$(python3 -c "import time; print(int(time.time() * 1e6))")
curl -s "http://localhost:16686/api/traces?service=tools&tags=%7B%22error%22%3A%22true%22%7D&limit=500&start=$START&end=$END" | python3 -c "
import json, sys
data = json.load(sys.stdin)
errors = []
for t in data.get('data', []):
    for s in t['spans']:
        tags = {tag['key']: tag['value'] for tag in s.get('tags', [])}
        if tags.get('error') is True and 'flue.tool.name' in tags:
            instance = tags.get('flue.instance.id', '')
            parts = instance.split(':')
            job = parts[2] if len(parts) >= 3 else instance
            result_raw = tags.get('flue.tool.result', '')
            try:
                result_json = json.loads(result_raw)
                error_text = result_json.get('content', [{}])[0].get('text', result_raw)
            except:
                error_text = str(result_raw)
            errors.append({
                'spanId': s['spanID'],
                'traceId': s['traceID'],
                'startTime': s['startTime'],
                'tool': tags.get('flue.tool.name'),
                'job': job,
                'args': tags.get('flue.tool.arguments', ''),
                'error': error_text,
            })
errors.sort(key=lambda x: x['startTime'], reverse=True)
print(json.dumps(errors, indent=2))
"
```

Filter out any errors whose `spanId` already appears in the log's `attempted` list. Only work on the remaining new errors.

If there are no new errors, write `NO_REPLY` and stop.

## Step 3 — For each unique (job, tool, error) group, assess fixability

Locate each job's prompt file at `prompts/jobs/<job-name>.md` in the repo (`/Users/raven/local/raven/flue-conspiracy`). Read it before deciding anything.

A fix is **allowed** if ALL of the following are true:
- The correct replacement is known with certainty (e.g. you can verify the right path exists with `ls` or `find`)
- The change does not alter what the job does or what outcome it produces
- The change is purely mechanical — updating a path, correcting a known-wrong reference, or applying a pattern already used elsewhere in the repo
- The job prompt file exists and is the right place to make the change

A fix is **not allowed** if:
- The root cause is environmental (missing binary like `poetry`, OS permission errors, network failures) — these require human attention
- The correct replacement is ambiguous or requires guessing
- The error comes from a file the job is trying to read that genuinely doesn't exist yet (first-run state, history files, etc.)
- Fixing it would change what the job does

## Step 4 — Apply clear fixes

For each fix you apply:
1. Edit the prompt file to make the minimal correct change
2. Verify the referenced path now exists (`ls <path>`)
3. Do not touch anything else in the file — schedule, target, agent, intent, or wording

Do not create jobs, modify job metadata, or touch anything outside `prompts/jobs/`.

## Step 5 — Update the log

Append every span ID you assessed (whether fixed, skipped, or flagged) to the `attempted` list in `.tool-error-fixes.history`. Write the full updated file. This prevents re-processing the same errors on future runs.

## Step 6 — Report

If you did not fix anything, output `NO_REPLY` and stop. Do not report errors that need human attention or no-action items — those are noise.

If you fixed at least one thing, send a brief summary:

**Fixed** — one line per fix: job name, what was wrong, what you changed it to.

No preamble. No other sections.
