#!/usr/bin/env bash
# Verify that a BlueBubbles delivery actually landed in the chat.
#
# Usage: verify-bb-delivery.sh <sessionKey> [--since <unixTs>] [--threshold <0.0-1.0>] [--limit <n>]
#
# Looks up the most recent send_log entry for <sessionKey> that has a
# payload_norm field (written by session-agent-turn.sh --payload). Fetches
# recent messages from the BlueBubbles API and scores each against payload_norm
# using SequenceMatcher. Exits 0 if a match is found, 1 if not.
#
# Options:
#   --since <ts>        Only consider send log entries after this unix timestamp
#   --threshold <f>     Similarity threshold (default: 0.85)
#   --limit <n>         Number of BB messages to fetch (default: 30)

set -euo pipefail

SEND_LOG_FILE="$HOME/.openclaw/logs/session_agent_send_log.jsonl"

SESSION_KEY="${1:?Usage: verify-bb-delivery.sh <sessionKey> [--since <ts>] [--threshold <f>] [--limit <n>]}"
shift

SINCE=""
THRESHOLD="0.85"
LIMIT="30"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)     SINCE="${2:-}";     shift 2 ;;
    --threshold) THRESHOLD="${2:-}"; shift 2 ;;
    --limit)     LIMIT="${2:-}";     shift 2 ;;
    *) shift ;;
  esac
done

exec python3 - "$SEND_LOG_FILE" "$SESSION_KEY" "$SINCE" "$THRESHOLD" "$LIMIT" <<'PY'
import difflib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

send_log_path, session_key, since_str, threshold_str, limit_str = sys.argv[1:6]

since     = int(since_str) if since_str else 0
threshold = float(threshold_str)
limit     = int(limit_str)

# ── helpers ──────────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def score(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()

# ── find payload_norm from send log ──────────────────────────────────────────

payload_norm = None
try:
    with open(send_log_path, encoding="utf-8") as f:
        lines = f.readlines()
except OSError as e:
    print(f"verify-bb-delivery: cannot read send log: {e}", file=sys.stderr)
    sys.exit(2)

for raw in reversed(lines):
    raw = raw.strip()
    if not raw:
        continue
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError:
        continue
    if entry.get("session_key") != session_key:
        continue
    if since and entry.get("ts", 0) < since:
        break
    if entry.get("payload_norm"):
        payload_norm = entry["payload_norm"]
        break

if not payload_norm:
    print(
        f"verify-bb-delivery: no send log entry with payload_norm found for {session_key}",
        file=sys.stderr,
    )
    sys.exit(2)

# ── parse BB config from openclaw.json ───────────────────────────────────────

import os

openclaw_json = os.path.expanduser("~/.openclaw/openclaw.json")
bb_url = "http://127.0.0.1:1234"
bb_password = ""

try:
    with open(openclaw_json, encoding="utf-8") as f:
        cfg = json.load(f)
    bb_cfg = cfg.get("channels", {}).get("bluebubbles", {})
    if bb_cfg:
        bb_url      = bb_cfg.get("serverUrl", bb_url).rstrip("/")
        bb_password = bb_cfg.get("password", bb_password)
except (OSError, json.JSONDecodeError, KeyError):
    pass  # fall through to defaults

# ── derive chat GUID from session key ────────────────────────────────────────
# key format: agent:<agentId>:<channel>:<kind>:<target...>

parts = session_key.split(":")
if len(parts) < 5:
    print(f"verify-bb-delivery: cannot parse target from session key: {session_key}", file=sys.stderr)
    sys.exit(2)

chat_guid = ":".join(parts[4:])

# ── fetch recent BB messages ──────────────────────────────────────────────────

auth = urllib.parse.urlencode({"guid": bb_password})
encoded_guid = urllib.parse.quote(chat_guid, safe="")
url = f"{bb_url}/api/v1/chat/{encoded_guid}/message?limit={limit}&sort=DESC&{auth}"

try:
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read())
except urllib.error.URLError as e:
    print(f"verify-bb-delivery: BB API request failed: {e}", file=sys.stderr)
    sys.exit(2)
except json.JSONDecodeError as e:
    print(f"verify-bb-delivery: BB API returned invalid JSON: {e}", file=sys.stderr)
    sys.exit(2)

messages = data.get("data", [])
if not isinstance(messages, list):
    print("verify-bb-delivery: unexpected BB API response shape", file=sys.stderr)
    sys.exit(2)

# ── score each message ────────────────────────────────────────────────────────

best_score = 0.0
best_text  = ""

for msg in messages:
    text = msg.get("text") or ""
    if not text:
        continue
    norm = normalize(text)
    if not norm:
        continue
    s = score(payload_norm, norm)
    if s > best_score:
        best_score = s
        best_text  = text

print(f"verify-bb-delivery: best_score={best_score:.3f} threshold={threshold}")
if best_text:
    preview = best_text[:120].replace("\n", " ")
    print(f"verify-bb-delivery: best_match={preview!r}")

if best_score >= threshold:
    print("verify-bb-delivery: CONFIRMED")
    sys.exit(0)
else:
    print("verify-bb-delivery: NOT_FOUND")
    sys.exit(1)
PY
