# Weekly look-ahead for next Monday-Sunday

You are preparing a concise weekly look-ahead message based on **Bun Calendar**.

## Goal
Check the **next Monday through Sunday week** and send a short useful summary message.

## Source of truth
Use the `ical-reader` skill to sync and query the **Bun Calendar** only.

## Time window
- Determine the upcoming full week window: **next Monday 00:00 through next Sunday 23:59** in `America/Los_Angeles`.
- Query Bun Calendar only for that exact range.

## What to look for
Include items in the summary only if they match one of these categories:

1. **Trips**
   - Events that look like trips, travel, stays, or lodging.
   - Strong examples: titles containing phrases like `stay at`, `trip`, `lodge`, `hotel`, `cabin`, `camp`, `vacation`, `travel`, `flight`.
   - Include similar obviously trip-related events too.

2. **Ash office and dinner / happy hour / date night events**
   - Events clearly related to Ash going into the office.
   - Events clearly related to dinner, drinks, happy hour, date night, or a couple dinner.
   - Strong examples: titles containing phrases like `date night`, `dinner`, `drinks`, `happy hour`, or similar obvious social evening plans.
   - If an event title begins with `Ash`, it should be mentioned.

3. **Aaron evening activities**
   - Aaron events that happen in the evening.
   - Treat roughly **5:00 PM or later** as evening for timed events.
   - If an event title begins with `Aaron`, it should be mentioned.

4. **Babysitting as a proxy for an important plan**
   - If the calendar shows babysitting, sitter coverage, or a babysitter, treat that as a strong signal that there is an important event worth mentioning.
   - The babysitting itself is usually not the key item. Prefer to mention the underlying event it appears to support, such as date night, double date, dinner, party, concert, or another evening plan.
   - If both the babysitting entry and the likely paired event are visible, mention the event, not just the babysitting.
   - If only the babysitting entry is visible and the paired event is unclear, still include a short note that there is likely an important plan that night.

5. **School / scouting / family meetings**
   - Include meetings tied to schools, preschools, scouts, parent groups, or family logistics even if they are not evening events.
   - Strong examples: titles containing `meeting`, `den meeting`, `committee`, `conference`, `open house`, `parent`, `Pied Piper`, `Rossmore`, `Parkmead`, or `Dewing Park`.
   - If a title ends with or prominently includes `meeting`, mention it.
   - If an event title begins with `Pied Piper`, `Rossmore`, `Parkmead`, or `Dewing Park`, mention it even if it is borderline for the categories above.

## Important inclusion rule
If an event title begins with **`Aaron`** or **`Ash`**, mention it even if it is only borderline for the categories above.

Also, if an event clearly looks like a couple plan or social evening plan, for example **date night**, dinner out, drinks, happy hour, or a double date, include it even when the wording is informal.

Treat babysitting as a clue, not the headline. Use it to surface the important event the childcare is supporting.

## Output rules
- Keep the final message short and human.
- If there are matching events, organize them as a compact bullet list.
- Group by day when helpful.
- Use **actual line breaks** in the final text. Do **not** output escaped newline sequences like `\n` anywhere in the message.
- The first line should be the heading, and each bullet should appear on its own real line underneath it.
- Do **not** wrap the message in JSON, code fences, quotes, or a single-line escaped string.
- Do **not** mention calendars, tools, prompt files, or delivery targets.
- Do **not** mention events that do not match the categories above.
- If there are no matching events for the next Monday-Sunday week, send a short message saying there is nothing notable in those categories next week.

## Suggested style
Use something like:
- first line exactly like `👀 Next week heads-up:`
- then 2-6 short bullets on separate lines below it

Example formatting:

```text
👀 Next week heads-up:
- Tue-Wed: Ashley in Office
- Wed: Aaron @ WNR
- Sat 5:00 PM: Family Dinner for Gigi's Birthday
```

Be specific about day and event title. Keep it tight.


## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
