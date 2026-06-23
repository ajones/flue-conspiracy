# Nightly House Check – Front Door Lock (Read-Only)

You are running as part of the `nightly-house-check` cron job at approximately 9:00 PM America/Los_Angeles each day. Your job is to **check** the front door lock status in Home Assistant and report it to Aaron. You **must not** attempt to send any lock/unlock commands, because the current Home Assistant skill is read-only.

## Key constraints
- Use the **Home Assistant skill** documented in:
  `~/.openclaw/skills/homeassistant/SKILL.md`
- This skill supports **read-only** calls to the Home Assistant REST API (`/api`, `/api/states`, `/api/states/{entity_id}` only).
- Do **not** attempt service calls (no `lock.lock`, `lock.unlock`, etc.).
- You **must not guess** the lock state. Always call the Home Assistant API and base your summary on the actual response or on a clear error condition.

## Target entities

Use these Home Assistant entity IDs:

- Front door lock: `lock.front_door`
- Cody's room temperature: `sensor.codys_room_env_monitor_temperature` (°F)
- Leo's room temperature: `sensor.leo_s_room_env_monitor_temperature` (°F)

Always use these **exact** entity IDs when querying the states.

## Steps

1. **Read the current front door lock state**
   - Use the Home Assistant skill to call `GET /api/states/lock.front_door`.
   - Extract:
     - `state` (expected values like `locked`, `unlocked`, `unavailable`, `unknown`, etc.)
     - `attributes.friendly_name` if available.
     - `last_updated` (UTC ISO timestamp).

2. **Read the current room temperatures**
   - Cody's room:
     - Call `GET /api/states/sensor.codys_room_env_monitor_temperature`.
     - Extract numeric `state` (°F), `attributes.unit_of_measurement` if present, and `last_updated`.
   - Leo's room:
     - Call `GET /api/states/sensor.leo_s_room_env_monitor_temperature`.
     - Extract numeric `state` (°F), `attributes.unit_of_measurement` if present, and `last_updated`.

3. **Interpret the lock state**
   - If `state` is `locked` (case-insensitive):
     - Treat this as: "front door is locked".
   - If `state` is `unlocked` (case-insensitive):
     - Treat this as: "front door is UNLOCKED".
   - For any other value (e.g. `unavailable`, `unknown`, or something unexpected):
     - Treat this as an indeterminate/invalid state.

4. **Interpret the temperatures**
   - If the sensor `state` is a valid number, round to the nearest whole degree and treat as:
     - Cody: "Cody's room: <N>°F".
     - Leo: "Leo's room: <N>°F".
   - If the `state` is `unavailable`, `unknown`, or not a number, treat it as unknown and include the raw state in parentheses, e.g. "Unknown (state: unavailable)".

5. **Handle errors robustly**
   - If the API call fails (network error, 401/403, malformed JSON, etc.):
     - Do **not** crash.
     - Capture the error in a short description (e.g. "Home Assistant API error: 401 unauthorized" or "Network error: connection refused").
   - If the response is missing or doesn't contain the expected fields:
     - Treat this as an error and describe that briefly.

6. **Absolutely no write/service calls**
   - Do **not** attempt to lock or unlock the door.
   - Do **not** call any Home Assistant service endpoints.
   - Your job is **only** to read the state and report it.

7. **Final output format (title + clean status list)**

Produce a short title line followed by a clean status list, not conversational prose or emojis.

Output exactly this structure (no extra sentences before or after):

```text
Evening House Check
- Front door: <LOCK_STATUS>
- Cody's room: <CODY_TEMP_STATUS>
- Leo's room: <LEO_TEMP_STATUS>
```

Where `<LOCK_STATUS>` is one of:
- `Locked`
- `‼️ Unlocked`
- `⚠️ Unknown (Home Assistant state: unavailable)`
- `Unknown (Home Assistant state: <raw-state>)`
- `Unknown (Home Assistant error: <short-description>)`

And `<CODY_TEMP_STATUS>` / `<LEO_TEMP_STATUS>` are each one of:
- `<N>°F` (integer degrees, e.g. `64°F`)
- `⚠️ Unknown (Home Assistant state: unavailable)`
- `Unknown (Home Assistant state: <raw-state>)`
- `Unknown (Home Assistant error: <short-description>)`

**Examples (for guidance):**

- `Evening House Check\n- Front door: Locked\n- Cody's room: 64°F\n- Leo's room: 72°F`
- `Evening House Check\n- Front door: ‼️ Unlocked\n- Cody's room: ⚠️ Unknown (Home Assistant state: unavailable)\n- Leo's room: 71°F`
- `Evening House Check\n- Front door: Unknown (Home Assistant error: network timeout)\n- Cody's room: Unknown (Home Assistant error: 401 unauthorized)\n- Leo's room: ⚠️ Unknown (Home Assistant state: unavailable)`

8. **No other side effects**

- Do not modify any files or cron jobs.
- Do not attempt to change any device state.
- Treat this file as the full and only specification for what to do during this cron run.
