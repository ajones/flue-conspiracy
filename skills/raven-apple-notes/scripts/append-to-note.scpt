-- Append text to an Apple Note by ID or by name
-- Usage: osascript append-to-note.scpt <note-id-or-name> <text-to-append>
-- Example: osascript append-to-note.scpt "My Note" "New paragraph to add"

on run argv
	if (count of argv) < 2 then
		return "Usage: osascript append-to-note.scpt <note-id-or-name> <text-to-append>"
	end if

	set targetIdOrName to item 1 of argv
	set textToAppend to item 2 of argv

	-- If more than 2 args, join the rest as the append text (for text with spaces in id/name)
	if (count of argv) > 2 then
		repeat with i from 3 to count of argv
			set textToAppend to textToAppend & " " & (item i of argv)
		end repeat
	end if

	tell application "Notes"
		set foundNote to missing value
		set foundNoteName to ""
		repeat with acc in accounts
			repeat with fol in folders of acc
				repeat with n in notes of fol
					if (id of n as text) is targetIdOrName or (name of n) is targetIdOrName then
						set foundNote to n
						set foundNoteName to name of n
						exit repeat
					end if
				end repeat
				if foundNote is not missing value then exit repeat
			end repeat
			if foundNote is not missing value then exit repeat
		end repeat

		if foundNote is missing value then
			return "Error: No note found with ID or name: " & targetIdOrName
		end if

		set body of foundNote to (body of foundNote) & linefeed & linefeed & textToAppend
		return "Appended to note: " & foundNoteName
	end tell
end run
