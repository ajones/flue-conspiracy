-- List inbox emails as a JSON array with id and subject fields.
-- Usage: osascript list_inbox.applescript
set jsonItems to {}

tell application "Mail"
    repeat with m in messages of inbox
        set msgId to message id of m as string
        set msgSubject to subject of m as string
        set msgId to my escapeForJSON(msgId)
        set msgSubject to my escapeForJSON(msgSubject)
        set end of jsonItems to "{\"id\":\"" & msgId & "\",\"subject\":\"" & msgSubject & "\"}"
    end repeat
end tell

set AppleScript's text item delimiters to ","
"[" & (jsonItems as string) & "]"

on escapeForJSON(str)
    -- Escape backslashes first, then double-quotes
    set AppleScript's text item delimiters to "\\"
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\\"
    set str to parts as string
    set AppleScript's text item delimiters to "\""
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\""
    return parts as string
end escapeForJSON
