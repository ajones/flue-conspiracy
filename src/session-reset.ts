import { createSessionStorageKey } from '@flue/runtime/adapter';
import type { SessionStore } from '@flue/runtime/adapter';
import adapter from './db.ts';
import { createLogger } from './log.ts';
import { isClearCommand } from './session-clear.ts';

export { isClearCommand } from './session-clear.ts';

const log = createLogger('session-reset');

let sessionStore: SessionStore | null = null;

async function getSessionStore(): Promise<SessionStore> {
  if (sessionStore) return sessionStore;
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
