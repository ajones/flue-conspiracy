Goal: Every Monday, Tuesday, and Thursday at 9:30am, check the Parkmead Walk N Roll SignUpGenius page, find the next upcoming event date, and send Aaron a concise summary of who is signed up and which roles are still open.

Context:
- Signup URL: https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/

Instructions:
1. Use the Playwright scraper skill to load the dynamic content for the signup page.
   - Change directory to the skill: `skills/playwright-scraper-skill`.
   - Run the simple Playwright script:
     - Command: `node scripts/playwright-simple.js "https://www.signupgenius.com/go/4090D4EAFAF29A2FB6-61526314-parkmead#/"`
   - Before reading the schedule, scroll all the way to the bottom of the rendered signup page so the full table is loaded.
   - Capture the JSON output and parse the `content` field, which contains the rendered signup table as text.

2. From the parsed content:
   - Identify all listed dates (e.g., `02/04/2026`, `03/18/2026`, etc.).
   - Treat dates as mm/dd/yyyy.
   - Determine **today's date in America/Los_Angeles** timezone and select the **earliest signup date that is today or in the future**.

3. For that next upcoming date only:
   - Extract each row/slot for that date.
   - For each slot, capture:
     - Role/slot name (e.g., `Magnolia Lead Scanner`, `Newell Assistant Scanner`, or themed names like `St. Patty’s - Magnolia Lead`).
     - Whether the slot is `Full` or still open (`Sign Up`, `0 of 1 slots filled`).
     - If full, the name of the person signed up.

4. Count how many slots for that next upcoming date are filled.
   - Treat each `Full` slot as filled.
   - If **4 or more** slots are filled, the status emoji is `🟩`.
   - If **3** slots are filled, the status emoji is `🟨`.
   - If **2** slots are filled, the status emoji is `🟧`.
   - If **1 or 0** slots are filled, the status emoji is `🟥`.

5. Compose a concise summary message in this exact structure (no extra commentary):

   - First line: `<emoji> Next Parkmead Walk N Roll date: <mm/dd/yyyy> (<weekday>)`
   - Follow with one bullet per slot for that date:

     - If the slot is full:
       `- <Role>: Full – <Name>`

     - If the slot is open:
       `- <Role>: OPEN (0 of 1 filled)`

   Example shape (values are illustrative):

   ```
   🟨 Next Parkmead Walk N Roll date: 03/18/2026 (Wednesday)
   - Magnolia Lead Scanner: OPEN (0 of 1 filled)
   - Newell Lead Scanner: Full – Tony Almeida
   - Magnolia Assistant Scanner: OPEN (0 of 1 filled)
   - Newell Assistant Scanner: OPEN (0 of 1 filled)
   ```

6. Output exactly that summary text as your final reply for this cron run. Do not include any extra explanation, metadata, or JSON, just the human-readable message.
