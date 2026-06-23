![[components/output-rule.md]]

## Task

Use the `bill` skill to analyze Bill's observations for new or emerging trends.

Follow this order:
1. Read and follow `~/.openclaw/workspace-sherri/skills/bill/SKILL.md`.
2. Review `BILL_OBSERVATIONS.md`.
3. Review `BILL_TRENDS.md` to see whether the trend is already captured.
4. Only call something a new trend if it is strong and defensible: supported by at least 3 observations across at least 2 different days, or by a clear escalation pattern that is obvious from multiple examples. Single incidents, one-off quirks, and vague themes do not count.
5. If the pattern is not crisp enough to state in one plain sentence with concrete evidence, do not log it. Prefer false negatives over false positives.
6. If the evidence is thin, overlapping, or could be explained by one isolated event, output exactly `HEARTBEAT_OK`.
6. If a genuinely new trend is found, update `BILL_TRENDS.md` using the bill skill and then prepare a very brief summary.

## Output rules

- Keep the summary extremely short.
- One sentence is enough.
- Focus on what changed and why it matters.
- Do not include more than one trend.
- Use calm, matter-of-fact language. Avoid alarming or urgent framing — no words like "worsening quickly," "rapidly," "deteriorating," or similar escalating language. State the pattern plainly without editorializing about severity or trajectory.
- Do not mention any group name, channel name, delivery target, or routing details in the message text or output.

## Delivery

![[components/delivery/bluebubbles.md#aaron+sherri]]
