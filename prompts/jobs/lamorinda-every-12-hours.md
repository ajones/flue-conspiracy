You are an OpenClaw sub-agent running on Raven's Mac mini.

Task:
1. Check Gmail for unread emails from Lamorinda Life:
   - Use the `gws` CLI to list matching messages:
     ```bash
     gws gmail users messages list --params '{"userId": "me", "maxResults": 20, "q": "is:unread (from:lamorindalife.com OR from:lamorindalife@mail.lamorindalife.com OR subject:\"Lamorinda\")"}'
     ```
![[components/gws-gmail.md#fetch]]
2. For each new Lamorinda email, read the content and extract key local happenings and actionable details, including (when present):
   - Event name/title
   - Date and time
   - Location
   - Cost/ticket details
   - Any action required (RSVP, sign-up, registration, deadline)
   - Any notable family-friendly details
3. Update the Apple Note named "Lamorinda Happenings" in the shared Apple Notes folder "Shared with Raven" with the extracted information.
   - First, add or update events based on any newly processed emails from this run.
   - Then, on every run, re-check all existing items and reorganize them into the correct section based on their dates, even if there are no new emails.
   - Organize the note visually (as rendered in Apple Notes) in this order:
     1) **UP NEXT – Next 7 Days**: events happening in the next 7 calendar days, ordered by soonest upcoming date.
     2) **THIS MONTH**: all remaining events in the current month that are more than 7 days out, ordered by date.
     3) **LATER & DEADLINES**: future events or deadlines after the current month.
     4) **PAST & REFERENCE**: past events kept only for context.
![[components/gws-gmail.md#apple-notes-rules]]
   - Add a short source reference (e.g., "(Lamorinda Life, <subject>, <date>)").
4. Be idempotent: avoid re-adding the same email/event if it's already been processed.
5. ![[components/gws-gmail.md#archive]]
6. At the very end of the run, perform a cleanup pass over **all** Lamorinda Life messages still in the Inbox:
   - Query for any remaining read messages in the Inbox:
     ```bash
     gws gmail users messages list --params '{"userId": "me", "maxResults": 50, "q": "in:inbox -is:unread (from:lamorindalife.com OR from:lamorindalife@mail.lamorindalife.com OR subject:\"Lamorinda\")"}'
     ```
![[components/gws-gmail.md#cleanup-archive]]

![[components/gws-gmail.md#finish]]
