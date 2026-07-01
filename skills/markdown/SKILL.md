---
name: markdown
description: Convert markdown text to an HTML fragment for use in emails or other HTML contexts.
metadata:
---

# markdown

Convert markdown to an HTML fragment (no `<html>`/`<body>` wrapper) using `md2html.py` in this skill's directory. Run the script with `python3 <skill-dir>/md2html.py`.

## Usage

```bash
# From a string
echo "# Hello" | python3 <skill-dir>/md2html.py

# From a file
python3 <skill-dir>/md2html.py input.md

# Capture output for use in another command
html=$(echo "**bold text**" | python3 <skill-dir>/md2html.py)
```

## Output

Produces an HTML fragment suitable for passing to `gws gmail +send --html` or any other tool that accepts HTML body content. No `<html>`, `<head>`, or `<body>` tags are included.

## Supported Markdown

Standard markdown plus extras (tables, fenced code blocks, attribute lists) and `nl2br` (newlines become `<br>` tags).

## Example

Input:
```markdown
## Summary

- First item
  (1/12, 4/2)

- Second item
  (3/5)
```

Output:
```html
<h2>Summary</h2>
<ul>
<li>First item<br>
(1/12, 4/2)</li>
<li>Second item<br>
(3/5)</li>
</ul>
```

## Integration with gws-gmail-send

```bash
html=$(cat summary.md | python3 <skill-dir>/md2html.py)
gws gmail +send --to recipient@example.com --subject "Subject" --body "$html" --html
```
