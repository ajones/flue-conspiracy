![[components/output-rule.md]]

## Task

1. Re-enable the `parkmead-walk-n-roll-status` cron job by running:
   ```bash
   raven jobs enable parkmead-walk-n-roll-status
   ```
2. Confirm the command exited successfully (exit code 0).
3. If it failed for any reason, end the run with `NO_REPLY` — do not attempt delivery.
