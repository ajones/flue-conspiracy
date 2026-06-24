## Draft-and-review workflow

1. **Build the message in a temp file.** As you complete each step, write the composed message incrementally to a temp file (e.g. `/tmp/<job-name>-draft.md`). Do not hold the entire message in memory — write each section to the file as you go.
2. **Review before sending.** After the draft is complete and before running the delivery command, read the temp file back and verify:
   - Every section that has data from a successful tool call is present in the draft.
   - No "Note: Couldn't get…" failure line exists for a source whose data actually appears in the message.
   - If the review finds a contradiction (e.g. data is present but a failure note claims otherwise), fix the draft before sending.
3. Use the reviewed temp file contents as the reply.
