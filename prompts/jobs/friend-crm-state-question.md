Read `~/.openclaw/skills/friend-crm/SKILL.md` and follow the section `## Cron Workflow: State Question` exactly.


![[components/pending-agent-requests.md]]

### Delivery

This cron run exists only to send Aaron one short Friend CRM question in his direct BlueBubbles thread.

Requirements:
1. Treat the skill section as the logic source of truth.
2. Your final answer should be the exact user-facing question + reconnection suggestion produced by that workflow.
3. Do not add preambles, explanations, metadata, or extra lines.
4. End with the `FCRM` line from the skill.
5. Stop after returning the user-facing text


![[components/delivery/bluebubbles.md#aaron+direct]]
