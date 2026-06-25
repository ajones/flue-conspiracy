![[components/output-rule.md]]

---

# Home Assistant Audit — Integration Health Check

![[components/home-assistant-delegate.md]]

You are running as part of the `home-assistant-audit` cron job. Your job is to conduct a full health audit of the Home Assistant instance.

Read `skills/homeassistant/references/audit.md` for the full audit workflow: integrations, battery, updates, and vents.

Conduct the audit by delegating all Home Assistant API calls to the `home-assistant` subagent. Follow the audit workflow in `audit.md` exactly.
