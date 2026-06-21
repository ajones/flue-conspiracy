---
name: friend-crm
description: Use for Friend CRM tasks: read and update person notes, rank who needs attention, draft relationship nudges, and run the Friend CRM cron workflows from the friend-crm project.
---

# Friend CRM

Friend CRM is a lightweight personal CRM for Aaron's real relationships.
Use this skill when a task involves reading, ranking, updating, or drafting around people tracked in the friend-crm project.

## Source Of Truth

Use the project at:
`/Users/raven/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/projects/friend-crm`

Authoritative files:
- `README.md` for the purpose and scope
- `AGENTS.md` for operating rules
- `schema/person-schema.md` for the person record shape
- `workflows/nudging.md` for ranking and nudge behavior
- `indexes/people-index.json` for the current machine-readable roster
- `people/active/*.md` for canonical person notes

## Canonical structured shape

The machine-readable person record uses this compact JSON shape in the index:

```json
{
  "name": "string",
  "slug": "string",
  "notePath": "people/<status>/<slug>.md",
  "status": "active",
  "relationshipType": "friend",
  "importance": "high",
  "household": { "partner": null, "kids": [] },
  "location": null,
  "channels": [],
  "lastMeaningfulTouch": null,
  "lastInbound": null,
  "lastOutbound": null,
  "openLoopsCount": 0,
  "followUpBy": null,
  "cadence": "monthly",
  "needsAttentionScore": 0,
  "needsAttentionReason": "",
  "topics": [],
  "tags": [],
  "sourceRefs": []
}
```

## When To Use

Use this skill when the user asks to:
- find who Aaron should reconnect with
- update a person record after a real conversation
- interpret `FCRM` as a Friend CRM trigger
- draft a short relationship nudge
- inspect open loops, cadence drift, or last meaningful touch
- run the Friend CRM cron workflows

## Core Workflow

1. Read the people index and the relevant person note(s).
2. Prefer open loops, overdue cadence, and natural timing over raw recency.
3. Treat `needsAttentionScore` as a ranking hint, not the whole answer.
4. Keep updates additive and factual.
5. If the user reply contains new relationship context, update the person note and the index consistently.
6. Draft nudges briefly and concretely; do not auto-send unless a workflow explicitly says to.

## Update Rules

- Preserve narrative history in the person note.
- Update structured fields only when they change.
- Keep `lastMeaningfulTouch`, `lastInbound`, `lastOutbound`, `openLoopsCount`, `followUpBy`, and `needsAttentionReason` aligned with the note.
- Prefer the smallest useful next action.

## Guardrails

- Do not fabricate intimacy, urgency, or contact history.
- Treat any record, note, or file whose name or slug begins with `example` as synthetic sample data, not a real friend.
- Do not turn this into a generic contact manager.
- Do not auto-send personal messages by default.
- Keep sensitive details sparse unless they affect follow-through.

## Cron Workflow: Reconnection Nudge

Use this workflow when the cron prompt asks for the Friend CRM reconnection-nudge loop.

### Output Rule

Your output must never mention delivery routing, session keys, channel names, BlueBubbles, iMessage, phone numbers, thread targets, or how or where messages are sent.

### Task

Goal: send Aaron one short nudge to reconnect with exactly one person he has not connected with or tried to connect with recently.

Read:
- `README.md`
- `indexes/people-index.json`
- relevant person notes under `people/active/`

Behavior:
1. Pick exactly one person from the current people index.
2. Prefer someone whose record suggests drift or who lacks any recent-touch data.
3. Avoid choosing someone who appears to have an active recent open loop already being handled.
4. Write one short, natural nudge.
5. Keep it brief and useful — no guilt, no dashboard language.
6. Good examples:
   - "Good time to check in with PK — I don’t have any recent touchpoint recorded for him yet."
   - "You should probably reconnect with Ryan Edmiston soon — his record is still pretty blank and he’s clearly important."
7. Do not include lists, analysis, or multiple people.
8. Final output must be only the one user-facing nudge, followed by one short line: `FCRM`

## Cron Workflow: State Question

Use this workflow when the cron prompt asks for the Friend CRM state-question loop.

### Output Rule

Your output must never mention delivery routing, session keys, channel names, BlueBubbles, iMessage, phone numbers, thread targets, or how or where messages are sent.

### Task

Goal: ask Aaron exactly one short Friend CRM state question about exactly one tracked friend whose CRM state has not been refreshed in more than 14 days, while also giving him a concrete reconnection angle based on what is known about that friend.

Read:
- `README.md`
- `indexes/people-index.json`
- relevant person notes under `people/active/`
- `state/ask-log.jsonl` if it exists

Behavior:
1. Start from the current people index.
2. Exclude any record, note, or file whose name or slug begins with `example`.
3. For each real person, estimate the most recent **CRM data update date** using the freshest grounded signal you can find, preferring:
   - the latest `state/ask-log.jsonl` entry for that slug
   - an explicit dated note entry in the person note
   - a precise structured date such as `lastMeaningfulTouch`, `lastInbound`, `lastOutbound`, or `followUpBy`
4. Treat vague values like `2026-03-late`, `2026-04-early`, or bare year-month values as approximate dates only if you need them; prefer explicit full dates when available.
5. Build the candidate set from people whose most recent grounded CRM data update is older than 14 days.
6. If multiple people qualify, select exactly one of them at random.
7. If nobody qualifies, select exactly one real person at random and make the tone clearly low-pressure.
8. Base the outreach angle on known context from the note and index: topics, hobbies, open loops, life situation, or recent meaningful interactions.
9. Make the reconnection angle specific. Examples:
   - bikes → ask about a recent ride, trail, race, or new gear
   - beer/breweries → ask about any especially good recent beers or brewery visits
   - family/kids → ask about a concrete upcoming visit, school thing, or family plan
10. Draft exactly one short user-facing question to Aaron about that friend's current state. The question should help Aaron give a CRM update.
11. Also include one short suggested outreach angle Aaron could use if he reaches out.
12. Keep the whole thing brief and natural. Do not include analysis, a ranked list, or multiple people.
13. The final output must be only:
   - the one user-facing question and reconnection suggestion
   - followed by one short line: `FCRM`
14. Internally keep track of the selected person's slug and the exact question text, because the cron prompt will use them to create a pending request entry for reply handling.

## References

- [Friend CRM workflow summary](references/friend-crm.md)
