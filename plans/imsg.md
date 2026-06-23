# Add `imsg`-Backed iMessage Support With Participant Enrichment

## Summary
Replace the BlueBubbles runtime transport with the local `imsg` CLI, while keeping the external channel name as `imessage`. The adapter should send and receive messages through `imsg`, and use `imsg group` to enrich inbound events with participant metadata for both direct and group chats.

## Key Changes
- Add `src/channels/imessage.ts` as the new iMessage adapter.
  - Use `imsg watch` for inbound events, `imsg send` for outbound replies, and `imsg chats` for chat discovery.
  - Use `imsg group --chat-id <id>` to attach participant lists, display names, and identifiers to incoming dispatch payloads.
  - Normalize Flue conversation keys under the `imessage:` namespace and map them back to `imsg` chat ids/identifiers.

- Update agent wiring to recognize `imessage:` conversations.
  - Add the iMessage posting tool to `src/agents/raven-lead.ts`, `src/agents/home-assistant.ts`, and `src/agents/hello-world.ts` when the dispatch id starts with `imessage:`.
  - Keep Telegram logic unchanged.

- Remove BlueBubbles as the runtime dependency.
  - Replace BlueBubbles config fields in `src/config.ts` and `raven.json5` with whatever minimal `imsg`-related settings are actually needed.
  - Preserve compatibility in naming by keeping `imessage` as the public channel key/session prefix.

- Update docs and job assets to the new transport.
  - Rewrite `README.md`, `AGENTS.md`, `plans/scheduler.md`, and the iMessage-related prompt templates to describe `imsg` instead of BlueBubbles.
  - Update cron-creator helper docs/examples and validation logic to use `imessage:` session keys and local `imsg` lookup data.
  - Remove BlueBubbles-specific examples and assumptions from delivery scripts and validation helpers.

## Test Plan
- Mock `imsg chats`, `imsg group`, `imsg watch`, and `imsg send` to verify parsing and routing logic.
- Verify inbound events include participant metadata from `imsg group` for both direct and group chats.
- Verify outbound sends choose the correct `imsg` flags for direct versus group targets.
- Run the repo’s typecheck/build path and confirm the gateway still starts cleanly.
- Smoke test with the installed CLI against a known direct chat and a known group chat.

## Assumptions
- `imessage` remains the canonical channel/session prefix for compatibility.
- `imsg group` is used only to enrich inbound events and resolve participant context, not as a separate user-facing feature.
- Advanced IMCore features remain out of scope for this pass; basic send/receive plus participant identification is the target.
