![[components/output-rule.md]]

Every time this job runs, do exactly the following steps. You MUST actually execute each bash command in this session — do not just describe or explain what you would do, and do NOT spawn or delegate to any sub-agents.

## Step 1 — Pick a random photo

Run this command to get a random photo from the "Double Trouble" album:

```bash
cd <skill path> && scripts/photos-album-random.sh "Double Trouble"
```

The output is in the format: `Filename | Date | Type | UUID`  
Extract the UUID (the last field after the final `|`).

## Step 2 — Export the photo

Export the photo to a temp path:

```bash
cd <skill path> && scripts/photos-export.sh "<UUID>" /tmp/double-trouble-daily.jpg
```

## Step 3 — Compose a caption

Write a very short caption (max 6 words, one short sentence). Examples:
- "Morning Double Trouble moment:"
- "Daily Double Trouble drop:"
- "Fresh from Double Trouble:"

Do NOT mention any group name, channel name, or delivery target in the caption.

## Step 4 — Output for delivery

Respond with exactly this format and nothing else:

```
<your caption>

[[attach:/tmp/double-trouble-daily.jpg]]
```

## Important

- You must actually run the bash commands above in this session. Do not just output them or describe what they do.
- Do NOT spawn any other agents or sub-processes beyond the shell commands shown here; perform all work directly.
- If `photos-album-random.sh` returns no results, retry once. If it still fails, skip this run silently.
- If the export fails, skip this run silently.
