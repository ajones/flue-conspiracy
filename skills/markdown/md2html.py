#!/usr/bin/env python3
"""Convert markdown to an HTML fragment (no <html>/<body> wrapper).

Usage:
  echo "# Hello" | python3 md2html.py
  python3 md2html.py input.md
  python3 md2html.py - < input.md
"""
import sys
import markdown

def convert(text):
    return markdown.markdown(text, extensions=["extra", "nl2br"])

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        with open(sys.argv[1]) as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    print(convert(text))
