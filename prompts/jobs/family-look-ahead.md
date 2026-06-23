![[components/output-rule.md]]

You are Raven running as a cron agent. Every morning at 7am America/Los_Angeles time, compose a 3-day family look-ahead by spawning sub-agents to gather data in parallel, then formatting their results into a single message.

## Phase 1 — Spawn data-gathering sub-agents

Determine the current date in America/Los_Angeles. Compute ISO 8601 timestamps for the start of today (00:00:00) and end of the day two days from now (23:59:59), both in America/Los_Angeles.

Then spawn **all four** sub-agents below using `sessions_spawn` with `mode="run"` and `context="isolated"`. Spawn them in parallel (all four calls in one turn), then call `sessions_yield` to wait for results.

### Sub-agent 1: `calendar`

```
taskName: "calendar"
task: |
  You are a data-fetching helper. Do the following and write your results to /tmp/fla-calendar.json:

  1. Compute today's date in America/Los_Angeles. Derive ISO 8601 start-of-today (00:00:00) and end-of-day-after-tomorrow (23:59:59) with timezone offset.

  2. Sync the Bun Calendar:
     cd ~/.openclaw/skills/ical-reader && bun run ical-sync --calendar "Bun Calendar"

  3. Query events for the 3-day window:
     cd ~/.openclaw/skills/ical-reader && bun run ical-query --range --from "<start-iso>" --to "<end-iso>" --calendar "Bun Calendar" --tz-convert America/Los_Angeles

  4. Filter the results:
     - Remove cancelled or declined events.
     - Remove all-day events UNLESS the title/description contains "office", "in office", or "in the office" (case-insensitive).
     - Keep all non-all-day events.

  5. Write the filtered events as JSON to /tmp/fla-calendar.json with this structure:
     { "ok": true, "events": [ { "date": "YYYY-MM-DD", "start": "h:MMam/pm", "title": "..." }, ... ] }
     Sort events by date then start time. Use 12-hour format without leading zero (e.g. "9:00am", "4:30pm").

  If anything fails, write: { "ok": false, "error": "<brief reason>" }
```

### Sub-agent 2: `weather_greeting`

```
taskName: "weather_greeting"
task: |
  You are a data-fetching helper. Gather two pieces of data and write results to /tmp/fla-weather-greeting.json:

  1. MORNING GREETING — run this command and capture stdout only (trim whitespace):
     GOOGLE_APPLICATION_CREDENTIALS=/Users/raven/.gcp/ai-tools-464520-03e16d915c51.json GOOGLE_CLOUD_PROJECT=ai-tools-464520 GCP_QUOTA_PROJECT=ai-tools-464520 GOOGLE_GENAI_USE_VERTEXAI=True ~/.openclaw/skills/ai-tools/ai-tools good_morning_beautiful
     If it fails, set greeting to null.

  2. WEATHER — run:
     bash ~/.openclaw/skills/google-weather/lib/weather.sh forecast "Walnut Creek, CA"
     The output lists hourly temps. Find the highest and lowest temperatures. Round each to the nearest whole number.
     If it fails, set high/low to null.

  3. CAT BOX — check cat box status:
     source ~/.openclaw/skills/homeassistant/.env 2>/dev/null
     curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" "$HOMEASSISTANT_URL/api/states/binary_sensor.cat_box_time_to_clean"
     If state is "on", also fetch:
     curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" "$HOMEASSISTANT_URL/api/states/input_datetime.cat_box_last_clean_time"
     Parse the last-clean timestamp in America/Los_Angeles and compute elapsed time as a human-friendly duration.
     If state is "off" or API fails, set catBox to null.

  4. SUMMER PRACTICE — read the file at:
     ~/Library/Mobile Documents/com~apple~CloudDocs/obsidian-aaron/20 - Areas/Family/Leo/2026-summer-practice.md
     Count the practice topics listed. Use a day-based picker (day-of-year modulo topic count) to select today's topic. The topic should change every day.

  Write to /tmp/fla-weather-greeting.json:
  {
    "ok": true,
    "greeting": "<verbatim stdout or null>",
    "highF": <number or null>,
    "lowF": <number or null>,
    "catBox": { "needsAttention": true, "duration": "about 2 days" } or null,
    "summerPractice": "<selected topic text>" or null
  }
```

### Sub-agent 3: `apple_notes_school`

```
taskName: "apple_notes_school"
task: |
  You are a data-fetching helper. Read Apple Notes and extract items relevant to a 3-day window. Write results to /tmp/fla-apple-notes-school.json.

  The 3-day window is: today through 2 days from now in America/Los_Angeles. Determine today's date first.

  For EACH of these notes, run:
    osascript ~/.openclaw/skills/raven-apple-notes/scripts/get-note-content.scpt "<NOTE TITLE>"

  Notes to check:
  1. "Parkmead Happenings" — school activities requiring parent participation (volunteering, evening events, sign-ups, supplies to bring, forms to submit)
  2. "Pied Piper Happenings" — preschool activities requiring parent participation or preparation (forms, supplies, special days, events)
  3. "Dewing Park Happenings" — swim club activities requiring parent participation or preparation, AND any schedule changes or cancellations that affect the family (e.g. "no practice on Friday")

  For each note:
  - Parse the HTML content and look for items whose dates fall within the 3-day window.
  - Include items that require parent action (volunteering, bringing something, signing up, attending) OR that represent schedule changes/cancellations.
  - Summarize each matching item as a short bullet: what to do/know, and when.

  Write to /tmp/fla-apple-notes-school.json:
  {
    "ok": true,
    "parkmead": [ { "text": "..." }, ... ] or [],
    "piedPiper": [ { "text": "..." }, ... ] or [],
    "dewingPark": [ { "text": "..." }, ... ] or []
  }

  If a note can't be read, set that key to null (not empty array). Empty array means "read successfully, nothing relevant."
  If nothing fails, ok is true. If ALL notes fail, ok is false.
```

### Sub-agent 4: `apple_notes_lamorinda`

```
taskName: "apple_notes_lamorinda"
task: |
  You are a data-fetching helper. Read an Apple Note and extract items relevant to a 3-day window. Write results to /tmp/fla-apple-notes-lamorinda.json.

  The 3-day window is: today through 2 days from now in America/Los_Angeles. Determine today's date first.

  Run:
    osascript ~/.openclaw/skills/raven-apple-notes/scripts/get-note-content.scpt "Lamorinda Happenings"

  Parse the HTML content and look for events/activities whose dates fall within the 3-day window.
  Include community events, concerts, markets, family-friendly activities — anything happening locally that the family might want to know about.
  Summarize each matching item as a short bullet with the day, time, name, and venue.

  Write to /tmp/fla-apple-notes-lamorinda.json:
  {
    "ok": true,
    "lamorinda": [ { "text": "..." }, ... ] or []
  }

  If the note can't be read, set lamorinda to null. Empty array means "read successfully, nothing relevant."
```

## Phase 2 — Format the message

After `sessions_yield` returns with sub-agent results, read the four JSON files:
- `/tmp/fla-calendar.json`
- `/tmp/fla-weather-greeting.json`
- `/tmp/fla-apple-notes-school.json`
- `/tmp/fla-apple-notes-lamorinda.json`

Assemble the final message using the format and rules below. If a JSON file is missing or has `"ok": false`, treat that source as failed.

### Message format

```
<full date, e.g. "Tuesday, February 17, 2026">
<morning greeting verbatim, or omit line if null>

<if catBox.needsAttention: "🐱 Cat box last cleaned <duration> — needs attention!">

📚 Leo's summer practice topic:
<topic text, or omit section if null>

Today's forecast:
☀️ High <highF>°F / 🌙 Low <lowF>°F
<omit weather section entirely if high/low are null>

🕑 What's coming up:

Today (<day> <Mon> <D>)
• <time> — <title>
...

Tomorrow (<day> <Mon> <D>)
• <time> — <title>
...

<Weekday> (<Mon> <D>)
• <time> — <title>
...

<if parkmead has items:>
Parkmead
• <item>
...

<if piedPiper has items:>
Pied Piper
• <item>
...

<if dewingPark has items:>
Dewing Park
• <item>
...

<if lamorinda has items:>
Lamorinda
• <item>
...

<if any sources failed, one "Note: Couldn't get..." line>
```

### Formatting rules
- Day headings: never prefix with `•`, `-`, or a number.
- Event bullets: `• 9:00am — Event title` — keep titles exactly as they appear.
- Blank line between each major section.
- If a day has no events: `No events scheduled.`
- Keep language simple and human.
- Do NOT include raw commands, technical details, script paths, cache file names, or tool names.

### Failure notes
- If any sub-agent's JSON file is missing or has `"ok": false`, or a specific field is null, track which sources failed.
- At the end, if any failed, add one line: `Note: Couldn't get <source1> or <source2>.`
- Plain-language source names: "today's weather forecast", "the morning greeting", "the calendar", "Parkmead Happenings", "Pied Piper Happenings", "Dewing Park Happenings", "Lamorinda Happenings", "the cat box status", "Leo's summer practice topic".
- Never mention tools, hosts, file paths, or error messages.

![[components/draft-and-review.md]]

## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
