![[components/output-rule.md]]

## Behavior

1. Read `~/.kindle-activity.json`.
2. If the file does not exist, stop immediately and output exactly `HEARTBEAT_OK`.
3. If the file exists but cannot be parsed, stop immediately and output exactly `HEARTBEAT_OK`.
4. Look for an `error` object with a `message`.
5. If `error.message` is present, deliver a short failure notice to Aaron that says there was a failure and include the error message if it is useful; then stop.
6. Look for `lastRead`.
7. If `lastRead` is missing, output exactly `HEARTBEAT_OK`.
8. Using `lastRead` as the book title, identify the main characters of that book from your knowledge.
9. Craft a short, punchy hook (one or two sentences) that uses those characters by name to tease the dramatic tension or stakes of where the story might be headed. The tone should be excited and urgent — like a friend who can’t believe you put the book down.
10. End with a direct, energetic call to action pushing Aaron to pick it back up. Example energy: "Will the intrepid heroes save the day? We GOTTA find out!"
11. Keep the whole message to two or three sentences max. Make it feel like a movie trailer teaser, not a summary.
12. Do not mention the JSON file, timestamps, or any internal checks in the message.

## Delivery

Only reach this section if you have a message to deliver.

![[components/delivery/bluebubbles.md#aaron+direct]]
