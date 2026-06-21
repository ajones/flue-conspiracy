-- Send an email via Apple Mail with optional CC, BCC, and attachments.
-- Usage: osascript send_email.applescript <to> <subject> <body> [cc] [bcc] [attachment1,attachment2,...]
-- Outputs JSON on success; exits non-zero with an actionable error on failure.

on run argv
    if (count of argv) < 3 then
        error "Usage: osascript send_email.applescript <to> <subject> <body> [cc] [bcc] [attachments]"
    end if

    set toAddr to item 1 of argv
    set theSubject to item 2 of argv
    set theBody to item 3 of argv
    set ccAddr to missing value
    set bccAddr to missing value
    set attachList to {}

    if (count of argv) ≥ 4 then set ccAddr to item 4 of argv
    if (count of argv) ≥ 5 then set bccAddr to item 5 of argv
    if (count of argv) ≥ 6 then
        set AppleScript's text item delimiters to ","
        set attachList to text items of (item 6 of argv)
    end if

    tell application "Mail"
        set newMessage to make new outgoing message with properties {subject:theSubject, content:theBody & return}
        make new to recipient at newMessage with properties {address:toAddr}
        if ccAddr is not missing value then
            repeat with addr in my splitString(ccAddr, ",")
                make new cc recipient at newMessage with properties {address:addr}
            end repeat
        end if
        if bccAddr is not missing value then
            repeat with addr in my splitString(bccAddr, ",")
                make new bcc recipient at newMessage with properties {address:addr}
            end repeat
        end if
        repeat with fPath in attachList
            try
                make new attachment with properties {file name:fPath} at after the last paragraph of content of newMessage
            end try
        end repeat
        send newMessage
    end tell

    return "{\"success\":true}"
end run

on splitString(theString, theDelimiter)
    set AppleScript's text item delimiters to theDelimiter
    set theList to text items of theString
    set AppleScript's text item delimiters to ""
    return theList
end splitString
