Goal: Each night at 3:00 AM America/Los_Angeles, infer and maintain a set of "agentic task archetypes" based on the last 2 days of conversations, and update the shared archetypes file.

Scratch-space rule (required):
- At run start, read the injected first line for the current job id from the format `[cron:<job-id> ...]`.
- If you need temporary helper files/scripts, use only:
  - `/Users/raven/.openclaw/workspace/tmp/cron/<job-id>/`
- Do not create helper/temp files in `/Users/raven/.openclaw/workspace` root.
- Before final output, delete any scratch files you created for this run.

Source channels:
- Direct iMessage chat with Aaron: identifier "+15127407713".
- Mayhem MGMT iMessage group: chat id "bc2201f817d34f7da609764bf73c4ffb".

Target file:
- `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/agentic-task-archetypes.md`

High-level steps:

1. Fetch last 2 days of messages

   Use the imsg skill workflow to pull history from both chats:
   - Direct chat: use the identifier `+15127407713`.
   - Group chat: use `--chat-id bc2201f817d34f7da609764bf73c4ffb` (the Mayhem MGMT thread).

   Combine these into a single logical stream of messages with annotations for:
   - which chat (direct vs mayhem-mgmt),
   - timestamp,
   - speaker (Aaron, Raven, others where visible).

2. Identify task instances

   From the combined stream, extract individual "task instances" — concrete things Aaron asked for or that we worked on together. Look for messages that:
   - Ask for help or action ("can you…", "I want you to…", "remind me…", "set up…", "plan…").
   - Describe or debug work ("I'm trying to…", "this is failing…", "let's wire up…").
   - Capture decisions and plans ("we should…", "let's do it this way…").

   For each task instance, capture a short normalized description and its context (personal vs work vs family/school vs infra/automation, etc.).

3. Infer / update task archetypes

   Cluster task instances into recurring archetypes. An archetype is a reusable pattern like:
   - "Infra debugging and incident triage"
   - "School / family logistics planning"
   - "Automation & cron/heartbeat design"
   - "Product / app copy & positioning"
   - "Knowledge capture & file organization"

   For each archetype you infer or touch during this run:
   - Ensure it has a stable name (short, descriptive, human). If a similar archetype already exists in the file, reuse and refine it instead of creating a near-duplicate.
   - Maintain a short description of what that archetype represents and what typical outputs look like (cron jobs, reminders, docs, code, etc.).
   - Collect 1–3 recent examples from the last 2 days that fit this archetype. Summarize them concisely; you do not need full quotes.

4. Update `agentic-task-archetypes.md`

   1) Read the existing file from:
      `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/agentic-task-archetypes.md`.

   2) Maintain the high-level structure:
      - Title & Purpose
      - Archetype Index
      - Archetype Details
      - Emerging / Proto-Archetypes

   3) Update the **Archetype Index** section:
      - Ensure each archetype has a single bullet or row with:
        - Name
        - Short category or domain (e.g., "Infra", "Family/School", "Automation", "Product", "Personal Ops").
        - One-line description.
      - Add new archetypes if you discovered genuinely new patterns.

   4) Update **Archetype Details**:
      - For each archetype touched this run, refine the description only if the last 2 days provide a clearly better framing.
      - Append new examples as bullets, optionally tagged with the date like `(2026-03-17)`.
      - Avoid duplicating examples that are effectively the same; consolidate when possible.

   5) In **Emerging / Proto-Archetypes**, note any new patterns that showed up only once or twice and might become full archetypes later.

   When writing the file back, preserve headings and general layout as much as possible; you're allowed to reorder archetypes for clarity.

5. Final output (for delivery)

   At the end of the run, produce a **very brief, single-paragraph summary** of what changed in this nightly update.

   The summary should be no more than 2–3 sentences and follow this shape:

   - Mention how many archetypes were updated and whether any new archetypes were added.
   - Optionally name at most 1–2 new or heavily updated archetypes.

   Example shapes (adapt content to the actual changes):

   - "Updated 4 existing task archetypes and added 1 new one (School Event Automation), based on the last 2 days of chats. Examples were refreshed for infra debugging and family logistics."
   - "No new archetypes tonight, but I added fresh examples for automation design and personal ops tasks from the last 48 hours."

   Do **not** include raw message excerpts, file paths, or implementation details in the final reply—only the high-level summary of what changed in the archetypes file.
