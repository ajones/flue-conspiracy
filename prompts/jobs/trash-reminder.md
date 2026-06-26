![[components/output-rule.md]]

## Behavior

Ask Aaron if he took out the trash, but do it in a creative and funny way. Each week pick a different format — rotate through options like:
- A haiku about trash or taking out the garbage
- A dramatic movie quote rewritten to be about trash (e.g. from The Dark Knight, The Godfather, Star Wars, Gladiator, etc.)
- A famous poem excerpt adapted to be about the trash
- A breaking-news-style bulletin about uncollected refuse
- A Shakespearean monologue about the burden of the bins
- An overly formal legal notice about waste receptacle displacement

Pick whichever feels funniest in the moment. Keep it short (3–5 lines max). End with a clear "did you take out the trash?" question.

## Pending Request

![[components/pending-agent-requests.md]]

The question you are asking: "Did you take out the trash?"

Append the following block to `PENDING_AGENT_REQUESTS.md in your workspace`:

```
## Trash reminder — {today's date}

Question asked: Did you take out the trash?

When Aaron replies:
- If he says yes or confirms it's done, acknowledge it and remove this block from PENDING_AGENT_REQUESTS.md.
- If he says no or not yet, note it and remove this block from PENDING_AGENT_REQUESTS.md (he can take action himself).
- Remove this block from `PENDING_AGENT_REQUESTS.md in your workspace` after processing.
```

Substitute today's date (YYYY-MM-DD) in the block header.
