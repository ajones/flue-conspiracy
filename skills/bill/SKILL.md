---
name: bill
description: Track behavior observations for Bill, maintain BILL_OBSERVATIONS.md, BILL_CARE_NEEDS.md, and BILL_TRENDS.md, and build text-based historical agitation visualizations.
metadata:
  openclaw:
    emoji: "💵"
    requires: { bins: [] }
    install: []
---

# Bill

## Overview

This skill helps track and log observations about Bill's behavior, maintain a curated list of care needs in `BILL_CARE_NEEDS.md`, and maintain a curated trend log in `BILL_TRENDS.md`. Observations are appended with a timestamp to `BILL_OBSERVATIONS.md` in the workspace root.

## Usage

### Log a behavior observation

When the user provides a behavior observation, append it to `BILL_OBSERVATIONS.md` in the format:

```
YYYY-MM-DD HH:MM - <observation>
```

The timestamp must reflect when the behavior occurred, not when it was reported. Parse temporal cues in the message — "yesterday", "last night", "this morning", "on Saturday", a specific date, etc. — and resolve them against today's date to produce the correct calendar date. If the message contains no temporal cue, assume the behavior happened today. Use the best-fit time when one is implied (e.g., "last night" → 21:00, "this morning" → 09:00); if no time is inferrable, use 12:00 as a default.

After resolving the date, rewrite the observation text so it reads as same-day. Replace relative references like "yesterday" or "last night" with present-tense equivalents ("today", "this morning", "this evening") or remove them entirely so the entry stands on its own date. Drop phrases like "On 4/8/2026" or "This text was from 4/16" since the timestamp already carries that information. Keep the rewrite minimal — preserve Sherri's voice and wording, only changing the temporal framing.

If `BILL_OBSERVATIONS.md` does not exist, create it with a header line:

```markdown
# Bill Observations
```

Then append the entry. Each entry goes on its own line. Do not add blank lines between entries.

Example entry:
```
2026-04-09 14:32 - Interrupted a team meeting without waiting to be called on.
```

After appending, re-review `BILL_CARE_NEEDS.md` alongside recent observations to see whether the new observation supports adding a new care need. Only add a need when the observation clearly supports it.

If a new care need is warranted, update `BILL_CARE_NEEDS.md` with a concise entry that includes:

- The date the need was identified
- The care need itself, stated clearly and practically
- An observation example showing what indicated the need

Keep the needs file curated rather than chronological. Prefer a small set of durable needs over duplicates or near-duplicates. Do not invent needs that are not supported by observations.

After logging the observation and making any justified care-need updates, check for a new behavior (see below), ask any warranted follow-up questions, and then confirm to the user that the observation was logged.

### Follow-up questions after logging

After logging, do two things before confirming: (1) check whether the observation describes a behavior not seen in prior entries, and (2) scan for missing high-priority clinical information. Ask **at most 2 questions total** across both checks. If nothing is missing, confirm immediately without asking anything.

#### New behavior flag

Read `BILL_OBSERVATIONS.md` and check whether the behavior just reported has appeared in any prior entry. If it has not, flag it:

> "I don't have a previous record of [behavior] — is this the first time you've seen this?"

Follow with one short question about trigger or context. This uses 1 of the 2 available questions.

Behaviors worth flagging (in priority order):
- Hallucinations (seeing/hearing things that aren't there) — strongest clinical indicator of disease severity
- Delusions with new content (paranoid beliefs or accusations beyond Bill's established weather-threat pattern)
- Aggression or hitting
- Incontinence
- Inability to recognize Sherri or immediate family
- Severe fall or injury
- Refusing food or fluids entirely
- Significant change in mobility
- Marked apathy or withdrawal lasting a full day or more

#### Seven clinical dimensions (priority order)

Scan the observation for these dimensions. Go in order. Note which are covered, which are irrelevant to this entry, and which are missing but would be clinically useful.

1. **Safety event** — fall, wandering, unsupervised departure, injury, driving
2. **Agitation/mood level** — mild irritability vs. sustained agitation vs. full escalation
3. **Trigger** — identifiable cause (weather alert, correction, routine change, visitor, TV)
4. **Psychotic features** — hallucinations, delusions, paranoia with specific content
5. **Intervention & outcome** — what was tried, whether it helped, how long resolution took
6. **Physical basics** — medications taken, sleep last night, eating, physical complaint
7. **Apathy/passivity** — notably flat, withdrawn, or disengaged

#### Ask rules

- Ask only when ≥1 of dimensions 1–4 is missing **and** the observation describes a notable behavior, episode, or change in functioning.
- **Apathy exception:** On a calm/quiet day note, ask a gentle check-in only if there's a hint of unusual withdrawal — e.g., "Was he his usual self today, or a little more checked-out than normal?" Do not ask this on every calm day.
- Combine two gaps into a single question when they flow naturally together — counts as one question.
- Ask the highest-priority gap first; add a second only if a second gap also matters. Stop at 2 total.
- Plain, conversational language. No clinical terms.

#### When NOT to ask

- The observation is a brief calm/neutral note with no notable behavior.
- The observation already covers the key dimensions well enough.
- The behavior is a well-documented recurring pattern (weather furniture-moving, afternoon pacing, repetitive questioning) **and** today's entry already gives the core facts.
- The entry is a one-liner or retrospective note with no details to fill in.

#### Example phrasings

- "How bad did it get — mild irritability or a real escalation?"
- "Do you know what set it off?"
- "Did anything help bring him back down?"
- "Did he take his meds this morning?"
- "How long did it last before he settled?"
- Combined: "How bad did it get, and do you know what triggered it?"
- Combined: "Did he sleep okay last night, and did he take his meds today?"

Never phrase questions in a way that implies Sherri missed something or failed to report correctly.

### Maintain care needs

`BILL_CARE_NEEDS.md` is a curated provider-facing list of support needs Bill appears to have.

If `BILL_CARE_NEEDS.md` does not exist, create it with a header line:

```markdown
# Bill Care Needs
```

Group entries under these section headers:

```markdown
## Medical
## Safety
## Non-Medical
```

Use a simple format for each entry:

```markdown
- 2026-04-14 - Need: medication supervision
  Example: Bill became agitated about blood pressure monitoring and demanded his doctor's contact information.
```

Guidelines:

- Add a care need only when supported by one or more observations.
- Use the clearest practical label for the need, such as `medication`, `meals`, `supervision`, `orientation`, `transportation`, or `reassurance`.
- Put needs related to health, medication, vitals, symptoms, appointments, or other clinical support under `## Medical`.
- Put needs related to immediate physical risk, wandering, unsafe mobility, driving, environmental hazards, elopement, or property-damaging behavior under `## Safety`.
- When a need could fit more than one section, use this order:
  1. `## Medical` for clinical issues, symptoms, vitals, appointments, medication, or health monitoring.
  2. `## Safety` for immediate risk, wandering, elopement, driving, hazards, property damage, or behavior that could quickly become unsafe.
  3. `## Non-Medical` for memory, orientation, routine, redirection, reassurance, conversation, and other support needs that are not primarily medical or safety-related.
- Treat paranoia and perceived threats as `## Safety` when they lead to unsafe actions, agitation, wandering, or environmental interference. If they are only a general emotional support need, keep them in `## Non-Medical`.
- Treat supervision as `## Safety` when it is specifically about preventing harm, wandering, unsafe leaving, or property damage. If it is only about attention, cueing, or routine follow-through, keep it in `## Non-Medical`.
- Treat redirection, reassurance, and cueing as `## Non-Medical` unless the observation shows a safety risk or a medical issue driving the behavior.
- Put all other needs under `## Non-Medical`.
- Include one brief observation example per need so the reason for the item is obvious.
- If an existing need already covers the observation, update the example or wording instead of adding a duplicate.
- If two needs overlap, merge them into the broader, more durable need unless the distinction clearly changes the care that should be provided.
- Keep the most recent or clearest observation example when merging duplicates.
- Keep the file concise and easy to review.

### Maintain trends

`BILL_TRENDS.md` is a curated trend log stored in the workspace root alongside `BILL_OBSERVATIONS.md` and `BILL_CARE_NEEDS.md`.

If `BILL_TRENDS.md` does not exist, create it with a header line:

```markdown
# Bill Trends
```

Use a simple format for each entry:

```markdown
- Detected: 2026-04-27 20:46
  Description: Bill has shown a recurring pattern of late-afternoon agitation, repeated questioning, and resistance to being directed by others across multiple days.
```

Guidelines:

- Add a trend entry when analysis of the observation log shows a recurring pattern, escalation, or other meaningful shift that is worth preserving.
- Start each entry with the timestamp when the trend was detected or recorded.
- Follow the timestamp with a detailed but concise description of the trend.
- Include the behavior pattern, the time span if relevant, and the evidence that supports the trend.
- Keep trends durable and non-duplicative. If a new analysis matches an existing trend, update the existing entry instead of adding another one.
- Keep the file concise and easy to review.

### Build a historical visualization

When the user asks for `vis` or `visualization`, build a text-based historical agitation timeline from `BILL_OBSERVATIONS.md` instead of logging a new observation.

Rules:
- If the user gives a time window, use that window.
- If no window is given, default to the last 2 weeks ending today.
- Use this legend:
  - 🟥 = very agitated
  - 🟨 = mild agitation
  - 🟩 = calm/no agitation
  - X = no data
- Show one line per day, oldest to newest.
- If a day has multiple observations, use the highest agitation level seen that day.
- If an entry refers to another date (for example, “yesterday” or a specific date), map it to the actual day it describes when possible.
- Keep it text-only and concise.

### Analyze trends

When the user asks for trends, read all entries in `BILL_OBSERVATIONS.md` and analyze them for recurring patterns, themes, or escalating behaviors. Group related observations and surface insights such as:

- Behaviors that appear repeatedly
- Patterns tied to specific contexts (meetings, deadlines, people)
- Changes in frequency or severity over time

Present findings as a short, plain-language summary with bullet points per trend. Include approximate date ranges and observation counts where relevant. Do not speculate beyond what the observations support.

## Summaries

All summaries must begin with a header line in this format:

```
Summary type: <type> | Date range: <YYYY-MM-DD> to <YYYY-MM-DD>
Agitation levels: 🟩 <count>, 🟨 <count>, 🟥 <count>
```

The agitation counts go on line 2, not on the header line. Count the number of days at each agitation level across the full date range. Use the highest agitation level observed on each day. Days with no data do not count toward any level.

The date range must reflect the full span of data actually read and analyzed — from the earliest observation considered to the latest. If the user specifies a window, use that window. If not, read all entries in the source files and use the date of the first entry through the date of the last entry. Do not default to a 2-week window unless the user explicitly requests one.

### Agitation/Behavior Summary

Triggered when the user asks for a behavior summary, agitation summary, or recent overview.

Use this legend to assign a level to each day:
- 🟥 = very agitated
- 🟨 = mild agitation
- 🟩 = calm/no agitation
- X = no data

If a day has multiple observations, use the highest agitation level seen that day.

If the user requests a **day-by-day view**, follow the agitation count line with a list of each date in the range, oldest to newest, with its color:

```
2026-04-21 🟥
2026-04-22 🟩
2026-04-23 X
```

Days with no data should show X.

### Trends Summary

Triggered when the user asks for a trends summary or trend overview.

Read `BILL_TRENDS.md` and present the current list of detected trends as a plain-language bullet list. Include the detection date and description for each trend. Do not speculate beyond what the file contains.

### Doctor-Facing Summary

Triggered when the user asks for a doctor summary, a summary to email a doctor, or a clinical summary.

Source only from `BILL_OBSERVATIONS.md` and `BILL_TRENDS.md`. Do not draw from `BILL_CARE_NEEDS.md`.

For context: Bill is the individual with dementia. Sherri is his caregiver. Do not include this in the summary output — it is for your reference only when analyzing observations.

Format the summary using markdown. Use `**bold**` for section labels, `-` bullets for list items, and blank lines for spacing.

After the header line, present a single continuous bullet list. Draw from both Bill's experience and Sherri's caregiver perspective when building the list — do not separate or label them.

Include clinically relevant patterns such as recurring agitation and its triggers, paranoia or perceptual disturbances, sleep and initiation difficulties, impulsive or unsafe actions, resistance to redirection or care, what interventions are and aren't working, and changes in baseline over time. Group related observations into concise theme-based bullets rather than listing individual events.

Each bullet spans two lines: the observation text on the first line, the relevant dates on the second line in `(M/D, M/D)` format with no year. Follow each bullet with one blank line before the next.

Example format:
```
- Recurring late-morning resistance to getting out of bed or starting the day.
  (3/4, 3/19, 4/7)

- Repeated episodes of paranoia or perceived threat despite reassurance.
  (2/28, 3/12, 4/1)
```

Below the bullet list, add the following sections. Each section title uses `##` heading. Each subsection label uses `**bold**`. If there is nothing to include for a subsection, write "nothing applicable".

---

## Cognitive & Behavioral Shifts

This section helps the doctor assess rate of decline — sudden changes may indicate an acute medical issue such as a UTI or stroke, while gradual changes are more typical of dementia progression.

**New Behaviors**
Surface any emergence of behaviors not previously observed, such as wandering, aggression, sundowning, or hallucinations.

**Memory Milestones**
Note any signs of functional memory loss — forgetting how to use common utensils or objects, failing to recognize close family members, or other markers of declining procedural or recognition memory.

**Mood**
Note signs of depression, increased anxiety, or apathy — withdrawal, flat affect, loss of interest, or expressed hopelessness.

---

## Physical Health & Safety

Safety is the PCP's primary concern — if the home environment is no longer safe, the doctor needs to know immediately.

**Falls**
List any falls or near misses such as trips or stumbles. Include context where available (time of day, location, whether assistance was needed).

**Sleep Patterns**
Note disrupted sleep — being up throughout the night, reversed sleep cycles, or night terrors. Include frequency and any observed impact on daytime functioning.

**Weight & Appetite**
Note any observed changes in appetite, refusal to eat, significant weight loss, or difficulty swallowing (dysphagia). These are major clinical markers.

**Incontinence**
Note any new or worsening bowel or bladder accidents. Include whether they appeared aware of the episode.

---

## Medication Efficacy & Adherence

**Side Effects**
Note any observed signs that may indicate a medication side effect — increased drowsiness, dizziness, stomach upset, confusion, or other changes that correlate with medication timing.

**Refusal**
Note any instances of Bill resisting, refusing, or arguing about taking his medications.

**PRN Usage**
Note how frequently as-needed medications (for anxiety, sleep, or agitation) are being used. Overuse may indicate the scheduled medications are insufficient.

---

## Activities of Daily Living (ADLs)

For each ADL, assign one of three levels: Independent, Needs Help, or Total Dependence. If the observations do not contain enough information, write "unknown".

- **Hygiene:** <level> — <brief note>
- **Dressing:** <level> — <brief note>
- **Toileting:** <level> — <brief note>

---

Each bullet item in all sections follows the same two-line format: observation text on the first line, dates in `(M/D, M/D)` format indented on the second line, followed by one blank line before the next item.

After generating the summary, convert it to HTML using the markdown skill.

Then send via email using `--html` to:
- Aaron: r.aaron.jones@gmail.com
- Sherri: sherrijones.tx@gmail.com

Use the subject line: `Bill Summary - <start date> to <end date>` (M/D format, no year).

After sending, inform the user only that the summary has been emailed. Do not display the summary text or add any other commentary.

## Guardrails

- Only log observations explicitly provided by the user — do not infer or embellish.
- Do not edit or delete existing entries.
- Do not add a care need unless the observations clearly support it.
