![[components/output-rule.md]]

## Task

Find a photo from `https://images.nasa.gov` that is relevant to the Artemis II mission.

Use the Playwright scraper skill for this web task. Do not use ad-hoc curl or generic fetch flows for the site lookup.

## Temporary file discipline (required)

- At run start, read the injected first line for the current job id from the format `[cron:<job-id> ...]`.
- If you create helper scripts/notes/files during selection or dedupe, place them only under:
  - `/Users/raven/.openclaw/workspace/tmp/cron/<job-id>/`
- Never write helper/temp files in `/Users/raven/.openclaw/workspace` root.
- Before final output, remove scratch files you created for this run.

## Accessing prior run history
If you need to check what was sent or processed in a previous run, use the session-history skill:
  ~/.openclaw/skills/session-history/SKILL.md
Follow its instructions to locate run records and session transcripts for this job.

## Requirements

1. Prefer a real still photo, not a video result.
2. Prefer photos clearly taken **during flight** or from the mission in progress. Strongly prefer imagery from space, onboard views, Earth views, crew-in-flight moments, or other unmistakable in-flight mission photography.
3. Do **not** choose launch pad, stacking, rollout, wet dress rehearsal, training, or prelaunch hardware photos unless no in-flight Artemis II photo is available.
4. Before picking a photo, check prior successful runs for this job and avoid reusing any photo that has already been shared. Deduplicate primarily by source URL or image URL, and secondarily by title/caption if needed.
5. Pick one strong unused image.
6. Prepare a very short caption, one sentence max.
7. If no suitable unused in-flight Artemis II photo is found, reply exactly `NO_REPLY` and stop.
