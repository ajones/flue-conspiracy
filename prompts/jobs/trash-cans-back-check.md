![[components/output-rule.md]]

## Task

![[components/home-assistant-delegate.md]]

It is after trash pickup. Check whether **both** trash cans have been brought back in from the street curb to the driveway. There are two cans: a **blue** recycling can and a **black** trash can. Both must be back for the job to send a success message — one can being back does not count as done.

![[components/ring-live-snapshot.md?CAMERA_ENTITY=camera.driveway_live_view&SNAP_NAME=trash-cans-back-check-snap]]

## Step 2 – Visual analysis question (pass this verbatim as the `question` to `ha_analyze_image`)

> This is a driveway security camera. The driveway runs center-to-right in the frame; the street is at the far left.
>
> There are two trash cans: a blue recycling can and a black trash can. For each can:
> - If visible in the center or right of the frame → it is back in the driveway.
> - If visible at the far left → it is still at the street curb.
>
> Describe what you see. Are the blue can and black can visible? Where is each one?
>
> Answer with JSON:
> `{"description": "...", "blue_can_in_driveway": true/false/null, "black_can_in_driveway": true/false/null}`
> - `true` = that can is in the driveway
> - `false` = that can is still at the curb
> - `null` = cannot tell (image unclear or can not visible)

## Step 3 – Decide and compose

Using the result from the home-assistant task:

- **Both** `blue_can_in_driveway` and `black_can_in_driveway` are `true` → compose a short, funny, snarky congratulations (1–2 sentences) for Aaron and Ashley. Have fun with it.
- **Either or both** are `false` → compose a casual nudge (1–2 sentences) naming which can(s) are still at the curb.
- **Either or both** are `null`, or task returned an error → reply with exactly `NO_REPLY` and stop.

Append `[[attach:PATH]]` on its own line at the end of your reply so the image is included with the message.
