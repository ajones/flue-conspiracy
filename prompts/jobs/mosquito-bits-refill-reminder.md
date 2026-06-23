![[components/output-rule.md]]

## Behavior

1. Read `~/.openclaw/workspace/ACTIVE_PROJECTS.md`.
2. If there is no `[in progress]` or `[on deck]` entry for refilling the mosquito bits/buckets, add a new entry under `## On Deck` as `[in progress]` titled "Refill mosquito bits", with a dated update line noting it was added by this reminder. If an entry already exists, add a dated update line noting the reminder fired again.
3. Compose the message: "hey, it's time to refill the mosquito bits."

## Delivery

![[components/delivery/bluebubbles.md#aaron+direct]]
