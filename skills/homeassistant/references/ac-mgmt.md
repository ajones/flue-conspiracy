# AC Management Reference

How to read status and control all AC and heating systems. Load this file when the user asks about temperature, AC, heating, thermostats, or climate control.

Always discover entities dynamically via `integration_entities()` — never hardcode entity lists.

---

## System Overview

| System | Integration | Entity | Location |
|---|---|---|---|
| Main Floor thermostat | `nest` | `climate.main_floor_nest` | Main Floor |
| Bedroom thermostat | `nest` | `climate.bedroom_nest` | Bedroom |
| Basement thermostat | `nest` | `climate.basement_nest` | Basement |
| Ash Office mini-split | `cielo_home` | `climate.ash_office` | Ash Office |
| Bathroom floor heater | `homekit_controller` | `climate.mysa_eaa72c_thermostat` | Master Bathroom |

Template sensors (monitor window/split units via IR):
- `sensor.living_room_ac_state` / `sensor.living_room_ac_action`
- `sensor.bedroom_ac_action`
- `sensor.basement_ac_action`

---

## 1. Reading climate states

### All climate entities at once

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq '[.[] | select(.entity_id | startswith("climate.")) | {
    entity_id,
    state,
    friendly_name: .attributes.friendly_name,
    current_temp: .attributes.current_temperature,
    target_temp: .attributes.temperature,
    target_high: .attributes.target_temp_high,
    target_low: .attributes.target_temp_low,
    hvac_action: .attributes.hvac_action,
    humidity: .attributes.current_humidity,
    fan_mode: .attributes.fan_mode,
    preset: .attributes.preset_mode
  }]'
```

Key `state` values: `off`, `heat`, `cool`, `heat_cool`, `dry`, `fan_only`, `auto`
Key `hvac_action` values: `off`, `idle`, `heating`, `cooling`, `fan`

### Single entity

```bash
ENTITY="climate.main_floor"
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states/$ENTITY" | jq '{
    entity_id, state,
    current_temp: .attributes.current_temperature,
    target_temp: .attributes.temperature,
    hvac_action: .attributes.hvac_action,
    humidity: .attributes.current_humidity
  }'
```

---

## 2. Nest thermostats

Discovered via `integration_entities("nest")` — filter to `climate.*` entities.

Supported modes: `heat`, `cool`, `heat_cool`, `off`
Supported features: target temp, target temp range (heat_cool mode), fan on/off, eco preset

### Set mode

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.main_floor", "hvac_mode": "cool"}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_hvac_mode"
```

### Set temperature (single target)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.main_floor", "temperature": 72}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_temperature"
```

### Set temperature range (heat_cool mode)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.main_floor", "target_temp_low": 68, "target_temp_high": 74}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_temperature"
```

### Set eco mode

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.main_floor", "preset_mode": "eco"}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_preset_mode"
```

---

## 3. Ash Office mini-split (Cielo)

Discovered via `integration_entities("cielo_home")` — filter to `climate.ash_office`.

Supported modes: `off`, `cool`, `heat`, `dry`, `fan_only`, `auto`
Fan modes: `auto`, `Low`, `Medium`, `High`
Swing modes: `Auto`, `Position 1`, `Position 2`, `Position 3`
Presets: `none`, `Turbo`
Temp range: 62–86°F

### Set mode and temperature

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.ash_office", "hvac_mode": "cool", "temperature": 72}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_temperature"
```

### Set fan speed

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.ash_office", "fan_mode": "Low"}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_fan_mode"
```

### Power switch (hard on/off)

The Cielo integration also exposes `switch.ash_office_power` for cutting power to the unit directly.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "switch.ash_office_power"}' \
  "$HOMEASSISTANT_URL/api/services/switch/turn_off"
```

### Connection status

`binary_sensor.ash_office_status` — `on` means the unit is reachable by Cielo cloud.

---

## 4. Master Bathroom floor heater (Mysa)

Discovered via `integration_entities("homekit_controller")` — filter to `climate.mysa_eaa72c_thermostat`.

Supported modes: `off`, `heat` only
Temp range: 45–95°F

### Set temperature

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.mysa_eaa72c_thermostat", "hvac_mode": "heat", "temperature": 72}' \
  "$HOMEASSISTANT_URL/api/services/climate/set_temperature"
```

---

## 5. Template AC sensors (window/IR-controlled units)

These sensors reflect the state of window AC units controlled via IR blasters or other indirect methods. They are read-only — control those units through their own integration or IR remote.

| Sensor | What it reflects |
|---|---|
| `sensor.living_room_ac_state` | Power state of living room window unit |
| `sensor.living_room_ac_action` | Current action (cooling, idle, off) |
| `sensor.bedroom_ac_action` | Current action of bedroom window unit |
| `sensor.basement_ac_action` | Current action of basement window unit |

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq '[.[] | select(.entity_id | test("sensor\\.(living_room_ac|bedroom_ac|basement_ac)")) |
    {entity_id, state, friendly_name: .attributes.friendly_name}]'
```

### Climate + template AC sensors together

When you need Nest thermostats and window-unit sensors in one pass, parenthesize each side of `or` (see SKILL.md — `|` binds tighter than `or`):

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq '[.[] | select((.entity_id | startswith("climate.")) or (.entity_id | test("sensor\\.(living_room_ac|bedroom_ac|basement_ac)"))) | {
    entity_id,
    state,
    friendly_name: .attributes.friendly_name,
    hvac_action: .attributes.hvac_action,
    current_temperature: .attributes.current_temperature
  }]'
```

---

## 6. Historical temperature analysis — bedroom bounds check

Review the temperature history for Leo's Room, Cody's Room, and the Master Bedroom over a lookback window and report any times the temperature exceeded defined bounds.

**Bounds:** critical high = 80°F, critical low = 60°F

**Sensors:**
| Room | Entity |
|---|---|
| Leo's Room | `sensor.leos_room_temperature` |
| Cody's Room | `sensor.codys_room_temperature_2` |
| Master Bedroom | `sensor.bedroom_temperature` |

### Query

Fetch history for all three sensors in one call. The `minimal_response=true` flag reduces payload size — entity_id is captured from the first record in each entity's array and carried across all subsequent records.

```bash
LOOKBACK_DAYS=7   # adjust as needed
START=$(date -u -v-${LOOKBACK_DAYS}d '+%Y-%m-%dT%H:%M:%S+00:00')
ENTITIES="sensor.codys_room_temperature_2,sensor.leos_room_temperature,sensor.bedroom_temperature"

curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/history/period/${START}?filter_entity_id=${ENTITIES}&minimal_response=true" | \
  jq --argjson hi 80 --argjson lo 60 '
    [.[] |
      (.[0].entity_id) as $eid |
      .[] |
      select(.state | tonumber? != null) |
      select((.state | tonumber) > $hi or (.state | tonumber) < $lo) |
      {
        entity: $eid,
        temp: (.state | tonumber),
        at: .last_changed,
        breach: (if (.state | tonumber) > $hi then "HIGH" else "LOW" end)
      }
    ] | sort_by(.at)'
```

### Interpreting results

- Each result is a state change record where the temperature crossed a bound.
- `at` is returned in UTC — convert to Pacific time before displaying (see time display rule in SKILL.md).
- If a sensor was unavailable during part of the window, that gap will simply have no records — note it if relevant.
- If the result array is empty, all three rooms stayed within bounds for the entire lookback window.

### Converting breach timestamps to Pacific time

For each breach in the output, convert the `at` field:

```bash
TZ=America/Los_Angeles date -jf '%Y-%m-%dT%H:%M:%S' "$(echo '<at_value>' | sed 's/\+00:00//;s/Z$//')" '+%Y-%m-%d %I:%M %p %Z'
```

### Report format

Include a **Bedroom Temperature History** section. Omit if no breaches found.

```
Bedroom Temperature History (last 7 days, bounds: 60–80°F)
- Cody's Room: 1 breach
  🌡️ HIGH 80.2°F — 2026-05-11 07:37 PM PDT
- Leo's Room: no data (sensor unavailable)
- Master Bedroom: within bounds ✅
```

If all clear:
```
Bedroom Temperature History (last 7 days) — all rooms within bounds ✅
```

---

## Guardrails

- Always verify entity state after a service call before reporting success.
- Do not set `heat_cool` mode with a single `temperature` — use `target_temp_low` and `target_temp_high`.
- The Mysa only supports `heat` — do not attempt `cool` or `heat_cool`.
- The Cielo mini-split temp range is 62–86°F — clamp requests to that range.
