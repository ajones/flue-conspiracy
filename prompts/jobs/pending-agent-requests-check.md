![[components/output-rule.md]]

## Task

1. Read `~/.openclaw/workspace/PENDING_AGENT_REQUESTS.md`.
2. If the file is missing, empty, or has no pending request blocks older than 2 hours, reply exactly `HEARTBEAT_OK`.
3. Otherwise, identify each pending request block older than 2 hours.
4. Compose one short, casual nudge that names the old request(s) briefly and asks Aaron about them.
5. Before delivering, ensure `PENDING_AGENT_REQUESTS.md` has a new request block for this exact nudge, including a `created_at:` timestamp and the instruction that the next substantive reply in this thread should be treated as the answer.
6. Keep the nudge short and practical. No timestamps in the visible message.
7. Do not mention the pending-request machinery.
