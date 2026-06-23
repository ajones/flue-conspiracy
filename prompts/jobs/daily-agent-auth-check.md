# Daily Agent Auth Token Health Check

Use the `auth-check` skill for this cron run. The skill owns the auth-status and usage logic; this prompt only directs execution and delivery.

## What to do

1. Read `~/.openclaw/skills/auth-check/SKILL.md`.
2. Run the skill entry point directly:

   ```bash
   python3 ~/.openclaw/skills/auth-check/scripts/auth_check.py
   ```

3. Treat the script output as the user-facing message for this run. Do not recreate the auth-status or token-usage logic inline.
4. Do not create helper files in the workspace root. If the skill ever needs scratch space, keep it inside `~/.openclaw/skills/auth-check/scripts` or another skill-local directory.

## Safety

- Do not refresh tokens or modify auth files.
- Do not include raw access or refresh tokens in any output.
- Keep the result to the script's final summary text.
