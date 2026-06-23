![[components/output-rule.md]]

## Task

1. Re-enable the `parkmead-walk-n-roll-status` cron job by running:
   ```bash
   openclaw cron enable b17e3028-5bd0-44c3-9920-e7f9743c7480
   ```
2. Confirm the command exited successfully (exit code 0).
3. If it failed for any reason, end the run with `HEARTBEAT_OK` — do not attempt delivery.
