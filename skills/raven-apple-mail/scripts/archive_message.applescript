-- Archive a specific inbox email using Mail.app's native Archive action.
-- Usage: osascript archive_message.applescript <message-id>
-- Opens the message in Mail, triggers Message > Archive, then closes the window.
-- Exits non-zero with an actionable error on failure.

on run argv
    if (count of argv) is not 1 then
        error "Usage: osascript archive_message.applescript <message-id>"
    end if

    set targetId to item 1 of argv as string

    tell application "Mail"
        set matchingMessages to (messages of inbox whose message id is targetId)
        if (count of matchingMessages) is 0 then
            error "Message not found in inbox for id: " & targetId & ". It may have already been archived, moved, or the id is incorrect."
        end if
        activate
        open first item of matchingMessages
    end tell

    -- Trigger Mail's native Archive via the Message menu
    tell application "System Events"
        tell process "Mail"
            click menu item "Archive" of menu "Message" of menu bar 1
        end tell
    end tell

    return "{\"success\":true,\"id\":\"" & targetId & "\"}"
end run
