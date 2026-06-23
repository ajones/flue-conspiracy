![[components/output-rule.md]]

## Task

Deliver a short, context-aware daily nudge for Sherri about caring for Bill.

### Steps

1. Read `BILL_OBSERVATIONS.md` in the sherri workspace. Focus on yesterday's entry and the prior 3 days for recent context.
2. Read `BILL_NUDGE_HISTORY.md` in the sherri workspace. Note the last 14 entries to avoid repeating angles.
3. Read `BILL_CHEETSHEET.md` for background knowledge.
4. Read `BILL_TRENDS.md` for established patterns.
5. Read `CURRENT_LOCATION.md` in the sherri workspace to determine Bill's current location. Check today's weather forecast for that location. Note whether incoming storms, dramatic changes, or severe weather might trigger Bill's weather anxiety.
6. Consider what day of the week it is and what's typical for Bill (Health Club days, social activities, typical calm/agitated patterns by day).
7. Compose a nudge that is:
   - Grounded in yesterday's specific observation or a pattern from the last few days
   - Forward-looking: about today's likely challenge or opportunity
   - A different angle/topic than anything in the last 14 history entries
   - Never generic advice — always tied to something specific and recent

### Message format

Start with a single contextual emoji (vary it — match to the nudge topic), then a blank line, then the nudge text.

Do NOT use a title like "Tip of the Day." Keep it casual and brief, like a text from a knowledgeable friend. 2-4 sentences, under 60 words.

### After composing

Before delivery, append a new line to `BILL_NUDGE_HISTORY.md` in the sherri workspace:
```
YYYY-MM-DD | <2-5 word summary of the angle used>
```

### Constraints

- Never reuse the same angle or framing as any of the last 14 history entries.
- Never recite cheetsheet items verbatim. Rephrase and contextualize.
- If yesterday has no observation entry, base the nudge on the most recent 3 days of entries instead.
- Do not send a weather alert — that is handled by a separate cron. Only weave weather context into caregiving advice when relevant.
- Warm but not patronizing. Practical, not preachy.
- Do not mention routing, channels, or delivery details in the message.
