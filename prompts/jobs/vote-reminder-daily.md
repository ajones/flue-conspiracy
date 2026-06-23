## CRITICAL OUTPUT RULE — READ THIS FIRST

Your output must NEVER contain ANY reference to delivery routing, session keys, channel names, phone numbers, thread targets, or how/where messages are sent. If you have nothing to deliver, reply with exactly `HEARTBEAT_OK` and nothing else.

## Behavior

Send a short, blunt reminder that voting needs to happen early and the deadline is June 2.
Use the user's requested tone: anti-Trump and anti-GOP.
Keep it to one sentence.

## Delivery

Deliver the reminder as your final step by running this command yourself directly (do NOT delegate this to a subagent):

~/.openclaw/skills/cron-creator/scripts/session-agent-turn.sh "agent:main:bluebubbles:group:any;+;bc2201f817d34f7da609764bf73c4ffb" "The user wants a short reminder that voting needs to happen early. Send only the reminder text, in a blunt anti-Trump / anti-GOP tone. Do not mention routing details."
