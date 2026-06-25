![[components/output-rule.md]]

## Task

**Step 1 – Check weather**

Check the weather for today in Walnut Creek / Acalanes Ridge.
- If it rained today, reply with exactly `NO_REPLY` and nothing else. Do not continue.

**Step 2 – Check chat history**

If it did not rain, fetch the last 14 hours of messages from the Aaron + Ashley group chat. Read the BlueBubbles config from `~/.openclaw/openclaw.json` (fields: `channels.bluebubbles.serverUrl` and `channels.bluebubbles.password`), then run:

```bash
python3 -c "
import json, urllib.request, time

cfg = json.load(open('/Users/raven/.openclaw/openclaw.json'))['channels']['bluebubbles']
url = cfg['serverUrl']
pw = cfg['password']
cutoff_ms = int((time.time() - 14*3600)*1000)

req = urllib.request.urlopen(f'{url}/api/v1/chat/any;+;bc2201f817d34f7da609764bf73c4ffb/message?password={pw}&limit=200&sort=DESC')
data = json.loads(req.read())
msgs = [m for m in data.get('data', []) if m.get('dateCreated', 0) >= cutoff_ms]
msgs.sort(key=lambda m: m['dateCreated'])
print(json.dumps(msgs))
"
```

Scan the returned messages for any mention that the front flowers or front deck plants have already been watered (e.g. "watered", "done", "flowers are good", etc.). If you find a clear indication they were watered, reply with exactly `NO_REPLY` and nothing else.

**Step 3 – Compose nudge**

If no watering mention was found, compose a short, casual evening check-in asking if the flowers on the front deck have been watered yet today. One or two sentences max. Keep it friendly and low-key.
