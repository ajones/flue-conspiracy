![[components/output-rule.md]]

## Task

**Step 1 – Check weather**

Check the weather for today in Walnut Creek / Acalanes Ridge.
- If it rained today, reply with exactly `NO_REPLY` and nothing else. Do not continue.

**Step 2 – Check chat history**

If it did not rain, fetch the last 14 hours of messages from the Aaron + Ashley group chat. Compute a start timestamp 14 hours ago in ISO8601 format, then run:

```bash
imsg history --chat-id bc2201f817d34f7da609764bf73c4ffb --start <14-hours-ago-iso8601> --json
```

Scan the returned messages for any mention that the front flowers or front deck plants have already been watered (e.g. "watered", "done", "flowers are good", etc.). If you find a clear indication they were watered, reply with exactly `NO_REPLY` and nothing else.

**Step 3 – Compose nudge**

If no watering mention was found, compose a short, casual evening check-in asking if the flowers on the front deck have been watered yet today. One or two sentences max. Keep it friendly and low-key.
