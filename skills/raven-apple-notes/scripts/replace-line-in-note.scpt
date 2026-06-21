-- Replace a specific line or range of lines in an Apple Note
-- Usage:
--   By line number: osascript replace-line-in-note.scpt <note-id-or-name> <line-number> <replacement-text>
--   By line range:  osascript replace-line-in-note.scpt <note-id-or-name> <start-end> <replacement-text>
--   By matching:    osascript replace-line-in-note.scpt <note-id-or-name> <search-string> <replacement-text>
-- Examples:
--   osascript replace-line-in-note.scpt "My Note" 3 "New third line"
--   osascript replace-line-in-note.scpt "My Note" "3-7" "Single replacement line"
--   osascript replace-line-in-note.scpt "My Note" "3-7" "Line one
-- Line two"
--   osascript replace-line-in-note.scpt "My Note" "old text" "new line content"

on run argv
	if (count of argv) < 3 then
		return "Usage: osascript replace-line-in-note.scpt <note-id-or-name> <line-number-or-search-string> <replacement-text>"
	end if

	set targetIdOrName to item 1 of argv
	set lineSpec to item 2 of argv
	set replacementText to item 3 of argv

	-- Join any extra args into replacement text
	if (count of argv) > 3 then
		repeat with i from 4 to count of argv
			set replacementText to replacementText & " " & (item i of argv)
		end repeat
	end if

	-- Decide: line range (e.g. "3-7"), single line number, or match string
	set useLineNumber to false
	set useLineRange to false
	set lineNum to 0
	set rangeStart to 0
	set rangeEnd to 0

	-- Check for range format "start-end"
	if lineSpec contains "-" then
		try
			set dashPos to offset of "-" in lineSpec
			set rangeStart to (text 1 thru (dashPos - 1) of lineSpec) as integer
			set rangeEnd to (text (dashPos + 1) thru -1 of lineSpec) as integer
			if rangeStart ≥ 1 and rangeEnd ≥ rangeStart then set useLineRange to true
		end try
	end if

	-- If not a range, check for single line number
	if not useLineRange then
		try
			set lineNum to lineSpec as integer
			if lineNum ≥ 1 then set useLineNumber to true
		end try
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

		set noteBody to body of foundNote
		set lineList to paragraphs of noteBody

		if useLineRange then
			if rangeEnd > (count of lineList) then
				return "Error: Line range " & rangeStart & "-" & rangeEnd & " is out of range (note has " & (count of lineList) & " lines)."
			end if
			set part1 to {}
			if rangeStart > 1 then set part1 to items 1 thru (rangeStart - 1) of lineList
			set part2 to paragraphs of replacementText
			if (count of part2) is 0 then set part2 to {""}
			set part3 to {}
			if rangeEnd < (count of lineList) then set part3 to items (rangeEnd + 1) thru -1 of lineList
			set lineList to part1 & part2 & part3
		else if useLineNumber then
			if lineNum > (count of lineList) then
				return "Error: Line " & lineNum & " is out of range (note has " & (count of lineList) & " lines)."
			end if
			set item lineNum of lineList to replacementText
		else
			set matched to false
			repeat with i from 1 to count of lineList
				if (item i of lineList) contains lineSpec then
					set item i of lineList to replacementText
					set matched to true
					exit repeat
				end if
			end repeat
			if not matched then
				return "Error: No line containing: " & lineSpec
			end if
		end if

		-- Rejoin lines with linefeed
		set oldDelims to AppleScript's text item delimiters
		set AppleScript's text item delimiters to linefeed
		set newBody to lineList as text
		set AppleScript's text item delimiters to oldDelims

		set body of foundNote to newBody
		return "Replaced line(s) in note: " & foundNoteName
	end tell
end run
