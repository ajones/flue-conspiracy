![[components/output-rule.md]]

![[components/home-assistant-delegate.md]]

## Behavior

Check the state of these AC units — delegate to `home-assistant` and have it call `ha_get_entity` for each:
- `climate.ash_office`
- `climate.basement_nest`
- `climate.main_floor_nest`
- `climate.bedroom_nest`

A unit counts as "on" if its state is anything other than `off` or `unavailable` (e.g. `cool`, `heat`, `heat_cool`, `dry`, `fan_only`, `auto`).

A unit counts as "unreachable" if its state is `unavailable` or if it's missing entirely from `/api/states` (entity not found).

If none are on and none are unreachable, compose and deliver this message, then stop:

```
All AC units off, nice 👍
```

If any units are unreachable (but none are on), compose and deliver this message, then stop:

```
⚠️ Can't read AC status for:
[friendly name or entity_id, one per line]

Might need a check on the integration.
```

If any units are on:

### Step 1 — Note the active units

For each active entity, record: entity_id, hvac mode (heat/cool/etc), and friendly name.

### Step 2 — Write the pending request

Append the following block to `PENDING_AGENT_REQUESTS.md` in your workspace, substituting the bracketed placeholders with the actual date and entity list:

```
## AC turn-off offer — [TODAY'S DATE]

Question asked: Do you want me to turn off the AC units?

Active entities: [comma-separated list of entity_ids that are on, e.g. climate.main_floor,climate.bedroom]

When Aaron or Ashley confirms they want units off (all or a named subset):
- Delegate to `home-assistant` to turn off the requested units
- If they named specific units, match those to the active entities list; only act on the ones they specified
- If they said yes / all, act on every entity in the active list
- For each targeted entity, have the subagent call `ha_call_service` with domain `climate`, service `set_hvac_mode`, and `hvac_mode` `off`
- After each call, fetch the entity state to verify it is now "off"
- Report results: for each entity that succeeded say "✅ [friendly name] off"; for each that failed say "⚠️ Couldn't turn off [friendly name] — you'll need to do that manually"
- Remove this block from `PENDING_AGENT_REQUESTS.md` in your workspace after processing

When Aaron or Ashley says no / never mind:
- Remove this block from `PENDING_AGENT_REQUESTS.md` in your workspace
```

### Step 3 — Compose the user-facing message

```
Turn off if not using:
🔥: [units in heat mode, one per line, using friendly name]
❄️: [units in cool mode, one per line, using friendly name]

Want me to turn them off?

⚠️ Can't read AC status for:
[friendly name or entity_id, one per line]
```

Omit an emoji line if no units are in that mode. Omit the ⚠️ section entirely if no units are unreachable.
