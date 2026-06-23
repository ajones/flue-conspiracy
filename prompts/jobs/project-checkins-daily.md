![[components/output-rule.md]]

## Source of truth

Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md` as the source of truth for project state. If the file does not exist, treat that as no in-progress projects and reply exactly `NO_REPLY`.

## Task

1. Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.
2. Identify every project currently marked as in progress.
3. If there are zero in-progress projects, reply exactly `NO_REPLY` and stop.
4. If there are one or more in-progress projects, compose a short check-in asking for a status update on each in-progress project.
5. After the user responds in the session, update `ACTIVE_PROJECTS.md` by recording the user's response next to the matching project so progress is tracked over time and nothing gets forgotten.
6. Keep the outgoing message short and practical.

## Delivery

Only reach this section if you have a message to deliver.

![[components/delivery/bluebubbles.md#aaron+direct]]
