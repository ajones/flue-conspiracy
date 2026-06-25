![[components/output-rule.md]]

## Task

1. Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.
2. Find all projects marked `[in progress]`. For each one, read any property lines listed under it (see the **Project Properties** key in the file) and use judgment to decide whether to include it in this run — for example, skipping a project that has a future "don't ask until" date.
3. **If there are eligible in-progress projects:** Pick **one** to focus on this run. Rotate through them by selecting the one whose most recent update timestamp is oldest (or has no updates yet). If all are equally fresh, pick the first. Compose a short, casual check-in message for that project. Ask for a status update and include 1–2 natural follow-up questions to prompt real progress info (e.g. blockers, next step, % done). Then go to Delivery.
4. **If there are zero eligible in-progress projects:** Find all projects marked `[not started]`.
   - For each `[not started]` project, check its update notes for any starting criteria (a start date, a condition like "after X", "wait until Y", etc.).
   - Only include a project if: it has no starting criteria, OR its starting criteria are met as of today.
   - If no `[not started]` projects pass this filter, reply exactly `NO_REPLY` and stop.
   - Otherwise, compose a short, casual message listing the eligible not-started projects. For each one, suggest a **very small, concrete first step** Aaron could take to get it off the ground — something that takes 5–15 minutes at most. Keep the tone encouraging and practical, no fluff.

## Pending request

Before delivering, append the following request block to `~/.openclaw/workspace/PENDING_AGENT_REQUESTS.md` (create the file with the header `# Pending Agent Requests` if it doesn't exist):

```
## Active project check-in — <today's date YYYY-MM-DD> — <project name>

Question asked: <exact check-in question you are asking>

When Aaron replies:
1. Append a dated update line to the project in `~/.openclaw/workspace/ACTIVE_PROJECTS.md` summarizing what he said.
2. If he says the project is done, change its status to `[done]`.
3. **Set a `check_after` date** on the project based on the content of his reply:
   - Read his reply carefully and determine the most natural next check-in window.
   - If he mentions a specific date, event, or condition ("after the package arrives", "next week", "end of month"), convert that to a concrete YYYY-MM-DD date.
   - If he gives a vague "still working on it" or "no blockers" update, default to tomorrow.
   - If he gives a clear next step with implied timeline (e.g., "calling tomorrow", "doing it this weekend"), set check_after to the day after that step would complete.
   - If he says done or to drop the project, do not set check_after.
   - **Minimum floor:** never set `check_after` to today or a past date — the earliest allowed value is tomorrow.
   - Write the date as a `check_after: YYYY-MM-DD` property line directly below the project's status line (before the `- Updates:` line). If a `check_after` line already exists, replace it.
4. Remove this block from PENDING_AGENT_REQUESTS.md after processing.
```
