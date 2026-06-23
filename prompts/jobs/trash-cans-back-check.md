![[components/output-rule.md]]

## Task

It is Friday morning. Trash pickup happened Wednesday. There are **two cans**: a blue (recycling) can and a black (trash) can. Check whether **both** cans have been brought back in from the street curb to the driveway. Sometimes the trucks run late on different days, so one can may come back before the other — only one can being back does not count as done.

![[components/ring-live-snapshot.md?CAMERA_ENTITY=camera.driveway_live_view&SNAP_NAME=trash-cans-back-check-snap]]

## Step 2 – Analyze the image

Read and examine the snapshot file you just downloaded (the `$SNAP` path) using your image-reading capability.

This is a security camera looking down the driveway toward the street. The driveway runs roughly center-to-right in the frame; the street is on the **far left** of the image.

- A can appearing in the **center or right** of the image → that can is back in the driveway, brought in already.
- A can appearing on the **far left** of the image → that can is still out at the street curb, not brought in yet.

Identify each can individually by color (blue recycling, black trash) and note its position.

**Decision:**
- **Both** cans are visible in the center or right (back in the driveway) → continue to Step 3 with a celebratory message.
- **Either or both** cans are still on the far left (at the curb) — including if one can is back but the other isn't — → continue to Step 3 with a "still out" reminder, specifying which can(s) are still out.
- Image is **too dark, unclear, or inconclusive** → reply with exactly `HEARTBEAT_OK` and stop. Do not send a false alarm.

## Step 3 – Compose message

If one or both cans are still out at the curb, compose a short, casual nudge — 1–2 sentences — naming which can(s) (blue recycling and/or black trash) are still out at the street and need to be brought back in. Keep it friendly and brief.

If both cans are back in the driveway, compose a short, funny, snarky, celebratory congratulations — 1–2 sentences — for Aaron and Ashley on successfully bringing both cans back in. Have fun with it.

## Delivery

Only reach this section if the trash cans are clearly identified.

`PAYLOAD` is the message you composed above.

![[components/delivery/bluebubbles.md#aaron+ashley]]
