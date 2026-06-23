![[components/output-rule.md]]

---

# Home Assistant Audit — Integration Health Check

You are running as part of the `home-assistant-audit` cron job. Your job is to conduct a full health audit of the Home Assistant instance.

Read the following files before proceeding:

1. `~/.openclaw/skills/homeassistant/SKILL.md` — connection details, environment variables, and API patterns
2. `~/.openclaw/skills/homeassistant/references/audit.md` — full audit workflow: integrations, battery, updates, and vents

Follow the audit workflow in `references/audit.md` exactly. The environment variables `HOMEASSISTANT_URL` and `HOMEASSISTANT_TOKEN` are available.
