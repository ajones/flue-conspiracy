import type { CreatedAgent } from '@flue/runtime';
import { SessionBusyError } from '@flue/runtime';
import { createSessionStorageKey } from '@flue/runtime/adapter';
import {
  Bash,
  InMemoryFs,
  bashFactoryToSessionEnv,
  createFlueContext,
  resolveModel,
} from '@flue/runtime/internal';
import { createLogger } from './log.ts';

const log = createLogger('session-compact');

const agentLoaders: Record<string, () => Promise<CreatedAgent>> = {
  'hello-world': () => import('./agents/hello-world.ts').then((m) => m.default),
  'home-assistant': () => import('./agents/home-assistant.ts').then((m) => m.default),
  'raven-lead': () => import('./agents/raven-lead.ts').then((m) => m.default),
  'task-master': () => import('./agents/task-master.ts').then((m) => m.default),
  'weather-man': () => import('./agents/weather-man.ts').then((m) => m.default),
};

async function loadCreatedAgent(name: string): Promise<CreatedAgent | undefined> {
  const load = agentLoaders[name];
  return load ? load() : undefined;
}

export type CompactResult = 'compacted' | 'noop' | 'no_session';

export function compactSessionMessage(result: CompactResult): string {
  switch (result) {
    case 'compacted':
      return 'Conversation history compacted.';
    case 'noop':
      return 'Nothing to compact — recent history is already within limits.';
    case 'no_session':
      return 'No conversation history to compact.';
  }
}

let storesPromise: ReturnType<typeof connectStores> | null = null;

async function connectStores() {
  const { default: adapter } = await import('./db.ts');
  return adapter.connect();
}

async function getExecutionStore() {
  storesPromise ??= connectStores();
  const stores = await storesPromise;
  return stores.executionStore;
}

async function createDefaultEnv() {
  const fs = new InMemoryFs();
  return bashFactoryToSessionEnv(() => new Bash({
    fs,
    network: { dangerouslyAllowFullInternetAccess: true },
  }));
}

export async function compactAgentSession(agentName: string, instanceId: string): Promise<CompactResult> {
  const agent = await loadCreatedAgent(agentName);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const executionStore = await getExecutionStore();
  const storageKey = createSessionStorageKey(instanceId, 'default', 'default');
  const existing = await executionStore.sessions.load(storageKey);
  if (!existing?.entries.length) {
    log.info('Nothing to compact — empty session', { agentName, instanceId });
    return 'no_session';
  }

  const ctx = createFlueContext({
    id: instanceId,
    payload: undefined,
    env: process.env,
    agentConfig: {
      packagedSkills: {},
      resolveModel,
    },
    createDefaultEnv,
    defaultStore: executionStore.sessions,
    submissionStore: executionStore.submissions,
  });

  let compacted = false;
  const unsub = ctx.subscribeEvent((event) => {
    if (event.type === 'compaction' && !event.isError) {
      compacted = true;
    }
  });

  try {
    const harness = await ctx.initializeCreatedAgent(agent, undefined);
    const session = await harness.session('default');
    await session.compact();
    const result: CompactResult = compacted ? 'compacted' : 'noop';
    log.info('Compaction finished', { agentName, instanceId, result });
    return result;
  } catch (err) {
    if (err instanceof SessionBusyError) {
      throw new Error('Session is busy — try again in a moment.');
    }
    throw err;
  } finally {
    unsub();
  }
}
