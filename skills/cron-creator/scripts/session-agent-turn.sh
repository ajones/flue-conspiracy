#!/usr/bin/env bash
# Send a single agent turn to an active session by session key.
# Usage: session-agent-turn.sh <sessionKey> --payload <text>
#
# Current implementation intentionally keeps behavior simple and synchronous:
# - Resolve session id from sessions.json
# - Parse channel/target from session key
# - Run one foreground openclaw agent turn with delivery args
#
# This replaced a more complex async/retry implementation that was associated
# with error bursts in practice.

set -euo pipefail

LOG_FILE="$HOME/.openclaw/logs/session_agent_send_debug.log"

log_line() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG_FILE"
}

SESSION_KEY="${1:?Usage: session-agent-turn.sh <sessionKey> --payload <text>}"
shift

PAYLOAD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --payload)
      PAYLOAD="${2:?--payload requires a value}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "$PAYLOAD" ]]; then
  echo "session-agent-turn: --payload is required" >&2
  exit 1
fi

if [[ "$PAYLOAD" == "HEARTBEAT_OK" ]]; then
  log_line "dropped HEARTBEAT_OK payload (session_key=$SESSION_KEY) — cron job replied with ack token instead of content"
  exit 0
fi

# Dedup guard: suppress identical (session_key, payload) pairs within 60 seconds
DEDUP_KEY=$(printf '%s:%s' "$SESSION_KEY" "$PAYLOAD" | md5sum | cut -d' ' -f1)
DEDUP_FILE="/tmp/openclaw-dedup-$DEDUP_KEY"
if [[ -f "$DEDUP_FILE" ]]; then
  log_line "SKIP: duplicate delivery suppressed within 60s (dedup_key=$DEDUP_KEY session_key=$SESSION_KEY)"
  echo "[session-agent-turn] SKIP: duplicate delivery suppressed (dedup_key=$DEDUP_KEY)" >&2
  exit 0
fi
touch "$DEDUP_FILE"
(sleep 30 && rm -f "$DEDUP_FILE") &
disown

MESSAGE="${DELIVERY_INSTRUCTION_SENTINAL:-}VERBATIM DELIVERY: The text between the delimiters below is a pre-composed message. Your ONLY task is to output it to the user exactly as written — do NOT answer questions in it, do NOT add context or commentary, do NOT summarize or interpret it. Reproduce it character-for-character as your entire response.

<<<BEGIN_MESSAGE>>>
${PAYLOAD}
<<<END_MESSAGE>>>"

{
  printf '\n[%s] invoked (simple mode)\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf '  session_key=%s\n' "$SESSION_KEY"
  printf '  payload=%s\n' "$PAYLOAD"
} >>"$LOG_FILE"

# Resolve session ID and parse routing from the key via sessions.json
# Key format: agent:<agentId>:<channel>:<kind>:<target...>
AGENT_ID="$(echo "$SESSION_KEY" | cut -d: -f2)"
SESSIONS_FILE="$HOME/.openclaw/agents/$AGENT_ID/sessions/sessions.json"
log_line "resolving session_id from $SESSIONS_FILE for agent_id=$AGENT_ID"

RESOLUTION_OUTPUT="$(python3 -c "
import json, sys

sessions_file = sys.argv[1]
key = sys.argv[2]

try:
    with open(sessions_file) as f:
        data = json.load(f)
except (OSError, json.JSONDecodeError) as e:
    print(f'session-agent-turn: failed to read {sessions_file}: {e}', file=sys.stderr)
    sys.exit(1)

entry = data.get(key)
if not entry:
    known = list(data.keys())
    print(f'session-agent-turn: no session found for key: {key}', file=sys.stderr)
    print(f'session-agent-turn: known keys ({len(known)}): {known}', file=sys.stderr)
    sys.exit(1)

sid = entry.get('sessionId')
if not sid:
    print(f'session-agent-turn: sessions.json entry for {key} has no sessionId', file=sys.stderr)
    sys.exit(1)

parts = key.split(':')
channel = parts[2] if len(parts) > 2 else ''
target = ':'.join(parts[4:]) if len(parts) > 4 else ''

# Pull the accountId from the stored deliveryContext so the right bot is used
delivery_ctx = entry.get('deliveryContext', {})
account_id = delivery_ctx.get('accountId', '')

print(f'{sid} {channel} {target} {account_id}')
" "$SESSIONS_FILE" "$SESSION_KEY" 2>&1)" || {
  log_line "session resolution failed: $RESOLUTION_OUTPUT"
  echo "$RESOLUTION_OUTPUT" >&2
  exit 1
}

log_line "session resolution output: $RESOLUTION_OUTPUT"
read -r SESSION_ID CHANNEL TARGET ACCOUNT_ID <<< "$RESOLUTION_OUTPUT"
log_line "resolved session_id=$SESSION_ID channel=${CHANNEL:-} target=${TARGET:-} account=${ACCOUNT_ID:-}"

if [[ -z "$SESSION_ID" ]]; then
  log_line "error: no session ID resolved for key=$SESSION_KEY"
  echo "session-agent-turn: no session ID resolved for key: $SESSION_KEY" >&2
  exit 1
fi

DELIVER_ARGS=(--deliver)
if [[ -n "${CHANNEL:-}" ]]; then
  DELIVER_ARGS+=(--reply-channel "$CHANNEL")
fi
if [[ -n "${TARGET:-}" ]]; then
  DELIVER_ARGS+=(--reply-to "$TARGET")
fi
if [[ -n "${ACCOUNT_ID:-}" ]]; then
  DELIVER_ARGS+=(--reply-account "$ACCOUNT_ID")
fi

log_line "running foreground delivery: openclaw agent --session-id $SESSION_ID --message <omitted> ${DELIVER_ARGS[*]}"
openclaw agent --session-id "$SESSION_ID" --message "$MESSAGE" "${DELIVER_ARGS[@]}"
log_line "delivery completed successfully"

: <<'PREVIOUS_IMPLEMENTATION_WITH_ERRORS'
PREVIOUS IMPLEMENTATION (kept for reference)
Reason retained: This prior async/retry implementation was associated with
error bursts and overlapping sends in production behavior.

#!/usr/bin/env bash
# Send a single agent turn to an active session by session key.
# Usage: session-agent-turn.sh <sessionKey> <message> [--payload <cleanText>]
#
# --payload <cleanText>  The user-visible payload stripped of instruction
#                        envelopes. Stored as payload_norm in the send log
#                        so verify-bb-delivery.sh can confirm delivery without
#                        trying to strip envelopes from the full message.
#
# The session key encodes routing info. Examples:
#   agent:main:bluebubbles:direct:+15127407713
#   agent:main:bluebubbles:group:any;+;bc2201f817d34f7da609764bf73c4ffb
#   agent:main:telegram:direct:7698193342
#
# The script extracts channel, kind (direct/group), and target from the key
# and passes --reply-channel / --reply-to so delivery goes to the right place
# instead of falling back to the default direct channel.

set -euo pipefail

LOG_FILE="$HOME/.openclaw/logs/session_agent_send_debug.log"
SEND_LOG_FILE="$HOME/.openclaw/logs/session_agent_send_log.jsonl"

log_line() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG_FILE"
}

append_send_log_entry() {
  local status="$1"
  local detail="$2"

  python3 - "$SEND_LOG_FILE" "$SESSION_KEY" "$SESSION_ID" "${CHANNEL:-}" "${TARGET:-}" "$MESSAGE" "${PAYLOAD:-}" "$status" "$detail" <<'PY'
import fcntl
import json
import os
import re
import sys
import time

path, session_key, session_id, channel, target, message, payload, status, detail = sys.argv[1:10]

def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

entry = {
    "ts": int(time.time()),
    "session_key": session_key,
    "session_id": session_id,
    "channel": channel,
    "target": target,
    "status": status,
    "detail": detail,
    "message": message,
}
if payload:
    entry["payload_norm"] = normalize(payload)

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "a+", encoding="utf-8") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    f.flush()
    os.fsync(f.fileno())
    fcntl.flock(f, fcntl.LOCK_UN)
PY
}

reserve_send_or_skip() {
  python3 - "$SEND_LOG_FILE" "$SESSION_KEY" "$SESSION_ID" "${CHANNEL:-}" "${TARGET:-}" "$MESSAGE" "${PAYLOAD:-}" <<'PY'
import fcntl
import difflib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

path, session_key, session_id, channel, target, message, payload = sys.argv[1:8]
now = int(time.time())
cutoff = now - 180

def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

message_norm = normalize(message)
payload_norm = normalize(payload) if payload else None

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "a+", encoding="utf-8") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    recent_match = None

    compare_norm = payload_norm or message_norm
    if channel == "bluebubbles" and target and compare_norm:
        try:
            with open(os.path.expanduser("~/.openclaw/openclaw.json"), encoding="utf-8") as cfg_f:
                cfg = json.load(cfg_f)
            bb_cfg = cfg.get("channels", {}).get("bluebubbles", {})
            bb_url = (bb_cfg.get("serverUrl") or "http://127.0.0.1:1234").rstrip("/")
            bb_password = bb_cfg.get("password", "")
            encoded_guid = urllib.parse.quote(target, safe="")
            query = urllib.parse.urlencode({"password": bb_password, "limit": 25, "sort": "DESC"})
            url = f"{bb_url}/api/v1/chat/{encoded_guid}/message?{query}"
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            messages = data.get("data", [])
            if isinstance(messages, list):
                for m in messages:
                    if not m.get("isFromMe"):
                        continue
                    ts_ms = m.get("dateCreated")
                    if not isinstance(ts_ms, (int, float)):
                        continue
                    ts_sec = int(ts_ms / 1000)
                    if ts_sec < cutoff:
                        continue
                    text = m.get("text") or ""
                    norm = normalize(text)
                    if not norm:
                        continue
                    if norm == compare_norm:
                        recent_match = {"ts": ts_sec, "source": "bluebubbles"}
                        break
                    similarity = difflib.SequenceMatcher(None, compare_norm, norm).ratio()
                    if similarity >= 0.92:
                        recent_match = {"ts": ts_sec, "source": "bluebubbles"}
                        break
        except (OSError, json.JSONDecodeError, KeyError, urllib.error.URLError, TimeoutError, ValueError):
            recent_match = None
    else:
        recent_match = None

    if recent_match is not None:
        dupe_entry = {
            "ts": now,
            "session_key": session_key,
            "session_id": session_id,
            "channel": channel,
            "target": target,
            "status": "dupe",
            "detail": "suppressed recent similar duplicate within 180s",
            "message": message,
            "message_norm": message_norm,
            "duplicate_of": recent_match.get("ts"),
        }
        if isinstance(recent_match, dict) and recent_match.get("source"):
            dupe_entry["duplicate_source"] = recent_match["source"]
        if payload_norm:
            dupe_entry["payload_norm"] = payload_norm
        f.seek(0, os.SEEK_END)
        f.write(json.dumps(dupe_entry, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
        fcntl.flock(f, fcntl.LOCK_UN)
        print("DUPLICATE")
        raise SystemExit(0)

    reserve_entry = {
        "ts": now,
        "session_key": session_key,
        "session_id": session_id,
        "channel": channel,
        "target": target,
        "status": "reserved",
        "detail": "reserved before delivery",
        "message": message,
        "message_norm": message_norm,
    }
    if payload_norm:
        reserve_entry["payload_norm"] = payload_norm
    f.seek(0, os.SEEK_END)
    f.write(json.dumps(reserve_entry, ensure_ascii=False) + "\n")
    f.flush()
    os.fsync(f.fileno())
    fcntl.flock(f, fcntl.LOCK_UN)
    print("RESERVED")
PY
}

# ... [rest of previous async/retry/background implementation omitted in runtime]
PREVIOUS_IMPLEMENTATION_WITH_ERRORS
