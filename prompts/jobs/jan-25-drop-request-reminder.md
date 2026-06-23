# Jan 25 Drop Request Reminder

You are running a scheduled reminder.

## Goal
Tell the user it is time to submit a drop request here.

Also note that this is already tracked as an in-progress project, so the reminder should reinforce that the task is active rather than implying it is a new project.

## Delivery
As your final step, deliver your result to the user by running:
`~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "agent:main:bluebubbles:direct:+15127407713" "<your message>"`

Important:
- Your final output must contain only the user-facing message content.
- Do not mention any group name, channel name, delivery target, or routing details in the message text or output.
- Keep the reminder short and natural.
