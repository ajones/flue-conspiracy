-- List all emails in Apple Mail's inbox as a JSON array.
-- Usage: osascript list_all_emails.applescript
set jsonItems to {}

tell application "Mail"
    repeat with m in messages of inbox
        set msgId to my escapeForJSON(message id of m as string)
        set msgSubject to my escapeForJSON(subject of m as string)
        set end of jsonItems to "{\"id\":\"" & msgId & "\",\"subject\":\"" & msgSubject & "\"}"
    end repeat
end tell

set AppleScript's text item delimiters to ","
"[" & (jsonItems as string) & "]"

on escapeForJSON(str)
    set AppleScript's text item delimiters to "\\"
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\\"
    set str to parts as string
    set AppleScript's text item delimiters to "\""
    set parts to text items of str
    set AppleScript's text item delimiters to "\\\""
    return parts as string
end escapeForJSON
