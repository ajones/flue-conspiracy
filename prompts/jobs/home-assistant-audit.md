![[components/output-rule.md]]

---

# Home Assistant Audit — Integration Health Check

![[components/home-assistant-delegate.md]]

You are running as part of the `home-assistant-audit` cron job. Your job is to conduct a full health audit of the Home Assistant instance.

Delegate all Home Assistant API calls to the `home-assistant` subagent. Instruct the subagent to use the `homeassistant` skill's audit workflow (`references/audit.md`) and follow it exactly: integrations, battery, updates, and vents.
