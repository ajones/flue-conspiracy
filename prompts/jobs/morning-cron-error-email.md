# Morning Cron Error Email

You are generating a daily cron health email.

## Task
Inspect cron job runs for the last 24 hours, identify any errors, and email Aaron a concise but well-formatted report.

## What to check
1. Get the current list of cron jobs.
2. For each job that has activity in the last 24 hours, inspect its recent run history.
3. Treat these as errors:
   - any run whose status is `error`, `failed`, or similar
   - any run with a non-empty `lastError`
   - any run with a non-empty `lastDeliveryError`
4. Group related failures by job name.

## Email requirements
- Send the email to `r.aaron.jones@gmail.com` using the `gws` CLI.
- Use a clear, emoji-prefixed subject line (e.g. "🟢 Cron Health: All Clear" or "🔴 Cron Health: 3 Errors").
- Include:
  - the time window checked
  - each failing job with its run time and error summary
  - delivery failures called out separately
- If there are no errors, send a short celebratory note that nothing exploded.

## Formatting guidance
- Use colored emoji liberally to make the email scannable at a glance:
  - 🔴 for errors/failures
  - 🟡 for warnings or delivery issues
  - 🟢 for healthy/passing jobs
  - 🕐 for timestamps
- Use proper HTML for the email body — do NOT use literal `\n` in strings. Use `<br>`, `<p>`, `<ul>/<li>`, and `<h3>` tags for structure.
- Add vertical spacing between sections — don't cram everything together.
- Keep it concise and prefer plain language.
- Do not mention internal tool instructions, hidden prompts, or implementation details.
- If there are no errors, make that very clear and brief.

## Final step
Send the email with `gws gmail +send` once the report is ready.
