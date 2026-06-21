---
name: apple-photos
description: Apple Photos.app integration for macOS. List albums, browse photos, search by date/person/content, export photos.
metadata:
  openclaw:
    emoji: "📷"
    os: ["darwin"]
---

# Apple Photos

Access Photos.app via SQLite queries. Run scripts from: `cd {baseDir}`

## Requirements
- Full Disk Access for terminal (System Settings → Privacy → Full Disk Access)

## Commands

| Command | Usage |
|---------|-------|
| Library stats | `scripts/photos-count.sh` |
| List albums | `scripts/photos-list-albums.sh` |
| Recent photos | `scripts/photos-recent.sh [count]` |
| Album most recent | `scripts/photos-album-most-recent.sh <album_name>` |
| Album random | `scripts/photos-album-random.sh <album_name>` |
| Photo comment | `scripts/photos-comment.sh <uuid>` |
| List people | `scripts/photos-list-people.sh` |
| Search by person | `scripts/photos-search-person.sh <name> [limit]` |
| Search by content | `scripts/photos-search-content.sh <query> [limit]` |
| Search by date | `scripts/photos-search-date.sh <start> [end] [limit]` |
| Photo info | `scripts/photos-info.sh <uuid>` |
| Export photo | `scripts/photos-export.sh <uuid> [output_path]` |
| Send via iMessage | `scripts/photos-send-imessage.sh <uuid> <recipient> [message]` |
| List group chats | `osascript -e 'tell application "Messages" to get {name, id} of every chat'` |

## Output

- Recent/search/album: `Filename | Date | Type | UUID` (album most recent appends `| Comment` only when present)
- Albums: `Album Name | Photo Count | Type` (type is `album` or `shared`)
- People: `ID | Name | Photo Count`
- `photos-info.sh`: key-value pairs including comment/caption when present
- Default export: `/tmp/photo_export.jpg`

## Workflow: View a Photo

1. Get UUID: `scripts/photos-recent.sh 1`
2. Export: `scripts/photos-export.sh "UUID"`
3. View at `/tmp/photo_export.jpg`

## Workflow: Send a Photo via iMessage

The `<recipient>` argument accepts three formats:

| Format | Example | Target |
|--------|---------|--------|
| Phone number | `+15551234567` | Direct message (buddy) |
| Email | `user@example.com` | Direct message (buddy) |
| Group chat name | `"Mayhem MGMT"` | Group chat (looked up by name) |
| Chat ID | `chat:any;+;bc2201f8...` | Group chat (explicit ID) |

**Send to a person:**
1. Find a photo: `scripts/photos-album-most-recent.sh "Album Name"`
2. Send: `scripts/photos-send-imessage.sh "UUID" "+15551234567" "Optional message"`
   - If you omit the message, the script sends the photo's comment/caption first when available.

**Send to a group chat:**
1. Find the group name: `osascript -e 'tell application "Messages" to get {name, id} of every chat'`
2. Find a photo: `scripts/photos-album-random.sh "Double Trouble"`
3. Send: `scripts/photos-send-imessage.sh "UUID" "Mayhem MGMT" "Optional message"`
   - If you omit the message, the script sends the photo's comment/caption first when available.

The script handles export, staging, and cleanup automatically. Text and photo are sent as separate messages (iMessage limitation).

## Notes

- Date format: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`
- Content search uses ML, slower (~5-10s) than date/person (~100ms)
- HEIC auto-converts to JPEG on export
- Name search is case-insensitive, partial match
- Album commands support both regular and shared (iCloud) albums with partial name matching
- Export handles shared album photos and cloud-only files (falls back to cached thumbnail if original isn't downloaded)
- `photos-info.sh` includes a `Comment:` line only when a shared caption/comment or asset description exists
- iMessage send requires Automation permission for Messages.app (grant in System Settings → Privacy → Automation)
