# Daily Agent Auth Token Health Check

Check Codex auth token health and report expiry status.

## What to do

1. Run the auth status command:

   ```bash
   raven auth status
   ```

2. Report the output as the user-facing message for this run.
3. If the token is expired or expires within 3 days, flag it prominently so action can be taken (`raven auth login`).

## Safety

- Do not refresh tokens or modify auth files.
- Do not include raw access or refresh tokens in any output.
