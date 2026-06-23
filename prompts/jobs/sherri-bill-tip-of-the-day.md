![[components/output-rule.md]]

## Task

Create a short "Tip of the Day" based on the current contents of `BILL_CHEETSHEET.md`.

### How to choose the tip
1. Read `BILL_CHEETSHEET.md`.
2. Collect the bullet items under `## What tends to work` into an ordered list (item 1, item 2, …).
3. Run `~/.openclaw/scripts/day-of-year-index <count>` where `<count>` is the number of items. The script prints a number N.
4. Select item N from the list — where item 1 is the first bullet, item 2 is the second, and so on. Do not use zero-based indexing.

### Context from recent observations
Before writing the message, read the last 10 entries from `BILL_OBSERVATIONS.md` (located in the sherri workspace). Use these to understand what Bill has been like lately — what's been hard, what's been working, his recent mood and patterns.

### What to send
- Start with `Tip of the Day 💙` on its own line, then a blank line, then the tip.
- Write the tip as a brief, natural sentence — but ground it in Bill's recent reality. If the observations show something relevant (e.g. a restless stretch, a good Sudoku day, agitation at a certain time), weave that in so the tip feels specific to him, not generic.
- After the tip sentence, add a blank line, then a short follow-up paragraph. Write a practical, tip-specific suggestion for how Sherri might apply it given what's been happening lately. End by encouraging her to note in today's observations whether it helped.
- If the tip came from a specific research item or article, include a short `Source:` line with the article title and link.
- Keep it concise and warm. No analysis, no extra commentary.

### Behavior
- Use the current file contents; do not rely on old copies.
- If the sheet changes, use the latest version.
- Do not mention routing, channels, or delivery details in the message.

## Delivery

![[components/delivery/bluebubbles.md#aaron+sherri]]
