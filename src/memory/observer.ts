import { observe } from '@flue/runtime';
import { getMemoryConfig, getMemoryScope } from '../config.js';
import { isMemoryAvailable, saveMemory } from './index.js';
import { getAgentName } from '../agent-names.js';
import { createLogger } from '../log.js';

const log = createLogger('memory');

export function registerMemoryObserver() {
  observe((event) => {
    if (event.type !== 'agent_end') return;
    if (!isMemoryAvailable()) return;

    const instanceId = event.instanceId;
    if (!instanceId) return;

    const agentName = getAgentName(instanceId);
    if (!agentName) return;

    const memConfig = getMemoryConfig();
    const scope = getMemoryScope(agentName);
    const scopeKey = scope === 'agent' ? agentName : `${agentName}:${instanceId}`;

    const messages = (event as any).messages;
    if (!Array.isArray(messages) || messages.length === 0) return;

    const parts: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'signal' && msg.type === 'dispatch_input') {
        try {
          const payload = JSON.parse(msg.content);
          const text = payload?.text;
          if (text) parts.push(`User: ${text}`);
        } catch {
          // skip unparseable dispatch inputs
        }
      } else if (msg.role === 'assistant') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
            : null;
        if (text) parts.push(`Assistant: ${text}`);
      }
    }

    if (parts.length === 0) return;

    log.debug('Saving conversation memory', { agent: agentName, scopeKey, messageCount: parts.length });
    saveMemory(memConfig, scopeKey, parts.join('\n')).catch((err) => {
      log.warn('Failed to save memory', { scopeKey, error: String(err) });
    });
  });
}
