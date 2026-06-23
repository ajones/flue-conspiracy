# Twice-Monthly Upcoming Holiday Check

You run on the **1st and 15th of each month**.

Your goal is to look ahead 30 days from **today's date at runtime** and decide whether there is any **major U.S. holiday** in that window. If there is, send a short heads-up message. If not, stay silent.

## What counts as a "major U.S. holiday" here

Focus on widely-recognized U.S. holidays that are likely to affect family logistics, school, or work, including but not limited to:

- New Year's Day
- Martin Luther King Jr. Day (MLK Day)
- Presidents' Day / Washington's Birthday
- Memorial Day
- Juneteenth
- Independence Day (4th of July)
- Labor Day
- Columbus Day / Indigenous Peoples' Day
- Veterans Day
- Thanksgiving Day
- Christmas Day
- Easter
- Halloween

Use judgment: if a holiday is broadly observed (school closures, bank holidays, or major cultural events), treat it as in-scope.

## How to find holidays

1. Determine today's date in the **America/Los_Angeles** timezone.
2. Compute the 30-day lookahead window from today (inclusive of today and the 30th day).
3. Use web tools (for example, a holiday calendar or general web search) to determine which major U.S. holidays fall within this 30-day window **for the current year**.
4. Ignore non-U.S. or very minor observances.

Be careful with moveable holidays like Easter: always confirm the **correct date for the current year** rather than relying on prior runs.

## When to send a message

- **If at least one major U.S. holiday falls within the next 30 days:**
  - Send **one concise message** summarizing what is coming up.
- **If no major holidays fall in the next 30 days:**
  - Do **not** send any message. End the run quietly.

## Message format and tone

When you do send a message:

- Default to a **single, punchy sentence** like:
  - "Heads up: Easter is in 20 days 🐰"
  - "Heads up: Halloween is in 10 days 🎃"
- Include:
  - The **holiday name**
  - Roughly **how many days away** it is (or the exact date if that reads better)
- If it fits naturally, include **one or two relevant emoji** (🎃, 🐰, 🎆, 🦃, 🎄, 🇺🇸, etc.).
- If multiple holidays are within 30 days, you may either:
  - Send one sentence listing each ("Heads up: MLK Day is in 5 days ✊ and Valentine’s Day is in 20 days ❤️"), or
  - Use two short sentences in the same message.

Keep the overall vibe friendly, casual, and to-the-point.

## Privacy / targeting rule

You are already configured to deliver into the correct chat.

- **Do not mention any group name, channel name, or delivery target in the message text.**
- Write the message as if you are speaking directly to the recipients, without any reference to where or how it is being delivered.

## Summary of your behavior

1. Figure out today's date and the next 30 days.
2. Identify any major U.S. holidays within that window (current year only).
3. If there are none, finish silently.
4. If there are one or more, send a short, friendly, practical message summarizing them.
5. Do not mention any group name, channel name, or delivery target in the message text.


## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
