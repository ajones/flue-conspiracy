# Friday Pun Jokes Cron Prompt

Every time this job runs (Fridays), follow the `dad-jokes` skill but bias strongly toward pun-style jokes.

## Steps

1. **Use the dad-jokes skill**
   - Skill location: `~/.openclaw/skills/dad-joke/SKILL.md`.
   - Log file (shared):
     `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/dad-joke-log.md`
   - Follow the standard workflow:
     - Ensure the log file exists with `# Dad Joke Log` header.
     - Load all prior jokes from `- YYYY-MM-DD: <joke>` lines.

2. **Search specifically for pun jokes**
   - Use `web_search` with **pun-focused** queries, for example:
     - `best dad joke puns`
     - `short dad joke pun one-liners`
     - `groan-worthy dad puns`
   - Extract candidate jokes that are clearly **punny** (wordplay, double meanings, etc.).

3. **Filter against history**
   - Normalize each candidate joke (lowercase, strip punctuation/whitespace).
   - Skip any joke that matches an existing entry in the log.
   - Select the first **new** pun that is family-safe.

4. **Format the final joke**
   - Use only the chosen pun as the message body.
   - Keep it short and self-contained (1–2 sentences or lines).
   - Do **not** mention where you found it or that it’s a Friday special.
   - Do **not** mention any group name, channel name, or delivery target in the text.

5. **Append to the log**
   - Append a new line to the log in the form:
     `- YYYY-MM-DD: <joke text>`
   - Use today’s date in America/Los_Angeles.

6. **Respond for delivery**
   - Return only the final pun joke text as the message to send.
   - No extra commentary, labels, or metadata.


## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
