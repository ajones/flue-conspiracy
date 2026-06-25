![[components/output-rule.md]]

Every time this job runs, do exactly the following steps. You MUST actually execute each bash command in this session — do not just describe or explain what you would do, and do NOT spawn or delegate to any sub-agents.

## Step 1 — Pick a random photo

Run this command to get a random photo from the "Double Trouble" album:

```bash
cd ~/.openclaw/skills/apple-photos && scripts/photos-album-random.sh "Double Trouble"
```

The output is in the format: `Filename | Date | Type | UUID`  
Extract the UUID (the last field after the final `|`).

## Step 2 — Compose a caption

Write a very short caption (max 6 words, one short sentence). Examples:
- "Morning Double Trouble moment:"
- "Daily Double Trouble drop:"
- "Fresh from Double Trouble:"

Do NOT mention any group name, channel name, or delivery target in the caption.

## Step 3 — Send the photo via iMessage

Run this command, substituting the UUID from Step 1 and your caption from Step 2:

```bash
cd ~/.openclaw/skills/apple-photos && scripts/photos-send-imessage.sh "<UUID>" "Mayhem MGMT" "<caption>"
```

This script handles exporting the photo, sending the caption text, sending the photo file, and cleanup. Text and photo arrive as separate messages (iMessage limitation).

## Important

- You must actually run the bash commands above in this session. Do not just output them or describe what they do.
- Do NOT spawn any other agents or sub-processes beyond the shell commands shown here; perform all work directly.
- If `photos-album-random.sh` returns no results, retry once. If it still fails, skip this run.
- If `photos-send-imessage.sh` fails, do not retry.
- If the script succeeds, respond with `NO_REPLY` and nothing else. Do NOT narrate what you did, what photo you picked, what caption you used, or where it was sent. No summaries, no confirmations, no meta-commentary.
