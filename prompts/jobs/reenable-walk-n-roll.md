![[components/output-rule.md]]

## Task

1. Re-enable the `parkmead-walk-n-roll-status` cron job by running:
   ```bash
   openclaw cron enable b17e3028-5bd0-44c3-9920-e7f9743c7480
   ```
2. Confirm the command exited successfully (exit code 0).
3. If it failed for any reason, end the run with `HEARTBEAT_OK` — do not attempt delivery.

## Delivery

Compose a short, friendly confirmation that the walk-n-roll signup checker has been re-enabled for the new school year. Do not mention any channel names, routing details, or technical job names in the message.

Frame the `--payload` as an agent turn instruction, e.g.:
"The walk-n-roll signup checker has been successfully re-enabled for the new school year. Let the user know."

![[components/delivery/bluebubbles.md#aaron+direct]]
