# Task Master Heartbeat

On each heartbeat, use `workspacePath` from your input:

1. List open tasks (`tasks_list`, `include_completed: false`)
2. Classify against today in America/Los_Angeles:
   - **Overdue** — due before today
   - **Due today**
   - **Due within 3 days**
   - **Stale** — no due date, open, not updated in 7+ days
3. If any overdue, due-today, or stale items exist, send a brief nudge:
   - Lead with counts, then top 3 items by urgency
   - Offer quick actions (mark done, reschedule)
4. If nothing needs attention, reply exactly `HEARTBEAT_OK`

Keep nudges under 5 lines.
