# Daily Dad Jokes Cron Prompt

Every time this job runs, follow the `dad-jokes` skill to fetch a new dad joke and send it into the current delivery target.

## Steps

1. **Use the dad-jokes skill**
   - Skill location: `~/.openclaw/skills/dad-joke/SKILL.md`.
   - Follow its workflow to:
     - Locate and use the shared dad joke log at:
       `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/dad-joke-log.md`
     - Read and normalize all prior jokes.
     - Search the web for short, family-safe dad jokes.
     - Select a **new** joke that is not in the log.
     - Append it to the log as a new line in the form:
       `- YYYY-MM-DD: <joke text>`

2. **Compose the outgoing message**
   - Use **only** the chosen dad joke text as the message body.
   - Do **not** include the date, log filename, or any meta information.
   - Do **not** mention any group name, channel name, or delivery target in the joke text.

3. **Respond for delivery**
   - Return the final dad joke text as the message to send.
   - Do not add any extra commentary or explanation.


## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
