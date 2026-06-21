-- List all Apple Notes (all accounts and folders)
tell application "Notes"
	set output to ""
	set noteCount to 0

	repeat with acc in accounts
		set accountName to name of acc
		repeat with fol in folders of acc
			set folderName to name of fol
			repeat with n in notes of fol
				set noteCount to noteCount + 1
				set noteName to name of n
				set noteId to id of n
				set modDate to modification date of n
				set lineCount to 0
				try
					set lineCount to count of (paragraphs of (body of n))
				end try
				set output to output & "• " & noteName & linefeed & "  ID: " & noteId & linefeed & "  Folder: " & folderName & " (" & accountName & ")" & linefeed & "  Lines: " & lineCount & linefeed & "  Modified: " & (modDate as text) & linefeed
			end repeat
		end repeat
	end repeat

	if noteCount is 0 then
		set output to "No notes found."
	else
		set output to "Notes (" & noteCount & " total):" & linefeed & linefeed & output
	end if
end tell

return output
