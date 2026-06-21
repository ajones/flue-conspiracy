# Friend CRM Reference

This skill adapts the Friend CRM project into an agent-usable workflow.

## Core intent

Track people Aaron cares about in a way that preserves context, open loops, cadence, and next actions.

## Project files

- `README.md` explains the product goal: relationship memory and follow-through, not pipeline CRM.
- `AGENTS.md` defines the operating model: human-readable notes plus machine-readable structured fields.
- `schema/person-schema.md` defines the person record fields.
- `workflows/nudging.md` defines how to rank and surface people.
- `indexes/people-index.json` is the derived roster used for ranking.
- `people/active/*.md` are the canonical narrative records.

## Practical heuristics

- Open loops outrank everything else.
- Cadence drift matters more than raw inactivity.
- Natural timing signals are useful.
- Recent meaningful interaction should suppress urgency.
- The explanation matters more than the exact score.

## Record update checklist

- Update the person note first when new context arrives.
- Keep structured fields aligned with the note.
- Preserve prior context instead of rewriting history.
- Keep entries factual and brief.

## Nudge output

- Short
- Concrete
- Context-aware
- Low-friction

## Do not

- Do not fabricate urgency.
- Do not auto-send outreach.
- Do not produce dashboard-style dumps.
- Do not duplicate long message history into notes.
