![[components/output-rule.md]]

## Behavior

1. Ensure the dedup history file exists at `~/.openclaw/workspace/.github-trending`.
   - If it does not exist, create it as an empty file.
   - Read its contents: each line has the format `<repo url>, <short description>` (e.g. `https://github.com/<owner>/<repo>, <one-sentence description>`).
   - For matching purposes in the next step, compare against just the URL portion of each line (the text before the first comma).
2. Fetch the GitHub Trending page: https://github.com/trending
   - Use `web_fetch` to retrieve it. If the content looks empty, boilerplate, or JS-rendered with no real data, retry with the Playwright scraper skill (`/Users/raven/.openclaw/skills/playwright-scraper-skill`, `node scripts/playwright-simple.js "https://github.com/trending"`).
3. Walk the trending list in ranked order (top first) and pick the **first repo whose URL does not already appear** (exact match on the URL portion) in the history file from step 1. Skip any repo already on the list.
4. Determine what the chosen repository does. Use the description shown on the trending page; if it's unclear or missing, fetch the repo's own GitHub page (`https://github.com/<owner>/<repo>`) for more context.
5. Compose the final message using exactly this template (with blank lines between each part as shown), and nothing else:

   ```
   📈 Todays trending repo
   <REPO NAME>

   <ONE SHORT SENTENCE DESCRIBING WHAT THE REPO DOES>

   <REPO URL, e.g. https://github.com/<owner>/<repo>>
   ```

   - `<REPO NAME>` is the repo's name (e.g. `owner/repo` or just `repo`, matching how it's shown on the trending page).
   - The description is plain language, no labels like "Description:".
   - Do not add any other text, headers, or commentary beyond this template.
6. After composing the message (and before or immediately after delivering it), append a new line to `~/.openclaw/workspace/.github-trending` in the format `<repo url>, <short description>` — using the same description you put in the message. Preserve all existing lines — only add the new one at the end.
