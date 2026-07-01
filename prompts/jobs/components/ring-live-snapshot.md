## Step 1 — Fetch a live Ring camera snapshot

![[home-assistant-delegate.md]]

Ring cameras in Home Assistant only update their camera entity on motion events. To get a **live** frame, delegate to the `home-assistant` subagent and have it call `ha_ring_live_snapshot` with:

- `entity_id`: `{{CAMERA_ENTITY}}`
- `snap_name`: `{{SNAP_NAME}}`

The tool wakes the camera via WebRTC, saves a snapshot on the HA server, downloads it locally, and returns JSON with a `path` field. Use that `path` for image analysis in the next step.

When the composed user-facing reply should include the snapshot image, append `[[attach:PATH]]` on its own line (where `PATH` is the local `path` from the tool result). The marker is stripped from the visible text; the image is sent as a Telegram photo attachment.

If the tool fails or the file is missing or empty, reply with exactly `NO_REPLY` and stop.
