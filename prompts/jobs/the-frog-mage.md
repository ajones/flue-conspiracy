![[components/output-rule.md]]

# Daily Frog Mage image

Every time this job runs, do the following:

1. Run the X image scraper to fetch recent images from the Frog Mage's profile:
   ```
   node ~/local/raven/flue-conspiracy/skills/playwright-scraper/scripts/get-x-profile-images.js the_frog_mage
   ```
   This outputs JSON with an `images` array. Each entry has `imageUrl` and `tweetUrl`.

2. Read the history file at `~/local/raven/flue-conspiracy/workspace/raven-lead/.thefrogmage.history` (one `imageUrl` per line). If the file doesn't exist, treat it as empty.

3. Pick the first `imageUrl` from the script output that does NOT appear in the history file.
   - If all images have already been sent, pick the most recent one anyway (the first in the list).

4. Append the chosen `imageUrl` to the history file (one URL per line).

5. Download the image to a temp file using a unix timestamp in the filename:
   ```
   curl -sL "<imageUrl>" -o /tmp/frog-mage-$(date +%s).jpg
   ```

6. Send the downloaded image file to the conversation.
