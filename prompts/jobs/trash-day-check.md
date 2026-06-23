![[components/output-rule.md]]

## Task

This job runs Tuesday evening and Wednesday morning, around trash pickup. Check whether the trash cans are still in the driveway — meaning they have **not** yet been rolled out to the street for trash pickup (pickup is Wednesday morning).

![[components/ring-live-snapshot.md?CAMERA_ENTITY=camera.driveway_live_view&SNAP_NAME=trash-day-check-snap]]

## Step 2 – Analyze the image

Read and examine the snapshot file you just downloaded (the `$SNAP` path) using your image-reading capability.

This is a security camera looking down the driveway toward the street. The driveway runs roughly center-to-right in the frame; the street is on the **far left** of the image.

- Trash cans/recycling bins appearing in the **center or right** of the image → still in the driveway, **not** taken out yet.
- Trash cans/recycling bins appearing on the **far left** of the image → already out at the street curb.

**Decision:**
- Trash cans are **visible in the center or right (still in the driveway)** → continue to Step 3.
- Trash cans are **on the far left (at the street curb)** or **not visible in the driveway** (already put out) → continue to Step 3, but write a short congratulations message to Aaron and Ashley instead of a reminder.
- Image is **too dark, unclear, or inconclusive** → reply with exactly `HEARTBEAT_OK` and stop. Do not send a false alarm.

## Step 3 – Compose message

If the cans are still in the driveway, compose a short, casual reminder — 1–2 sentences — that 🗑️ trash pickup is today/tomorrow (whichever is accurate based on the current day/time) and the cans still need to be rolled out. Keep it friendly and brief.

If the cans are already out at the curb, compose a short congratulations — 1–2 sentences — for Aaron and Ashley, acknowledging that the trash is handled. Keep it warm and brief.

## Delivery

Only reach this section if the trash cans are clearly identified.

`PAYLOAD` is the alert message you composed above.

![[components/delivery/bluebubbles.md#aaron+ashley]]
