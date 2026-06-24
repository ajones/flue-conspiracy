import { createSessionStorageKey } from '@flue/runtime/adapter';
import type { SessionStore } from '@flue/runtime/adapter';
import adapter from './db.ts';
import { createLogger } from './log.ts';

const log = createLogger('session-reset');
const CLEAR_RE = /^\/(?:new|clear)\b/;

let sessionStore: SessionStore | null = null;

async function getSessionStore(): Promise<SessionStore> {
  if (sessionStore) return sessionStore;
  const stores = await adapter.connect();
  sessionStore = stores.executionStore.sessions;
  return sessionStore;
}

export function isClearCommand(text: string): boolean {
  return CLEAR_RE.test(text);
}

export async function clearAgentSession(instanceId: string): Promise<void> {
  const store = await getSessionStore();
  const key = createSessionStorageKey(instanceId, 'default', 'default');
  await store.delete(key);
  log.info('Session cleared', { instanceId, key });
}
