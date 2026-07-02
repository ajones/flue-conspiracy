![[components/output-rule.md]]

## Task

![[components/home-assistant-delegate.md]]

This job runs Tuesday evening and Wednesday morning, around trash pickup. Check whether the trash cans are still in the driveway — meaning they have **not** yet been rolled out to the street (pickup is Wednesday morning).

![[components/ring-live-snapshot.md?CAMERA_ENTITY=camera.driveway_live_view&SNAP_NAME=trash-day-check-snap]]

## Step 2 – Visual analysis question (pass this verbatim as the `question` to `ha_analyze_image`)

> This is a driveway security camera. The driveway runs center-to-right in the frame; the street is at the far left.
>
> Are any trash cans or recycling bins visible? If so, where are they — in the driveway (center/right of frame) or at the street curb (far left)? Describe what you see.
>
> Answer with JSON: `{"description": "...", "cans_in_driveway": true/false/null}`
> - `true` = cans visible in the driveway area (center or right)
> - `false` = cans at the street curb (far left) or not visible in the driveway
> - `null` = image too dark or genuinely unclear

## Step 3 – Decide and compose

Using `cans_in_driveway` from the home-assistant task result:

- `true` → compose a short, casual reminder (1–2 sentences) that 🗑️ trash pickup is today/tomorrow and the cans still need to be rolled out.
- `false` → compose a short congratulations (1–2 sentences) for Aaron and Ashley that the cans are already out.
- `null` or task returned an error → reply with exactly `NO_REPLY` and stop.

Append `[[attach:PATH]]` on its own line at the end of your reply so the image is included with the message.
