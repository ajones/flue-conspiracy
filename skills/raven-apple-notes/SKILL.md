---
name: raven-apple-notes
description: Read, list, append to, and replace lines in Apple Notes via AppleScript from the command line.
metadata:
  openclaw:
    emoji: "📝"
    requires: { bins: [] }
    install: []
---

# Apple Notes

> Shared folder used by this skill for collaborative notes: **"Shared With Raven"** (exact name, case-sensitive).

## Overview

This skill lets you work with **Apple Notes** from the command line using AppleScript. You can list notes (with metadata), append text to a note, replace a single line or a range of lines, and get note content by ID or name. All scripts use the Notes app’s scripting interface and run via `osascript` (built-in on macOS).

Use this skill when you need to inspect, update, or automate Apple Notes from scripts or the terminal.

## Usage

Scripts live in `scripts/` and are run with `osascript`. The note can be specified by **note name** or **note ID** (from the list script).

### Create a new note in "Shared With Raven"

Create a new note in the shared folder **"Shared With Raven"** (exact name, case-sensitive):

```bash
osascript skills/raven-apple-notes/scripts/create-note-in-shared-with-raven.scpt \
  "Packing Template" \
  "Body text here."
```

**Formatting behavior:**
- The script writes HTML into the note `body` using this structure:
  ```html
  <div><b><span style="font-size: 24px">Title</span></b></div>
  <div><br></div>
  <div>Body text…</div>
  ```
- Notes automatically derives the note **title bar** from the first line of the body, so we **do not** set the `name` property explicitly.
- This avoids duplicate titles and produces a heading-at-top layout that matches hand-edited notes.

### Formatting and Markdown

Apple Notes stores note bodies as rich text / HTML behind the scenes. If you pipe in raw Markdown, it will show up as literal `#`, `##`, `-` characters instead of nice headings and bullets.

To get clean formatting when appending or replacing content:

- **Convert Markdown to simple HTML first** (e.g., in a small Python or shell helper) and then pass that HTML string to the AppleScript.
- Treat `#`/`##` headings as **bold paragraphs**, not giant H1/H2 blocks, so the note layout stays compact:
  - `# Babysitter Notes - Cabo` → `<p><b>Babysitter Notes - Cabo</b></p>`
  - `## Feeding` → `<p><b>Feeding</b></p>`
- Turn bullet lines (`- item`) into `<ul><li>…</li></ul>` lists.
- Preserve blank lines by inserting `<br>` tags between sections.

Pattern used in practice:

1. Read a local Markdown file (e.g. a babysitter doc in iCloud Drive).
2. Convert it to minimal HTML with bold section labels and `<ul>` lists.
3. Use an AppleScript like `append-to-note` or a custom script to set/append the note `body` with that HTML.

This produces Notes that look “native” (bold section headers, proper bullets) instead of showing raw Markdown syntax.

### List all notes

```bash
osascript skills/raven-apple-notes/scripts/list-apple-notes.scpt
```

Output includes for each note: name, ID, folder (and account), line count, and last modified time.

### Append to a note

```bash
osascript skills/raven-apple-notes/scripts/append-to-note.scpt "<note-id-or-name>" "<text-to-append>"
```

Example:

```bash
osascript skills/raven-apple-notes/scripts/append-to-note.scpt "Grocery list" "Milk, eggs, bread"
```

### Replace a line or range of lines

```bash
# Replace single line by line number
osascript skills/raven-apple-notes/scripts/replace-line-in-note.scpt "<note>" "<line-number>" "<replacement>"

# Replace range (e.g. lines 3–7)
osascript skills/raven-apple-notes/scripts/replace-line-in-note.scpt "<note>" "3-7" "<replacement>"

# Replace first line containing a string
osascript skills/raven-apple-notes/scripts/replace-line-in-note.scpt "<note>" "<search-string>" "<replacement>"
```

### Get note content

```bash
# Full note
osascript skills/raven-apple-notes/scripts/get-note-content.scpt "<note-id-or-name>"

# Single line
osascript skills/raven-apple-notes/scripts/get-note-content.scpt "<note>" "<line-number>"

# Line range
osascript skills/raven-apple-notes/scripts/get-note-content.scpt "<note>" "3-7"
```

## References

- **Scripts** (relative to this skill):
  - `scripts/list-apple-notes.scpt` – list all notes with metadata
  - `scripts/append-to-note.scpt` – append text to a note
  - `scripts/replace-line-in-note.scpt` – replace line(s) by number, range, or matching string
  - `scripts/get-note-content.scpt` – get full body or a line range
- **System** – Apple Notes app (macOS), AppleScript / `osascript`

## Guardrails

- **Automation permission** – The first time a script talks to Notes, macOS may prompt for “Automation” access (System Settings → Privacy & Security → Automation). Grant access to Terminal (or the app running the script) for the scripts to work.
- **Note matching** – When identifying by name, the first note whose title matches exactly is used. IDs from the list script are unique and preferred when scripting.
- **Line numbering** – Lines are 1-based. “Paragraphs” in the note body (split by newlines) are used for line counts and ranges; empty lines still count as lines.
- **Do not** rely on these scripts for real-time sync with iCloud; changes are subject to normal Notes sync behavior.

## Formatting Learnings

- For checklist-style items that match hand-formatted Notes checkboxes, use the AppleSymbols checkbox glyph inside list items, e.g.
  
  ```html
  <ul>
    <li><font face="AppleSymbols">☐</font> Tape</li>
    <li><font face="AppleSymbols">☐</font> Superglue</li>
    <li><font face="AppleSymbols">☐</font> Tool kit (screwdrivers, etc.)</li>
  </ul>
  ```

- This renders in Notes as a clean bullet list where each line starts with a checkbox glyph (☐) followed by the text, matching the manual pattern Aaron uses.
- When converting a run-on text block exported from Notes into sections + checklists, prefer rewriting the entire note body as structured HTML using this pattern (title paragraph, bold section headers, then `<ul>` lists with AppleSymbols checkboxes).
