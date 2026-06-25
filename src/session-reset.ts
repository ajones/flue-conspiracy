import { createSessionStorageKey } from '@flue/runtime/adapter';
import type { SessionStore } from '@flue/runtime/adapter';
import { createLogger } from './log.ts';

const log = createLogger('session-reset');

let sessionStore: SessionStore | null = null;

async function getSessionStore(): Promise<SessionStore> {
  if (sessionStore) return sessionStore;
  const { default: adapter } = await import('./db.ts');
  const stores = await adapter.connect();
  sessionStore = stores.executionStore.sessions;
  return sessionStore;
}

export async function clearAgentSession(instanceId: string): Promise<void> {
  const store = await getSessionStore();
  const key = createSessionStorageKey(instanceId, 'default', 'default');
  await store.delete(key);
  log.info('Session cleared', { instanceId, key });
}
