![[components/output-rule.md]]

## Behavior

1. Read `ACTIVE_PROJECTS.md` in your workspace.
2. Check whether there is already an `[in progress]` or `[on deck]` entry for "hair cut" or "haircut" (case-insensitive). If one already exists with either of those statuses, skip step 3 and go straight to Delivery.
3. If no such entry exists, add a new item under the `## On Deck` section (insert it immediately after the `## On Deck` heading line and any blank line that follows it):

```
- [in progress] Hair cut
  - Updates:
    - <today's date YYYY-MM-DD>: Due for a haircut.
```

   Write the updated file back to `ACTIVE_PROJECTS.md` in your workspace.
