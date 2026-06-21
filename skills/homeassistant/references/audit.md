# Home Assistant Audit Reference

How to conduct a health audit of Home Assistant integrations, devices, and components. Load this file when the user asks for an audit, integration health check, or device status report.

---

## Step 1 — Sanity check API availability

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" "$HOMEASSISTANT_URL/api/" | jq -r '.message'
```

If this does not return `"API running."`, stop and report: `Home Assistant API is unreachable — skipping audit.`

---

## Step 2 — Fetch all config entries (integrations)

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOMEASSISTANT_URL/api/config/config_entries/entry" | jq '.'
```

Each entry looks like:
```json
{
  "entry_id": "abc123",
  "domain": "hue",
  "title": "Philips Hue",
  "state": "loaded",
  "reason": null
}
```

Key `state` values:
- `loaded` — healthy, running normally
- `setup_in_progress` — still starting up
- `not_loaded` — disabled or unloaded
- `setup_error` — failed to set up (check `reason`)
- `setup_retry` — retrying setup after failure
- `migration_error` — schema migration failed

---

## Step 3 — Categorize integrations

Group entries into:
- **Healthy** (`loaded`): count only, no need to list individually unless ≤5 total
- **Degraded** (`setup_retry`, `setup_in_progress`): attempt reload (see Step 3a)
- **Failed** (`setup_error`): attempt reload (see Step 3a)
- **Migration error** (`migration_error`): flag for manual attention, do not attempt reload
- **Disabled** (`not_loaded`): ignore entirely — do not include in the report

---

## Step 3a — Attempt reload on degraded and failed integrations

For each integration with state `setup_retry`, `setup_in_progress`, or `setup_error`, attempt a reload using the entry's `entry_id`:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/config/config_entries/entry/{entry_id}/reload"
```

After all reloads are attempted, re-fetch the full config entries list (same query as Step 2) and filter by `entry_id` to check the new state of each reloaded entry. Do not use the single-entry endpoint — it is not supported.

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/config/config_entries/entry" | \
  jq '[.[] | select(.entry_id == "<entry_id>") | {domain, title, state, reason}]'
```

Categorize the outcome:
- Now `loaded` → **recovered** ✅
- Still degraded/failed → **reload failed**, flag for manual attention
- `reason` is null on a still-degraded entry → note as "(no reason given)"

Do not attempt to reload `migration_error` integrations — flag them directly for manual attention.

---

## Step 4 — Check for low battery devices

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq '[.[] |
    select(.attributes.battery_level != null or (.entity_id | test("^sensor\\..*battery"))) |
    select((.attributes.battery_level // (.state | tonumber? // 101)) < 20) |
    {name: (.attributes.friendly_name // .entity_id), level: (.attributes.battery_level // .state)}
  ] | sort_by(.level)'
```

Flag any device with battery level below 20%. Sort lowest-first.

---

## Step 5 — Apply pending updates

### 5a — Get the list of pending updates

```bash
curl -s \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq '[.[] |
    select(.entity_id | startswith("update.")) |
    select(.state == "on") |
    {entity_id, name: .attributes.friendly_name, installed: .attributes.installed_version, latest: .attributes.latest_version}
  ]'
```

### 5b — Install each update one at a time

Split the update list into two buckets:

- **Core/OS** (install last, may depend on each other):
  - `update.home_assistant_core_update`
  - `update.home_assistant_operating_system_update`
- **Everything else** — install these first, one at a time, in any order.

For each entity, call the install service individually:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entity_id\": \"<entity_id>\"}" \
  "$HOMEASSISTANT_URL/api/services/update/install"
```

A successful response is a non-empty JSON array. An error response is a JSON object with a `"message"` key. Continue to the next update regardless of success or failure — track failures in a list.

### 5c — Install Core and OS updates (with retry)

After all other updates are done, install the Core/OS updates in this order: **OS first, then Core**.

For each, attempt the install. If it fails, note the error but do not stop — try the other one. After both have been attempted once, **retry any that failed**, in the same order (OS before Core). This handles cases where HA requires the OS to be at a certain version before Core can update.

Track the final outcome (success or failure after retry) for the report.

### 5d — Verify

Re-fetch the pending update list (same query as 5a). Any `update.*` entity still showing `state == "on"` should be cross-referenced against your failure list and included in the report.

---

## Step 6 — Check smart vent status

```bash
for ENTITY in cover.codys_room_c5cd_vent cover.leos_room_c2a6_vent cover.living_room_air_vent_vent; do
  curl -s \
    -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
    "$HOMEASSISTANT_URL/api/states/${ENTITY}" | jq '{entity_id, state, friendly_name: .attributes.friendly_name}'
done
```

Report only vents with `state == "unavailable"`. If all three are operating normally, omit this section.

---

## Important Device Operations

Always discover devices dynamically via `integration_entities()` — never use hardcoded entity lists. This ensures the audit reflects the current state of enabled devices and picks up additions or removals automatically.

### Bhyve Irrigation — HT25 Controller Health

Check that all HT25 controllers are connected and that every zone has watered within the last 3 days.

#### Step 1 — Discover enabled devices

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"template": "{{ integration_entities(\"bhyve\") | list | tojson }}"}' \
  "$HOMEASSISTANT_URL/api/template"
```

From the returned list, fetch all states and filter to:
- **Controllers**: entity IDs matching `binary_sensor.*_connected`
- **Zones**: entity IDs matching `sensor.*_zone_history`

Only evaluate entities present in this list.

#### Step 2 — Check controller connectivity

For each `binary_sensor.*_connected` entity: `state == "on"` means connected. `state == "off"` or `"unavailable"` means offline — flag it.

#### Step 3 — Check last watering per zone

The `state` of each `sensor.*_zone_history` entity is the ISO 8601 timestamp of the last completed watering run. Flag any zone where last watering was more than 3 days ago, or state is `"unavailable"`.

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq --arg cutoff "$(date -u -v-3d '+%Y-%m-%dT%H:%M:%S')" '
    [.[] | select(.entity_id | test("sensor\\..*zone_history")) |
    {
      name: .attributes.friendly_name,
      entity_id,
      last_watered: .state,
      overdue: (if .state == "unavailable" then true else (.state < $cutoff) end)
    }]'
```

#### Step 4 — Report

- 💧 before each zone watered within 3 days (include date)
- 🚨 before each zone that is overdue or unavailable
- 📡 before each controller that is offline

Example:

```
Bhyve Irrigation
- Controllers: all 3 connected
- Zones:
  💧 Upper Bed — last watered 2026-05-18
  💧 Front Yard — last watered 2026-05-18
  💧 Side Bed — last watered 2026-05-18
  🚨 Lower Bed — last watered 2026-05-02 (16 days ago)
  🚨 Side Yard — unavailable
  🚨 Side Yard Aux — unavailable
```

### Flair — Pucks and Smart Vents

Check that all Flair pucks and smart vents are connected, have adequate battery voltage, and have acceptable signal strength.

#### Step 1 — Discover enabled devices

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"template": "{{ integration_entities(\"flair\") | list | tojson }}"}' \
  "$HOMEASSISTANT_URL/api/template"
```

From the returned list, fetch all states and filter to entity IDs matching `connection_status`, `voltage`, or `rssi`. Only evaluate entities present in this list — do not hardcode device names.

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq --argjson ids '<flair_entity_list>' '
    [.[] | select(.entity_id as $id | $ids | contains([$id])) |
    select(.entity_id | test("connection_status|voltage|rssi")) |
    {entity_id, state, friendly_name: .attributes.friendly_name}]'
```

Group results by device. Distinguish pucks from vents by entity ID: vents contain `air_vent`, pucks do not.

#### Step 2 — Evaluate

| Condition | Threshold | Emoji |
|---|---|---|
| Connection `off` or `unavailable` | — | 📡 offline |
| Puck voltage low | < 2.8V | 🔋 |
| Vent voltage low | < 2.5V | 🔋 |
| Vent RSSI weak | < -80 dBm | 📶 |

#### Step 3 — Report

Omit this section if all devices are healthy.

Example:

```
Flair Devices
- Living Room Puck — connected, 3.41V ✅
- Cody's Room Puck — connected, 3.40V ✅
- Guest Room Puck — 📡 offline
- Living Room Air Vent — connected, 2.71V, -60 dBm ✅
- Leo's Room Air Vent — connected, 2.58V 🔋, -82 dBm 📶
- Cody's Room Air Vent — connected, 2.93V, -77 dBm ✅
```

### August Locks — Connectivity and Battery

Check that all August locks are connected and have sufficient battery.

#### Step 1 — Discover enabled devices

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"template": "{{ integration_entities(\"august\") | list | tojson }}"}' \
  "$HOMEASSISTANT_URL/api/template"
```

From the returned list, fetch all states and filter to entity IDs matching `^lock\.` (connectivity) and `sensor\.*_battery` (battery level). Only evaluate entities present in this list.

```bash
curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
  "$HOMEASSISTANT_URL/api/states" | \
  jq --argjson ids '<august_entity_list>' '
    [.[] | select(.entity_id as $id | $ids | contains([$id])) |
    select(.entity_id | test("^lock\\.|_battery$")) |
    {entity_id, state, friendly_name: .attributes.friendly_name}]'
```

#### Step 2 — Evaluate

Pair each `lock.*` entity with its corresponding `sensor.*_battery` entity by matching the device name prefix.

| Condition | Threshold | Emoji |
|---|---|---|
| Lock `state == "unavailable"` | — | 📡 offline |
| Battery low | < 30% | 🔋 |

#### Step 3 — Report

Omit this section if all locks are connected and battery is sufficient.

Example:

```
August Locks
- Front Door — locked, 96% ✅
- Lodge Front Door — locked, 44% ✅
- Ash Office — 📡 offline, 9% 🔋
```

### Room Temperature Sensors — Connectivity

Check that the room env monitor connectivity sensors for Leo's and Cody's rooms are online. These are standalone binary sensors checked directly by entity ID.

```bash
for ENTITY in binary_sensor.codys_room_env_monitor_connectivity binary_sensor.leo_s_room_env_monitor_connectivity; do
  curl -s -H "Authorization: Bearer $HOMEASSISTANT_TOKEN" \
    "$HOMEASSISTANT_URL/api/states/${ENTITY}" | \
    jq '{entity_id, state, friendly_name: .attributes.friendly_name}'
done
```

Flag any sensor where `state == "unavailable"` or `state == "off"`. If both are reporting, omit this section.

Example (one offline):

```
Room Temperature Sensors
- Cody's Room Env Monitor — on ✅
- Leo's Room Env Monitor — 📡 unavailable
```

---

## Step 7 — Compose the report

Format as a clean list. No conversational prose.

Emoji rules:
- ✅ before integrations that were reloaded and recovered
- ⚠️ before integrations that are still degraded after reload
- 🔴 before integrations that still failed after reload, or have migration errors
- 🔋 before each low battery device line
- 🔄 before each successfully installed update line
- ❌ before each update that failed to install
- 🌬️ before each unavailable vent line
- Omit any section entirely if it has nothing to report

Example structure:

```
Home Assistant Integration Audit
- Healthy: 24 integrations running normally
- Recovered after reload: 1
  ✅ ecobee (Ecobee) — was setup_retry, now loaded
- Still degraded: 1
  ⚠️ bhyve (r.aaron.jones@gmail.com) — setup_retry: (no reason given)
- Still failed: 1
  🔴 august (August Smart Lock) — setup_error: connection timeout
- Migration errors (manual fix needed): 1
  🔴 some_integration — migration_error
- Low battery: 1
  🔋 Front Door Sensor — 12%
- Updates installed: 2
  🔄 Home Assistant Core: 2024.3.1 → 2024.4.0
  🔄 HACS: 1.32.0 → 1.33.1
- Updates failed: 1
  ❌ Some Firmware — Could not install: <error message>
- Unavailable vents: 1
  🌬️ Codys Room Air Vent Vent — unavailable
```

If everything is clean:

```
Home Assistant Integration Audit
- All X integrations healthy
- No low battery devices
- No pending updates
```
