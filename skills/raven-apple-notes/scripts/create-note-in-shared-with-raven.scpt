on run argv
    if (count of argv) < 2 then
        error "Usage: osascript create-note-in-shared-with-raven.scpt <note-title> <note-body>"
    end if

    set noteTitle to item 1 of argv
    set noteBody to item 2 of argv

    -- Formatting: H1-style heading in first line, then a blank line, then body text
    -- Matches the pattern you used manually in Notes:
    -- <div><h1>Title</h1></div>
    -- <div><br></div>
    -- <div>Body...</div>
    set formattedBody to "<div><h1>" & noteTitle & "</h1></div>" & ¬
        "<div><br></div>" & ¬
        "<div>" & noteBody & "</div>"

    tell application "Notes"
        -- Try to find the "Shared With Raven" folder across all accounts
        set targetFolder to missing value
        repeat with f in every folder
            if name of f is "Shared With Raven" then
                set targetFolder to f
                exit repeat
            end if
        end repeat

        if targetFolder is missing value then
            error "Could not find a folder named 'Shared with Raven' in Apple Notes. Make sure it exists and is visible to AppleScript."
        end if

        set newNote to make new note at targetFolder with properties {body:formattedBody}

        -- Return a simple identifier so callers can capture it
        set noteId to id of newNote
        return "CREATED:" & noteId
    end tell
end run
