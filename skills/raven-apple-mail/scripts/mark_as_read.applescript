-- Mark a specific inbox email as read in Apple Mail.
-- Usage: osascript mark_as_read.applescript <message-id>
-- Outputs JSON on success; exits non-zero with an actionable error on failure.

on run argv
    if (count of argv) is not 1 then
        error "Usage: osascript mark_as_read.applescript <message-id>"
    end if

    set targetId to item 1 of argv as string

    tell application "Mail"
        set matchingMessages to (messages of inbox whose message id is targetId)
        if (count of matchingMessages) is 0 then
            error "Message not found in inbox for id: " & targetId & ". It may have already been archived, moved, or the id is incorrect."
        end if
        set read status of (first item of matchingMessages) to true
    end tell

    return "{\"success\":true,\"id\":\"" & targetId & "\"}"
end run
