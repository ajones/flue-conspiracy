![[components/output-rule.md]]

## Task

Check Gmail for unread Google Alert emails that match specific criteria.

**Filtering rules — only process emails that meet ALL of these:**
- Subject is exactly: `Google Alert - Daily Digest`
- Body contains the phrase: `Dementia breakthrough`

Use the gws CLI. Start by finding the unread alert emails, then read any matching messages. After processing each matching alert, archive it in Gmail so it does not stay unread.

Suggested flow:
1. Use Gmail triage/listing to identify unread messages using the search filter `in:inbox subject:"Google Alert - Daily Digest"`.
2. For each such message, read the body. If it does NOT contain `Dementia breakthrough`, archive it silently and skip it.
3. For messages that pass both filters, extract all article links. Skip any article whose link points to a YouTube video (i.e., contains `youtube.com` or `youtu.be`). If all articles are YouTube links, treat the message as having no relevant results and archive silently.
   Also skip any article that is primarily about **early detection or earlier diagnosis** of dementia (e.g. detecting it sooner, new tests/biomarkers for earlier identification). These are not relevant.
   Also skip any article with a negative, alarming, or discouraging tone — e.g. rising rates, risks, failures, setbacks, or bad outcomes. Only pass through articles that are hopeful, positive, or inspiring: treatments showing promise, lifestyle interventions with good results, caregiver support breakthroughs, quality-of-life improvements, or encouraging research findings.
4. Archive the processed message in Gmail after summarizing it.
5. Keep the summary extremely short: one line per alert, focused on why it matters.
6. If no emails pass the filters, output exactly `HEARTBEAT_OK` and stop.

## Output format

If alerts exist, return only short bullet points in this shape:
- <why it matters>. Read: <link>

Keep it terse. No extra commentary.

## Delivery

![[components/delivery/bluebubbles.md#aaron+sherri]]
