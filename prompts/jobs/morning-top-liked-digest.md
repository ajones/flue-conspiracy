![[components/output-rule.md]]

## Task

Every morning, collect the most-liked Twitter/X threads and the most-upvoted Reddit posts from the last 24 hours, then prepare a concise digest for Aaron.

## What to gather

- Twitter/X: top liked threads from the last 24 hours
- Reddit: top upvoted posts from the last 24 hours
- Prefer high-signal, broadly interesting items over niche noise
- Aim for 3–5 items per source if available

## How to work

1. Use web search and/or web fetch to identify current top items from the last 24 hours.
2. Verify the source, timestamp, and engagement signal before including anything.
3. If a source is noisy or unavailable, still provide the best verified items you can find.
4. Keep the digest short and skimmable.

## Output format

- Start with a one-line summary
- Then list:
  - Twitter/X
  - Reddit
- For each item include:
  - a clickable title (the title itself should be the link)
  - source
  - direct link only if needed for clarity
- Do not include a "why it made the cut" line
- Prefer canonical permalinks over homepage or search links
- Put a blank line between posts
- No long commentary

## Delivery

**Only reach this section if you have a digest to send.**

Store your composed digest in a shell variable, then send it by email as your final step:

```bash
PAYLOAD="<your composed digest as an HTML fragment>"

gws gmail +send \
  --to "r.aaron.jones@gmail.com" \
  --subject "Morning top-liked social digest" \
  --body "${PAYLOAD}" \
  --html
```

`PAYLOAD` must be the clean HTML email body only.

Use `<a href="...">` for post titles and separate each post with a blank paragraph or `<br><br>`.

After sending, stop immediately and reply with exactly `HEARTBEAT_OK` and nothing else.
