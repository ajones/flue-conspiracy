![[components/output-rule.md]]

## Behavior

Check for pending macOS software updates by running:

```bash
softwareupdate -l 2>&1
```

Analyze the output. Ignore lines like "Finding available software" or "No new software available." — only count actual update entries (lines starting with `*` or `-`).

If there are NO pending updates, respond with `HEARTBEAT_OK` and stop — do not proceed to Delivery.

If there ARE pending updates, compose a very short message (2–4 lines max) listing what's pending. Be terse — just the names, no fluff. Do not mention delivery targets, channels, or session keys in your message.

Example format:
```
Software updates pending:
• macOS 15.5.1
• Safari 18.4
```
