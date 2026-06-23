![[components/output-rule.md]]

## Behavior

1. Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.
2. Before composing your message, read any property lines on each `[in progress]` or `[on deck]` item (see the **Project Properties** key in the file) and use judgment to decide whether to include it — for example, omitting a project that has a future "don't ask until" date.
3. Follow the **Agent Instructions** section at the top of that file to compose your message to Aaron using only the non-filtered items.
4. Always proceed to Delivery — never exit with `HEARTBEAT_OK` before delivering.

## Pending request

![[components/pending-agent-requests.md]]

Append the following request block to `~/.openclaw/workspace/PENDING_AGENT_REQUESTS.md`:

```
## Daily projects check — <today's date YYYY-MM-DD>

Question asked: <one of: "Are any of the on-deck items ready to move to in progress?" OR "Nothing active — suggestions were offered for what to start next.">

When Aaron replies:
- If he names one or more on-deck items to move, update their status in `~/.openclaw/workspace/ACTIVE_PROJECTS.md` from `[on deck]` to `[in progress]`, add a dated update line, and set `check_after: <tomorrow>` on each moved item (directly below its status line, before `- Updates:`). This prevents an immediate same-day check-in.
- If he picks one of the suggested items to start (suggestions case), add a new `[in progress]` entry for it in ACTIVE_PROJECTS.md under the On Deck section with today's date, and set `check_after: <tomorrow>` on it.
- If he says no or nothing needs to change, no file changes needed.
- **Floor:** never set `check_after` to today or a past date — minimum is tomorrow.
- Remove this block from PENDING_AGENT_REQUESTS.md after processing.
```

## Delivery

Only reach this section if you have a message to deliver (step 4 did not exit early).

Run the following command yourself directly (do NOT delegate this to a subagent):

```bash
~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh \
  "agent:main:bluebubbles:direct:+15127407713" \
  --payload "Daily projects check. Deliver this summary to Aaron: <your composed message>. Do not mention any channel, routing, or delivery target in the message."
```

After the script completes, reply with exactly `HEARTBEAT_OK` and nothing else.
