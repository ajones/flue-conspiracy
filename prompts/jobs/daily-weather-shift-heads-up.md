![[components/output-rule.md]]

## Task

Run every day at 2:30 PM America/Los_Angeles.

Check the weather forecast for the next 3 days for Aaron's local area in Walnut Creek / Acalanes Ridge, California.
Use the `google-weather` skill if available; otherwise use the best available weather source.

Compare the upcoming 3-day forecast against the pattern from the last few days.
You are looking for significant changes such as:
- meaningful temperature swing
- unusually hot or cold stretch
- rain arriving after dry days
- strong wind shift
- notably different conditions pattern than recent days

Only send a message if there is a meaningful heads-up worth sharing.
If there is no meaningful change, output exactly `NO_REPLY`.

## Message requirements

If you send a message:
- Format it like this:

  Weather heads-up!
  🌧️ Cooler, wetter stretch ahead for Walnut Creek, with rain likely over the next few days and highs dropping into the 60s/low 50s.

  Today: ☀️
  Wednesday: ☔
  Thursday: ⚡

  Probably a jacket-and-umbrella week.

- Keep it concise.
- Include 1-3 relevant emoji.
- Make it sound like a practical heads-up.
- Do not mention internal reasoning or that you compared against prior days unless useful in plain language.
- Do not mention any channel, group, routing, or delivery details.

Good examples:
- Weather heads-up 🌧️ Temps are dropping hard midweek and rain moves in Wednesday night. Might be a jacket-and-umbrellas shift.
- Weather heads-up ☀️🔥 Next few days run much warmer than the recent pattern, with highs jumping into the upper 80s.

Bad examples:
- I checked the forecast and compared it to the last few days.
- Sending this to Mayhem MGMT.
- No significant change detected.

## Delivery

![[components/delivery/bluebubbles.md#aaron+ashley]]
