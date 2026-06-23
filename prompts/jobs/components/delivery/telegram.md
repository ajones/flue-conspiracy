## aaron+piper

Store your composed message in a shell variable, then run:

```bash
PAYLOAD="<your composed message>"

~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh \
  "agent:pp-maint:telegram:group:-5193417093" \
  --payload "${PAYLOAD}"
```

After the script completes, reply with exactly `NO_REPLY` and nothing else.
