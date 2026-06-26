![[components/output-rule.md]]

# Encore Gym Cody Makeup Check

Use the Encore Gym skill to check Cody's current makeup situation.

## Steps

1. Read `skills/encoregym/SKILL.md` and follow it.
2. Run the skill's `get-makeups.js` workflow with the configured Encore Gym credentials.
3. Determine:
   - how many eligible makeup classes Cody currently has
   - how many open gym makeup slots are currently available
4. If Cody has no eligible makeups and no open gym slots available, respond with `NO_REPLY` and stop.
5. Compose a short user-facing message (not addressed to anyone — no "Tell Aaron:" or similar prefix) that:
   - gives the current count
   - reminds that open gym makeups need to be scheduled in advance
   - offers to pull day/time availability on request
   - stays concise
