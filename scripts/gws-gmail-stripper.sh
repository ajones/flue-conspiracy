#!/usr/bin/env python3
# Pipe a Gmail API message (format:full JSON) to this script.
# Outputs clean plain text suitable for LLM processing.
# Falls back to HTML-stripped text if no text/plain part exists.

import json, sys, base64, re, html as html_mod

def decode_body(data):
    if not data:
        return ""
    return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

def strip_html(h):
    h = re.sub(r'<style[^>]*>.*?</style>', '', h, flags=re.DOTALL | re.IGNORECASE)
    h = re.sub(r'<script[^>]*>.*?</script>', '', h, flags=re.DOTALL | re.IGNORECASE)
    h = re.sub(r'<br\s*/?>', '\n', h, flags=re.IGNORECASE)
    h = re.sub(r'<p[^>]*>', '\n', h, flags=re.IGNORECASE)
    h = re.sub(r'<[^>]+>', '', h)
    h = html_mod.unescape(h)
    h = re.sub(r'\n{3,}', '\n\n', h)
    return h.strip()

def find_part(part, mime_type):
    if part.get("mimeType") == mime_type:
        return decode_body(part.get("body", {}).get("data", ""))
    for p in part.get("parts", []):
        result = find_part(p, mime_type)
        if result:
            return result
    return ""

def die(msg, code=1):
    sys.stderr.write(f"gws-gmail-stripper error: {msg}\n")
    sys.exit(code)

try:
    raw = sys.stdin.read()
except Exception as e:
    die(f"failed to read stdin: {e}")

# skip any non-JSON preamble (e.g. "Using keyring backend: keyring")
json_start = raw.find("{")
if json_start == -1:
    die("no JSON found in input — is the gws command outputting an error?")

try:
    msg = json.loads(raw[json_start:])
except json.JSONDecodeError as e:
    die(f"JSON parse error: {e}")

# surface API-level errors (e.g. auth failures)
if "error" in msg:
    err = msg["error"]
    die(f"Gmail API error {err.get('code', '?')}: {err.get('message', err)}")

payload = msg.get("payload", msg)  # accept full message or just payload

text = find_part(payload, "text/plain")
if text.strip():
    print(text.strip())
    sys.exit(0)

html_body = find_part(payload, "text/html")
if html_body.strip():
    print(strip_html(html_body))
    sys.exit(0)

die("no text/plain or text/html part found in message")
