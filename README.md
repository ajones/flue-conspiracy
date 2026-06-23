# flue-conspiracy

Agent service built on the [Flue framework](https://github.com/withastro/flue) with OpenAI Codex OAuth support and refresh token management. Chat interface uses the Flue TUI. iMessage integration via the local `imsg` CLI.

## Stack

- **Runtime**: [Flue](https://github.com/withastro/flue) (`@flue/runtime`, `@flue/cli`)
- **Language**: TypeScript
- **Auth**: OpenAI Codex (reads from `~/.codex/auth.json`, managed by `codex login`)
- **UI**: Flue TUI (built-in terminal interface — no custom chat UI)
- **Messaging**: local `imsg` CLI (iMessage channel)

## Implementation Phases

### Phase 1 — Auth & Token Management

Read credentials from the Codex CLI auth store (`~/.codex/auth.json`). Login delegates to `codex login` which handles the browser-based ChatGPT sign-in and token refresh.

Deliverables:
- `src/auth/oauth.ts` — wraps `codex login` / `codex logout`
- `src/auth/tokens.ts` — reads access token and API key from Codex auth store
- `raven auth login|status|logout` CLI commands

### Phase 2 — Basic Agent + Flue TUI

Stand up the Flue agent with a system prompt and wire it to Codex via the auth module. Use the Flue TUI (`npx flue dev`) for interactive chat — no custom UI.

Deliverables:
- `src/agent.ts` — agent definition with system prompt, Codex model binding
- `flue.config.ts` — runtime config
- Conversational chat working end-to-end through the Flue TUI

### Phase 3 — Agent Functionality

Build out the agent's tools, skills, and subagents. Define the domain-specific capabilities that make this agent useful.

Deliverables:
- Tools in `src/tools/` — typed Flue tool definitions
- Subagent definitions if needed
- Skills packages for reusable expertise
- Integration tests for tool execution

### Phase 4 — iMessage via `imsg`

Connect the agent to iMessage using the local `imsg` CLI as the Flue channel backend. Users can interact with the agent over iMessage.

Deliverables:
- `src/channels/imessage.ts` — `imsg` channel adapter
- Watch-based setup for incoming messages
- Outbound message delivery
- End-to-end test: send/receive iMessage through the agent

## Setup

```bash
npm install
npx tsx src/cli/index.ts auth login   # authenticate via Codex
```

### Configuration

All service config lives in `raven.json5` (JSON5 with comments):

```json5
{
  // Each bot token maps to a target agent
  telegram: [
    {
      name: "greeter",
      botToken: "123:ABC...",
      webhookSecret: "my-secret",
      agent: "hello-world",       // agent in src/agents/
    },
  ],
  // imessage: {                  // Phase 4
  //   db: "/Users/raven/Library/Messages/chat.db",
  //   conversations: [
  //     { identifier: "+15127407713", agent: "raven-lead" },
  //     { identifier: "bc2201f817d34f7da609764bf73c4ffb", agent: "raven-lead" },
  //   ],
  // },
}
```

Types are defined in `src/config.ts` — see `RavenConfig`.

The first telegram bot is mounted at `/channels/telegram/webhook`. Additional bots mount at `/channels/<name>/webhook`.

## Development

```bash
npx flue dev
```

## Auth Flow

1. `raven auth login` delegates to `codex login`, which opens a browser for ChatGPT sign-in.
2. Codex stores tokens in `~/.codex/auth.json`.
3. The agent reads the access token from that file on each request.
4. Codex handles token refresh automatically during active sessions.

## Project Structure

```
flue-conspiracy/
├── src/
│   ├── app.ts                # flue app entry point
│   ├── agents/
│   │   └── hello-world.ts    # polyglot greeter agent
│   ├── tools/                # agent tools (Phase 3)
│   ├── auth/
│   │   ├── oauth.ts          # OAuth 2.0 flow (Phase 1)
│   │   └── tokens.ts         # token storage & refresh (Phase 1)
│   └── channels/
│       └── imessage.ts       # imsg adapter (Phase 4)
├── flue.config.ts            # flue framework config
├── .env.example
└── package.json
```

## License

Apache-2.0
