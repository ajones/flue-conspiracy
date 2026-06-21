-- Get a single email by message ID, returning metadata and content as JSON.
-- Usage: osascript get_message.applescript <message-id>
-- Searches all mailboxes across all accounts.
-- Exits non-zero with an actionable error on failure.

on run argv
    if (count of argv) is not 1 then
        error "Usage: osascript get_message.applescript <message-id>"
    end if

    set targetId to item 1 of argv as string

    tell application "Mail"
        set foundMessage to missing value

        repeat with acc in accounts
            repeat with mb in every mailbox of acc
                try
                    set matching to (messages of mb whose message id is targetId)
                    if (count of matching) > 0 then
                        set foundMessage to first item of matching
                        exit repeat
                    end if
                end try
            end repeat
            if foundMessage is not missing value then exit repeat
        end repeat

        if foundMessage is missing value then
            error "Message not found for id: " & targetId & ". The id may be incorrect or the message may have been deleted."
        end if

        set jId to my escapeForJSON(targetId)
        set jDate to my escapeForJSON(date sent of foundMessage as string)
        set jSender to my escapeForJSON(sender of foundMessage as string)
        set jSubject to my escapeForJSON(subject of foundMessage as string)
        set jContent to my escapeForJSON(content of foundMessage as string)
        set jRead to (read status of foundMessage as string)
    end tell

    return "{\"id\":\"" & jId & "\",\"date\":\"" & jDate & "\",\"sender\":\"" & jSender & "\",\"subject\":\"" & jSubject & "\",\"read\":" & jRead & ",\"content\":\"" & jContent & "\"}"
end run

on escapeForJSON(str)
    set AppleScript's text item delimiters to "\\"
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\\"
    set str to parts as string
    set AppleScript's text item delimiters to "\""
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\""
    set str to parts as string
    set AppleScript's text item delimiters to linefeed
    set parts to text items of str
    set AppleScript's text item delimiters to "\\n"
    set str to parts as string
    set AppleScript's text item delimiters to return
    set parts to text items of str
    set AppleScript's text item delimiters to "\\n"
    return parts as string
end escapeForJSON
