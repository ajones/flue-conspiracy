### Pending request / reply handling

This cron asks a question, so it must use the pending-request pattern.

Before you deliver the question:
1. Ensure `<your workspace>/PENDING_AGENT_REQUESTS.md` exists with the header `# Pending Agent Requests`.
2. Append a new request block for this question containing:
   - the exact question you are asking
   - instructions that the next substantive reply in this thread should be treated as the answer
   - instructions to take whatever follow-up action this cron requires based on that reply
   - instructions to remove the completed request block from `<eyour workspace>/PENDING_AGENT_REQUESTS.md` after processing the reply
3. Make the request block explicit enough that a later main-session turn can complete the follow-up action without ambiguity.
4. Do not mention the pending-request machinery.
