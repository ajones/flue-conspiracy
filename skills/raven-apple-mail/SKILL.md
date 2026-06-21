---
name: raven-apple-mail
description: Use this skill to read, search, list, and manage local Apple Mail messages via AppleScript helpers.
---

# Apple Mail Skill

This skill provides AppleScript helpers for working with Apple Mail. All scripts are run via `osascript` from the `scripts/` directory.

## Output format

All scripts return **JSON**. List scripts return a JSON array; action scripts (`mark_as_read`, `archive_message`, `send_email`) return a JSON object. Errors exit non-zero with an actionable message on stderr — no GUI dialogs are shown.

## Scripts

### List inbox emails
Returns all inbox messages as `[{id, subject}]`.
```bash
osascript skills/raven-apple-mail/scripts/list_inbox.applescript
```

### List all inbox emails
Alias for `list_inbox` — same output format.
```bash
osascript skills/raven-apple-mail/scripts/list_all_emails.applescript
```

### List unread inbox emails
Returns unread inbox messages as `[{id, subject}]`.
```bash
osascript skills/raven-apple-mail/scripts/list_unread_emails.applescript
```

### Get a message by ID
Returns full metadata and content for a single message as `{id, date, sender, subject, read, content}`. Searches all mailboxes across all accounts.
```bash
osascript skills/raven-apple-mail/scripts/get_message.applescript "<message-id>"
```

### Mark a message as read
Returns `{success, id}`.
```bash
osascript skills/raven-apple-mail/scripts/mark_as_read.applescript "<message-id>"
```

### Archive a message
Moves the message to the Archive mailbox. Falls back to **All Mail** for Gmail accounts. Returns `{success, id}`.
```bash
osascript skills/raven-apple-mail/scripts/archive_message.applescript "<message-id>"
```

### Send an email
Returns `{success}`. CC, BCC, and attachments are optional — pass `""` to skip.
```bash
osascript skills/raven-apple-mail/scripts/send_email.applescript \
  "<to>" "<subject>" "<body>" "[cc]" "[bcc]" "[attachment1,attachment2,...]"
```

## Notes

- `<message-id>` is the Mail message ID string (e.g. `69a09d9974495_143af8532834@3ac1dd31c405.mail`), not a numeric ID.
- List scripts search the unified inbox only. `get_message` searches all mailboxes.
- Mutating scripts: `mark_as_read`, `archive_message`, `send_email`.
