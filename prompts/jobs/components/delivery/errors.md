## bluebubbles

Alert the user immediately by running:

```bash
~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh \
  "agent:main:bluebubbles:direct:+15127407713" \
  --payload "This cron agent hit an error and could not complete. Error details: <describe the error clearly>. You may need to re-authenticate GWS or check the agent logs."
```

Run this alert before exiting so the error surfaces to the user rather than silently failing.

After sending the alert, stop immediately and reply with exactly `NO_REPLY` and nothing else.
