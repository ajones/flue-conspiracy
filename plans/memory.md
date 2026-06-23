# Integrate agentmemory into flue-conspiracy

## Context

Currently using Hindsight for agent memory, which is inaccurate due to its extraction/summarization approach. agentmemory is a TypeScript-native, fully local memory system that runs with zero LLM calls by default (local embeddings via `@xenova/transformers`, no extraction step). It provides triple-stream retrieval (BM25 + vector + entity graph) and runs as a standalone server on port 3111 via iii-engine.

## Architecture

```
Gateway (app.ts, port 7284)
  │
  ├── createAgent() → tools include memory_save, memory_recall, memory_smart_search
  │                     (Flue defineTool wrappers calling agentmemory REST API)
  │
  └── HTTP ──→ agentmemory daemon (port 3111)
                ├── iii-engine (auto-managed, auto-downloads)
                ├── SQLite state at ~/.agentmemory/
                └── Local embeddings (@xenova/transformers BGE-small)
```

agentmemory runs as an attached child process of the gateway — it starts when the gateway starts and dies when the gateway dies. No PID files, no separate start/stop commands, no management overhead.

## Integration approach: `defineTool()` REST wrappers

Flue's `connectMcpServer()` expects standard MCP Streamable HTTP/SSE transport, but agentmemory exposes custom REST endpoints. Rather than adding an MCP bridge, create `defineTool()` wrappers that call agentmemory's REST API directly — same pattern as `src/telegram-tools.ts`.

This gives us control over exactly which tools the agent sees (not all 53), avoids MCP transport complexity, and matches existing codebase conventions.

## Implementation steps

### 1. Add config (`src/config.ts` + `piracy.json5`)

Add `MemoryConfig` interface, `getMemoryConfig()`, and `getMemoryScope()` to `src/config.ts`:

```typescript
export interface MemoryConfig {
  enabled?: boolean;                    // default true
  url?: string;                        // default 'http://localhost:3111'
  defaultScope?: 'agent' | 'conversation';  // default 'conversation'
  agents?: Record<string, { scope: 'agent' | 'conversation' }>;
}

export function getMemoryConfig(): MemoryConfig {
  return loadConfig().memory ?? {};
}

export function getMemoryScope(agentName: string): 'agent' | 'conversation' {
  const { defaultScope = 'conversation', agents = {} } = getMemoryConfig();
  return agents[agentName]?.scope ?? defaultScope;
}
```

Add to `PiracyConfig` interface: `memory?: MemoryConfig`

Add to `piracy.json5`:
```json5
memory: {
  enabled: true,
  defaultScope: "conversation",
  agents: {
    // "raven-lead": { scope: "agent" },       // shared across all convos
    // "support-bot": { scope: "conversation" }, // isolated per chat/group
  },
},
```

### 2. Create process manager (`src/memory/process.ts`)

Spawns agentmemory as an attached child process — no PID files, no detaching:

- `spawnAgentMemory(config)` — spawns `bunx @agentmemory/agentmemory` as attached child, pipes stderr to gateway stderr for log visibility. Returns the `ChildProcess` handle.
- `waitForReady(url, timeoutMs)` — polls `GET {url}/agentmemory/health` with backoff (max 30s for first start since iii-engine binary downloads)
- `killAgentMemory(child)` — sends SIGTERM to the child process
- Set `AGENTMEMORY_AUTO_COMPRESS=false` and `EMBEDDING_PROVIDER=local` in spawn env to guarantee zero API calls
- The child process is NOT detached — when the gateway exits (clean or crash), the OS reaps it automatically

### 3. Create memory tools (`src/memory/tools.ts`)

Three `defineTool()` wrappers calling agentmemory REST endpoints, following `src/telegram-tools.ts` pattern:

**`memory_save`** — `POST /agentmemory/remember`
- Parameters: `{ content: string, tags?: string[] }`
- Agent calls this to explicitly save facts, preferences, decisions

**`memory_recall`** — `POST /agentmemory/smart-search`
- Parameters: `{ query: string, limit?: number }`
- Triple-stream hybrid search (BM25 + vector + entity graph)

**`memory_forget`** — `POST /agentmemory/governance/delete`  
- Parameters: `{ query: string }`
- User-requested memory deletion

Export a factory function: `createMemoryTools(baseUrl: string, scopeKey: string)` returning the tools array. The `scopeKey` is injected automatically into every save/recall — the agent never thinks about scoping.

### 4. Create module index (`src/memory/index.ts`)

Exports:
- `initMemory(config)` — spawns child process, waits for ready, caches tools
- `getMemoryTools()` — returns cached tools array

No explicit shutdown needed — child process dies with the gateway.

### 5. Wire into `src/app.ts`

After `registerProvider()`:
```typescript
const memConfig = getMemoryConfig();
if (memConfig.enabled !== false) {
  await initMemory(memConfig);
}
```

No shutdown handler needed — the child process is attached and dies with the gateway.

### 6. Inject tools into agent (`src/agents/raven-lead.ts`)

Resolve the scope at init time using the agent name + conversation id, then create scoped tools:

```typescript
import { createMemoryTools, isMemoryAvailable } from '../memory/index.js';
import { getMemoryConfig, getMemoryScope } from '../config.js';

// Inside createAgent callback, after telegram tools:
if (isMemoryAvailable()) {
  const scope = getMemoryScope('raven-lead');
  const scopeKey = scope === 'agent' ? 'raven-lead' : `raven-lead:${id}`;
  tools.push(...createMemoryTools(getMemoryConfig().url ?? 'http://localhost:3111', scopeKey));
}
```

### 7. Update agent instructions (`src/agents/raven-lead.ts`)

Add memory guidance to the `ravenLead` profile instructions:

```
## Memory
You have persistent memory tools. Use them to:
- Save important facts, preferences, and decisions with memory_save
- Search past context before answering with memory_recall  
- Forget information when asked with memory_forget

Store verbatim facts. Don't store trivial or one-off information.
Check memory when a user references something from a previous conversation.
```

### 8. Install dependency

```bash
bun add @agentmemory/agentmemory
```

## Files to create
- `src/memory/process.ts` — attached child process spawn + health wait
- `src/memory/tools.ts` — `defineTool()` wrappers (pattern: `src/telegram-tools.ts`)
- `src/memory/index.ts` — module facade

## Files to modify
- `src/config.ts` — add `MemoryConfig`, `getMemoryConfig()`
- `piracy.json5` — add `memory` section
- `src/app.ts` — init memory at startup
- `src/agents/raven-lead.ts` — inject tools + update instructions
- `package.json` — add `@agentmemory/agentmemory` dependency

## Verification

1. `bun run dev` — confirm agentmemory sidecar starts, health check passes
2. `curl http://localhost:3111/agentmemory/health` — confirm agentmemory is reachable
3. Send a Telegram message like "Remember that my favorite color is blue"
4. Confirm agent calls `memory_save` tool (visible in traces at Jaeger)
5. Send "What's my favorite color?" in a new conversation
6. Confirm agent calls `memory_recall` and returns "blue"
7. Stop gateway (Ctrl+C), confirm agentmemory child process exits cleanly (no orphans)
