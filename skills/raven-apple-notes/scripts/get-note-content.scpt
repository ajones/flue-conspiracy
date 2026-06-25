-- Get the contents of an Apple Note by ID or name, optionally a line range
-- Usage:
--   Full note:  osascript get-note-content.scpt <note-id-or-name>
--   One line:   osascript get-note-content.scpt <note-id-or-name> <line-number>
--   Line range: osascript get-note-content.scpt <note-id-or-name> <start-end>

on run argv
	if (count of argv) < 1 then
		return "Usage: osascript get-note-content.scpt <note-id-or-name> [line-number-or-range]"
	end if

	set targetIdOrName to item 1 of argv
	set useRange to false
	set rangeStart to 0
	set rangeEnd to 0

	if (count of argv) ≥ 2 then
		set lineSpec to item 2 of argv

		if lineSpec contains "-" then
			try
				set dashPos to offset of "-" in lineSpec
				set rangeStart to (text 1 thru (dashPos - 1) of lineSpec) as integer
				set rangeEnd to (text (dashPos + 1) thru -1 of lineSpec) as integer
				if rangeStart ≥ 1 and rangeEnd ≥ rangeStart then set useRange to true
			end try
		else
			try
				set rangeStart to lineSpec as integer
				set rangeEnd to rangeStart
				if rangeStart ≥ 1 then set useRange to true
			end try
		end if

		if not useRange then
			repeat with i from 2 to count of argv
				set targetIdOrName to targetIdOrName & " " & (item i of argv)
			end repeat
		end if
	end if

	tell application "Notes"
		launch
		set foundNote to my findNote(targetIdOrName)

		if foundNote is missing value then
			return "Error: No note found with ID or name: " & targetIdOrName
		end if

		set noteBody to body of foundNote

		if not useRange then
			return noteBody
		end if

		set lineList to paragraphs of noteBody
		set lineCount to count of lineList

		if rangeStart > lineCount then
			return "Error: Line " & rangeStart & " is out of range (note has " & lineCount & " lines)."
		end if
		if rangeEnd > lineCount then
			set rangeEnd to lineCount
		end if

		set selectedLines to items rangeStart thru rangeEnd of lineList
		set oldDelims to AppleScript's text item delimiters
		set AppleScript's text item delimiters to linefeed
		set output to selectedLines as text
		set AppleScript's text item delimiters to oldDelims
		return output
	end tell
end run

on findNote(targetIdOrName)
	tell application "Notes"
		set preferredFolders to {"Shared with Raven", "Shared With Raven"}

		repeat with folderName in preferredFolders
			repeat with acc in accounts
				try
					set fol to folder folderName of acc
					set matches to every note of fol whose name is targetIdOrName
					if (count of matches) > 0 then return item 1 of matches
				end try
			end repeat
		end repeat

		repeat with acc in accounts
			repeat with fol in folders of acc
				try
					set matches to every note of fol whose name is targetIdOrName
					if (count of matches) > 0 then return item 1 of matches
				end try
			end repeat
		end repeat

		repeat with acc in accounts
			repeat with fol in folders of acc
				repeat with n in notes of fol
					if (id of n as text) is targetIdOrName then return n
				end repeat
			end repeat
		end repeat

		return missing value
	end tell
end findNote
