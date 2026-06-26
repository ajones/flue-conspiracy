Goal: Every 3 days at 5:00 AM America/Los_Angeles, scan the Agentic Task Archetypes doc and current AI-agent trends, then update an "Automation Opportunities" table that maps our real archetypes to modern AI-agent patterns.

Inputs:
- Archetypes file:
  `~/Library/Mobile Documents/com~apple~CloudDocs/RavenClaw-Collab/agentic-task-archetypes.md`

- Web trends: use the web_search + web_fetch tools to find 5 distinct, currently trending ways people are leveraging AI agents.
  - Example query styles (adapt as needed):
    - "trending AI agent automation use cases 2026"
    - "real-world AI agent workflows personal productivity"
    - "autonomous AI agents operations examples"

- Fallback for dynamic or problematic sites: use the Playwright scraper skill if web_fetch content looks obviously empty, just boilerplate, or blocked.
  - Skill path: `skills/playwright-scraper-skill`
  - Primary script: `node scripts/playwright-simple.js "<URL>"`
  - Parse the JSON output's `content` field as the page text.

Output:
- An updated section in the archetypes file:

  ```markdown
  ## Automation Opportunities (AI Agents x Archetypes)

  | Archetype | Trend / Pattern | Opportunity Summary | Effort | Potential Impact |
  |----------|-----------------|---------------------|--------|------------------|
  | ... |
  ```

- Final reply text for this cron run: a **very short** summary (max 2 sentences) including **at most 2 newly identified automation opportunities by name**.

Detailed steps:

1. Read and parse archetypes

   1. Read `agentic-task-archetypes.md` from the iCloud collab folder.
   2. Parse out a structured list of archetypes from the existing sections:
      - Name
      - Domain/category (if present)
      - Short description
      - Any examples listed under that archetype.

   Represent them internally like:

   ```text
   archetypes = [
     { name, domain?, description, examples[] },
     ...
   ]
   ```

2. Discover 5 distinct AI-agent trends

   1. Use web_search with 2–3 different queries oriented toward **contemporary AI-agent automation patterns**.
   2. Fetch content for promising results via web_fetch.
   3. If web_fetch for a given URL returns only boilerplate, footers, or obviously missing content (e.g., dynamic JS site), re-fetch that URL using the Playwright scraper skill:
      - Change directory to `skills/playwright-scraper-skill`.
      - Run: `node scripts/playwright-simple.js "<URL>"`.
      - Parse the JSON `content` field as the article/page body.

   4. From the combined material, identify **5 distinct agent usage patterns**. For each pattern, capture:
      - `name` – short label (e.g., "Inbox triage agent", "Recurring planning agent", "Sales follow-up agent").
      - `description` – 1–2 sentence description of what the agent does.
      - `typicalContext` – where it's usually applied (personal productivity, ops, marketing, etc.).

   5. Ensure the 5 trends are **meaningfully different**; merge or discard duplicates.

3. Map trends to archetypes

   For each archetype in `archetypes`:

   1. Compare the archetype's description and examples to the 5 agent trends.
   2. Identify 0–3 trends that clearly align with that archetype's kind of work. For each (archetype, trend) pairing that makes sense, synthesize an **automation opportunity**:

      - `archetypeName`
      - `trendName`
      - `opportunitySummary` – 1–2 sentences describing **a concrete automation** we could build with agents for that archetype.
      - `effort` – rough estimate: `S`, `M`, or `L`.
      - `impact` – rough estimate: `Low`, `Med`, or `High`.

   Example (shape only):

   - Archetype: "School Event Automation"
   - Trend: "Inbox triage + reminder agents"
   - Opportunity Summary: "Agent monitors ParentSquare and SignUpGenius for new event posts and proposes cron/reminder jobs automatically."
   - Effort: `M`, Impact: `High`.

4. Update the Automation Opportunities section in the archetypes file

   1. Read the current contents of `agentic-task-archetypes.md`.
   2. Ensure there is a section header:

      ```markdown
      ## Automation Opportunities (AI Agents x Archetypes)
      ```

      - If it does not exist, add it near the bottom of the file, before any closing notes.

   3. Under that header, rebuild the table **fresh** each run using the opportunities computed in step 3. Keep the format:

      ```markdown
      | Archetype | Trend / Pattern | Opportunity Summary | Effort | Potential Impact |
      |----------|-----------------|---------------------|--------|------------------|
      | ... |
      ```

      - At most ~20–25 rows total.
      - At most 3 rows per archetype to keep the table scannable.
      - Use concise, human-readable text.

   4. Preserve the rest of the file's structure (title, archetype index, details, emerging archetypes) with minimal reformatting.

5. Final cron run output (for iMessage delivery)

   At the very end of the run, produce a **single very short summary** of what changed, with these constraints:

   - Length: **max 2 sentences**.
   - Content:
     - Mention how many opportunities were generated/updated in total (approximate is fine).
     - Highlight **at most 2 newly identified automation opportunities by their archetype + trend names**.
   - No tables, no file paths, no implementation details.

   Example shapes (adapt to the actual run):

   - "Generated 14 automation opportunities across 6 archetypes; new highlights include School Event Automation × Inbox-triage agents and Infra Debugging × Incident postmortem summarizers."
   - "Updated the automation-opportunities table (11 rows total), with two new ideas under Automation Design × Workflow orchestrator agents and Personal Ops × Calendar triage agents."

Produce only this short summary as your final reply; the updated table lives in the archetypes doc itself.
