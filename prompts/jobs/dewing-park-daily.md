You are an OpenClaw sub-agent running on Raven's Mac mini.

Task:
1. Check Gmail for unread emails related to Dewing Park or DPST:
   - Use the `gws` CLI to list matching messages:
     ```bash
     gws gmail users messages list --params '{"userId": "me", "maxResults": 20, "q": "in:inbox (\"Dewing Park\" OR \"DPST\")"}'
     ```
![[components/gws-gmail.md#fetch]]
2. For each new email, read the content and extract the key, actionable information, including (when present):
   - Event name/title
   - Date and time
   - Location
   - Which class/grade or student it applies to
   - Any actions required (RSVP, sign-up, permission slips, payments, etc.)
   - Deadlines
   - Any other critical details a parent would need to know.
3. Update the Apple Note named "Dewing Park Happenings" in the shared Apple Notes folder "Shared with Raven" with the extracted information.
   - First, add or update events based on any newly processed emails from this run.
   - Then, on every run, re-check all existing items and reorganize them into the correct section based on their dates, even if there are no new emails.
   - Organize the note visually (as rendered in Apple Notes) in this order:
     1) **UP NEXT – Next 7 Days**: events happening in the next 7 calendar days, ordered by soonest upcoming date.
     2) **THIS MONTH**: all remaining events in the current month that are more than 7 days out, ordered by date.
     3) **LATER & DEADLINES**: future events or deadlines after the current month.
     4) **PAST & REFERENCE**: past events kept only for context.
     5) **HEALTH & SCHOOL NOTICES**: health alerts and school-wide notices.
![[components/gws-gmail.md#apple-notes-rules]]
   - Add a short source reference (e.g., "(DPST, <subject>, <date>)" or "(Dewing Park, <subject>, <date>)").
4. Be idempotent: avoid re-adding the same email/event if it's already been processed.
5. ![[components/gws-gmail.md#archive]]
6. At the very end of the run, perform a cleanup pass over **all** Dewing Park / DPST messages still in the Inbox:
   - Query for any remaining read messages in the Inbox:
     ```bash
     gws gmail users messages list --params '{"userId": "me", "maxResults": 50, "q": "in:inbox -is:unread (\"Dewing Park\" OR \"DPST\")"}'
     ```
![[components/gws-gmail.md#cleanup-archive]]

## Delivery

**If you processed any new emails or made any changes to the Apple Note**, deliver a brief summary as your final step by running this command yourself directly (do NOT delegate this to a subagent):

![[components/delivery/bluebubbles.md#aaron+ashley]]

**If nothing changed** (no new emails, no note updates, no archived messages), respond with `HEARTBEAT_OK` and nothing else. Do not narrate what you checked or where you would have sent it.

If you did send a message, stop immediately afterward and reply with exactly `HEARTBEAT_OK` and nothing else.

## Error Handling

If you encounter a GWS authentication error, a permission error, or any other critical failure that prevents the task from completing, alert the user immediately by running:

![[components/delivery/errors.md#bluebubbles]]
