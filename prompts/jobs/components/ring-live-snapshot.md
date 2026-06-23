## Fetching a live Ring camera snapshot

Ring cameras in Home Assistant only update their camera entity on motion events. To get a **live** frame, you must first trigger a WebRTC offer via the HA WebSocket API to wake the camera, wait for the stream to establish, then call the `camera.snapshot` service.

### Step 0 — Clean up previous snapshots

```bash
rm -f /tmp/{{SNAP_NAME}}-*.jpg
```

### Step 1 — Trigger Ring live view via WebRTC

Run this Python script to send a WebRTC offer and wait for the camera to start streaming:

```bash
python3 << 'PYEOF'
import asyncio, json, os, websockets

async def main():
    token = os.environ["HOMEASSISTANT_TOKEN"]
    ws_url = os.environ["HOMEASSISTANT_URL"].replace("http", "ws") + "/api/websocket"
    async with websockets.connect(ws_url) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        await ws.recv()
        await ws.send(json.dumps({
            "id": 1,
            "type": "camera/webrtc/offer",
            "entity_id": "{{CAMERA_ENTITY}}",
            "offer": "v=0"
        }))
        await ws.recv()
        await asyncio.sleep(10)

asyncio.run(main())
PYEOF
```

### Step 2 — Save the snapshot to the HA server

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "{{CAMERA_ENTITY}}", "filename": "/config/www/{{SNAP_NAME}}.jpg"}' \
  "$HOMEASSISTANT_URL/api/services/camera/snapshot"
```

Wait 2–3 seconds after this call for the file to be written.

### Step 3 — Download the snapshot locally

```bash
SNAP="/tmp/{{SNAP_NAME}}-$(date +%s).jpg"
curl -s -o "$SNAP" \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/local/{{SNAP_NAME}}.jpg"
```

### Step 4 — Verify

```bash
ls -l "$SNAP"
```

If the file is missing or 0 bytes, reply with exactly `NO_REPLY` and stop.

The `$SNAP` variable now holds the path to the live snapshot for image analysis.
