## fetch

   - For each message ID returned, fetch metadata and content:
     ```bash
     gws gmail users messages get --params '{"userId": "me", "id": "<message-id>", "format": "full"}' | ~/.openclaw/scripts/gws-gmail-stripper.sh
     ```
   - If the stripper exits non-zero, treat it as a critical error and follow the Error Handling steps below.
   - The read/archived state of each email acts as the processing indicator.
   - Once archived, emails won't appear in future inbox queries.

## apple-notes-rules

   - When rendering/updating the note body, prefer minimal HTML structure so Apple Notes respects line breaks and bullets:
     - Use `<div>` for paragraphs/section headings (e.g., `<div><b>UP NEXT – Next 7 Days (…)</b></div>`).
     - Use `<ul><li>…</li></ul>` for lists of events instead of plain hyphen bullets.
     - Insert `<br>` between sections to create visual spacing.
   - If an event already exists, update/merge details rather than duplicating it.
   - You MUST use the raven-apple-notes skill ONLY to interact with Apple Notes (list, read, append, or replace content).
   - You may NOT execute inline AppleScript with `osascript` for Notes operations; all Notes interactions must go through the raven-apple-notes skill.

## archive

After successfully processing each email and updating the Apple Note as needed, mark as read and archive it to keep the Inbox clean and avoid reprocessing:
   - Mark as read and remove from Inbox:
     ```bash
     gws gmail users messages modify --params '{"userId": "me", "id": "<message-id>"}' --json '{"removeLabelIds": ["UNREAD", "INBOX"]}'
     ```

## cleanup-archive

   - For each matching message, archive it by removing the INBOX label:
     ```bash
     gws gmail users messages modify --params '{"userId": "me", "id": "<message-id>"}' --json '{"removeLabelIds": ["INBOX"]}'
     ```
   - Do **not** archive any messages that are still unread; those should remain as candidates for future processing.
   - Keep this step idempotent: archiving an already-archived message should be a no-op.

## finish

When you finish, briefly summarize what you added or changed, including how many previously-read messages you archived in the final cleanup pass.
