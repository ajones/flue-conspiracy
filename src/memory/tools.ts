import type { MemoryConfig } from '../config.js';
import { createLogger } from '../log.js';

const log = createLogger('memory');
const DEFAULT_URL = 'http://localhost:3111';

export async function recallMemory(
  config: MemoryConfig,
  scopeKey: string,
  query: string,
  limit = 10,
): Promise<string | null> {
  const url = config.url ?? DEFAULT_URL;
  try {
    const res = await fetch(`${url}/agentmemory/smart-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      log.warn('Recall request failed', { status: res.status, scopeKey });
      return null;
    }
    const data = await res.json();
    const results = data?.results ?? data;
    if (!Array.isArray(results) || results.length === 0) return null;
    log.debug('Recalled memories', { count: results.length, scopeKey });
    return results
      .slice(0, limit)
      .map((r: any) => r.title ?? r.content ?? r.text ?? '')
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    log.warn('Recall request error', { scopeKey, error: String(err) });
    return null;
  }
}

export async function saveMemory(
  config: MemoryConfig,
  scopeKey: string,
  content: string,
): Promise<void> {
  const url = config.url ?? DEFAULT_URL;
  try {
    await fetch(`${url}/agentmemory/remember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, scope: scopeKey, tags: [scopeKey] }),
    });
    log.debug('Saved memory', { scopeKey, contentLength: content.length });
  } catch (err) {
    log.warn('Save memory failed', { scopeKey, error: String(err) });
  }
}
