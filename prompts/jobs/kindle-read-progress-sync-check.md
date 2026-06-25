![[components/output-rule.md]]

## Behavior

1. Read `~/.kindle-activity.json`.
2. If the file does not exist or cannot be parsed, output exactly `NO_REPLY` and stop.
3. Look for an `error` object with a `message` field.
4. If `error.message` is present, deliver a brief failure notice to Aaron that includes the error message and any actionable next step if obvious.
5. If there is no error, output exactly `NO_REPLY` and stop.
