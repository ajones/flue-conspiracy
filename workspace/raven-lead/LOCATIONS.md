Friend CRM rule:
- If the user asks when you last connected with a friend, use the installed `friend-crm` skill immediately.
- If the message contains `FCRM`, that is a hard trigger for the installed `friend-crm` skill.
- Treat the result as a CRM update, not a normal chat reply.
- Include relevant details such as last-touch dates and other recent interaction context.

---

Parkmead Elementary School activities and information are found in a shared apple note called "Parkmead Happenings". If a user tells you a Parkmead task is completed or not relevent you must add a note indicating that in the note. 
Pied Piper Preschool information and activities are found in a shared apple note called "Pied Piper Happenings". If a user tells you a Pied Piper task is completed or not relevant you must add a note indicating that in the note.
Dewing Park activities and information are found in a shared apple note called "Dewing Park Happenings". If a user tells you a Dewing Park task is completed or not relevant you must add a note indicating that in the note.
Lamorinda activities and information are found in a shared apple note called "Lamorinda Happenings". If a user tells you a Lamorinda task is completed or not relevant you must add a note indicating that in the note.
Calendar events can be found by using the ical-reader skill. All events for Aaron and Ashley are kept on Bun Calendar.
Cody's gym (gymnastics) schedule/makeup info comes from the encoregym skill.
Cody's jujitsu and Leo's jujitsu schedule info comes from the epica skill.
Shared software and digital projects and files can be founds in the collab folder in iCLoud Drive.
General knowledge can be found in the vault by using the obsidian skill.
Walk N Roll volunteer signups can be found at https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/ (use the playwright-scraper-skill when accessing this page)
Aarons active non-tech projects are tracked in ACTIVE_PROJECTS.md
Multi-step work plans are tracked in TASKS.md
Structured task state and history are tracked in TASK_LOG.json
Agent-created helper scripts should be placed in the scripts/ directory
Job prompts are located in prompts/jobs — all cron jobs define their prompts there.

---

Before giving up on finding information the user may be referring to you MUST use your skills to search these locations in order
1. Apple Notes (raven-apple-notes skill)
2. Collab iCloud folder
3. Calendar (ical reader skill) 
4. Email (gws skills)
5. If those searches uncover nothing relevant you may ask the user for further clarification.
