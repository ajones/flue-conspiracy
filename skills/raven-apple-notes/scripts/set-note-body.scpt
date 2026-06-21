-- Set the full body of an Apple Note by ID or name
-- Usage:
--   osascript set-note-body.scpt <note-id-or-name> <html-body>

on run argv
	if (count of argv) < 2 then
		return "Usage: osascript set-note-body.scpt <note-id-or-name> <html-body>"
	end if

	set targetIdOrName to item 1 of argv
	set newBody to item 2 of argv
	if (count of argv) > 2 then
		repeat with i from 3 to count of argv
			set newBody to newBody & " " & (item i of argv)
		end repeat
	end if

	tell application "Notes"
		set foundNote to missing value
		repeat with acc in accounts
			repeat with fol in folders of acc
				repeat with n in notes of fol
					if (id of n as text) is targetIdOrName or (name of n) is targetIdOrName then
						set foundNote to n
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

		set body of foundNote to newBody
		return "Updated note body for: " & (name of foundNote)
	end tell
end run
