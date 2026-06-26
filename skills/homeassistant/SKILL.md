---
name: homeassistant
description: Read Home Assistant entity states and control lights and devices via the REST API. Use when the user asks about home sensors, device states, lights, switches, integrations, or anything related to their smart home. Also use when asked to run a Home Assistant audit or health check — load references/audit.md for that workflow.
metadata:
---

# Home Assistant Skill

> **Disabled for raven-lead.** Do not load or execute this skill in agent sessions. All Home Assistant work goes through the `home-assistant` subagent and its `ha_*` tools (`ha_get_entity`, `ha_call_service`, `ha_ring_live_snapshot`, etc.). This file remains as reference documentation only.

## Overview

Interact with the Home Assistant instance via its REST API.

Environment variables (injected from `raven.json5` into the agent shell):
- `HOMEASSISTANT_URL` — base URL (e.g. `http://192.168.86.244:8123`)
- `HOMEASSISTANT_TOKEN` — long-lived access token

Do **not** hardcode URL/token in bash, and do **not** source stale copies from stale local files. Always use `$HOMEASSISTANT_URL` and `$HOMEASSISTANT_TOKEN`.

**jq pitfalls:** In jq, `|` binds tighter than `or`. This is wrong and yields `Cannot index string with string "entity_id"`:

```jq
# WRONG — parses as ((.entity_id | startswith("climate.")) or .entity_id) | test(...)
select(.entity_id|startswith("climate.") or .entity_id|test("sensor\\..*"))
```

Parenthesize each pipe chain on both sides of `or`:

```jq
# CORRECT
select((.entity_id | startswith("climate.")) or (.entity_id | test("sensor\\..*")))
```

Before piping curl output to jq, run the sanity check in section 1. A 401 returns plain text `401: Unauthorized`, which jq cannot parse (`Expected string key before ':' at line 1, column 4`).

**Time display rule:** All timestamps must be shown in Pacific time (America/Los_Angeles — PST/PDT). HA returns timestamps in UTC. Convert before displaying using:

```bash
TZ=America/Los_Angeles date -jf '%Y-%m-%dT%H:%M:%S' "$(echo '<utc_timestamp>' | sed 's/\+00:00//;s/Z$//')" '+%Y-%m-%d %I:%M %p %Z'
```

Or in jq, subtract the offset and format — but prefer the `date` command for accuracy since PDT (−7h) and PST (−8h) differ seasonally.

## Additional references

- **[references/audit.md](references/audit.md)** — load this when the user asks for a Home Assistant audit, integration health check, or device health report.
- **[references/ac-mgmt.md](references/ac-mgmt.md)** — load this when the user asks about temperature, AC, heating, thermostats, or climate control.

---

## 1. Sanity check API availability

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" "$HOMEASSISTANT_URL/api/" | jq -r '.message'
# Expect: "API running."
```

If this returns 401, fix the token before proceeding.

---

## 2. Reading entity state

### Fetch all states

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOMEASSISTANT_URL/api/states" | jq '.'
```

### Get a single entity by `entity_id`

```bash
ENTITY_ID="binary_sensor.cat_box_time_to_clean"
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states/$ENTITY_ID" | jq '{entity_id, state, friendly_name: .attributes.friendly_name, attributes}'
```

### Search entities by name pattern

```bash
PATTERN="cat|litter"
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq -r ".[] | select(
    (.entity_id | test(\"${PATTERN}\"; \"i\")) or
    ((.attributes.friendly_name // \"\") | test(\"${PATTERN}\"; \"i\"))
  ) | \"\(.entity_id) => \(.state) (\(.attributes.friendly_name // \"\"))\""
```

- One match → report its state.
- Multiple matches → list candidates, ask user to disambiguate.
- No matches → say so, suggest alternate patterns.

### List entities by integration

```bash
INTEGRATION="simplisafe"
ENTITIES=$(curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{\"template\": \"{{ integration_entities(\\\"${INTEGRATION}\\\") | list | tojson }}\"}" \
  "$HOMEASSISTANT_URL/api/template")

curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq --argjson ids "$ENTITIES" \
  -r '[.[] | select(.entity_id as $id | $ids | contains([$id]))] |
      sort_by(.entity_id) | .[] |
      "\(.entity_id)\t\(.state)\t\(.attributes.friendly_name // "")"'
```

---

## 3. Calling services (write operations)

All service calls use `POST /api/services/{domain}/{service}`. The domain in the URL **must match the entity domain**.

### Light control

```bash
ENTITY_ID="light.bedroom"

# Turn on
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"$ENTITY_ID\"}" \
  "$HOMEASSISTANT_URL/api/services/light/turn_on"

# Turn on with brightness (0–255) and color temp (mireds)
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"$ENTITY_ID\", \"brightness\": 128, \"color_temp\": 350}" \
  "$HOMEASSISTANT_URL/api/services/light/turn_on"

# Turn off
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"$ENTITY_ID\"}" \
  "$HOMEASSISTANT_URL/api/services/light/turn_off"

# Toggle
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"$ENTITY_ID\"}" \
  "$HOMEASSISTANT_URL/api/services/light/toggle"
```

Natural language brightness mappings:
- "dim" / "low" → 64
- "half" / "50%" → 128
- "bright" / "full" → 255
- Percentage: multiply by 2.55

Color temperature mappings:
- "warm" / "soft" → 400 mireds
- "neutral" / "daylight" → 300 mireds
- "cool" / "bright white" → 200 mireds

### Switch control

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"switch.the_lab_ceil_led_power\"}" \
  "$HOMEASSISTANT_URL/api/services/switch/turn_off"
```

### Service domain reference

| Domain | turn_on | turn_off | toggle | Notes |
|---|---|---|---|---|
| `light` | Yes (+ brightness, color) | Yes | Yes | |
| `switch` | Yes | Yes | Yes | On/off only |
| `scene` | Yes (activate) | No | No | |
| `cover` | Yes (open) | Yes (close) | Yes | Also: `stop`, `set_position` |
| `fan` | Yes | Yes | Yes | |
| `climate` | — | — | — | Use `set_hvac_mode`, `set_temperature` |
| `media_player` | Yes | Yes | Yes | |
| `lock` | — | — | — | Use `lock.lock`, `lock.unlock` |

---

## 4. Device resolution: natural language → entity_id

### The HA object model

```
Area  (room/zone)
 └─ Device  (physical hardware)
     └─ Entity  (state endpoint: light.*, switch.*, sensor.*, …)
```

### Step 1 — Resolve the area

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"template": "{% for a in areas() %}{{ a }}\t{{ area_name(a) }}\n{% endfor %}"}' \
  "$HOMEASSISTANT_URL/api/template"
```

### Step 2 — List controllable entities in the area

```bash
AREA_ID="the_lab"
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{\"template\": \"{% for dev_id in area_devices('${AREA_ID}') %}{% set dname = device_attr(dev_id, 'name') %}{% set mfr = device_attr(dev_id, 'manufacturer') %}{% set model = device_attr(dev_id, 'model') %}{% set ents = device_entities(dev_id) | list %}{% set controllable = ents | select('match', '(light|switch|scene|cover|fan|climate|media_player|lock)\\\\\\\\.') | reject('match', '.*segment_\\\\\\\\d') | reject('match', '.*(sync_send|sync_receive|reverse|led$|nightlight)') | list %}{% if controllable | length > 0 %}DEVICE: {{ dname }} ({{ mfr }} {{ model }})\\n{% for eid in controllable %}{% set s = states[eid] %}  {{ eid }}\\tstate={{ s.state }}\\tfriendly_name={{ s.attributes.friendly_name | default('') }}\\tdevice_class={{ s.attributes.device_class | default('') }}\\n{% endfor %}\\n{% endif %}{% endfor %}\"}" \
  "$HOMEASSISTANT_URL/api/template"
```

### Step 3 — Match intent to entity

Resolution order:
1. Exact `friendly_name` match → use directly.
2. Device name match with one controllable entity → use it.
3. Multiple candidates → list a short table and ask the user.
4. "All lights" in an area → prefer the HA group entity if one exists, but note it may not cover smart-plug-powered LEDs.

### Step 4 — Call the correct service

The service domain must match the entity domain: `light.*` → `light.turn_off`, `switch.*` → `switch.turn_off`.

Always verify after acting by fetching the entity state.

---

## Guardrails

- **Reads**: `GET /api`, `GET /api/states`, `GET /api/states/{entity_id}`, `POST /api/template`.
- **Writes**: `POST /api/services/{domain}/{service}` for domains: `light`, `switch`, `scene`, `cover`, `fan`, `media_player`, `lock`.
- Do **not** log or echo the full token in any output.
- Single, clearly identified entity → act directly.
- Ambiguous or bulk operations ("turn off all lights") → confirm with user first.
- The service domain in the URL must match the entity domain.

---

## References

- Home Assistant REST API: https://developers.home-assistant.io/docs/api/rest
- Env vars: `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN`
