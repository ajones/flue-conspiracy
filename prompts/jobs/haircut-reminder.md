![[components/output-rule.md]]

## Behavior

1. Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.
2. Check whether there is already an `[in progress]` or `[on deck]` entry for "hair cut" or "haircut" (case-insensitive). If one already exists with either of those statuses, skip step 3 and go straight to Delivery.
3. If no such entry exists, add a new item under the `## On Deck` section (insert it immediately after the `## On Deck` heading line and any blank line that follows it):

```
- [in progress] Hair cut
  - Updates:
    - <today's date YYYY-MM-DD>: Due for a haircut.
```

   Write the updated file back to `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.

## Delivery

Compose a short, casual one-sentence reminder to Aaron that it's time for a haircut. Keep it brief and direct. Do not mention the project file or any internal tracking. Store the composed message in a variable called `REMINDER`.

Then run the following command yourself directly (do NOT delegate this to a subagent), substituting your composed message for `<REMINDER>`:

```bash
~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh \
  "agent:main:bluebubbles:direct:+15127407713" \
  --payload "<REMINDER>"
```

The `--payload` value must be the **final composed reminder text itself** — not instructions for another agent. For example: `--payload "Hey, you're probably due for a haircut — might want to book one soon!"`.

After the script completes, follow the `NO_REPLY` rule from the output rule above.
