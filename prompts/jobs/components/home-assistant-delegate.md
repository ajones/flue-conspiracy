## Home Assistant (required)

**All** Home Assistant interactions MUST go through the `home-assistant` subagent. Delegate every read, write, snapshot, template query, and audit step.

**Never:**
- Run shell `curl` or Python against Home Assistant
- Use `$HOMEASSISTANT_URL`, `$HOMEASSISTANT_TOKEN`, or other HA env vars in bash
- Load or execute the `homeassistant` skill — it is disabled for this agent
- Call `ha_*` tools yourself — you do not have them; only the subagent does

When a step names an `ha_*` tool (e.g. `ha_get_entity`, `ha_call_service`, `ha_ring_live_snapshot`), delegate to `home-assistant` and have it run that tool.
