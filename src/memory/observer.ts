import { observe } from '@flue/runtime';
import { getMemoryConfig, getMemoryScope } from '../config.js';
import { isMemoryAvailable, saveMemory } from './index.js';
import { getAgentName } from '../agent-names.js';
import { createLogger } from '../log.js';

const log = createLogger('memory');

const MAX_MEMORIES_PER_SAVE = 5;

const THINKING_PATTERNS = [
  /<thinking[\s>][\s\S]*?<\/thinking>/gi,
  /<thinkingSignature[\s>][\s\S]*?<\/thinkingSignature>/gi,
  /thinkingSignature\s*[:=]\s*"[^"]*"/gi,
  /<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi,
];

function stripThinkingContent(text: string): string {
  let cleaned = text;
  for (const pattern of THINKING_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function extractAssistantText(msg: any): string | null {
  if (typeof msg.content === 'string') return msg.content;
  if (!Array.isArray(msg.content)) return null;
  return msg.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join(' ') || null;
}

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
        const raw = extractAssistantText(msg);
        if (!raw) continue;
        const text = stripThinkingContent(raw);
        if (text) parts.push(`Assistant: ${text}`);
      }
    }

    const trimmed = parts.slice(-MAX_MEMORIES_PER_SAVE);
    if (trimmed.length === 0) return;

    log.debug('Saving conversation memory', { agent: agentName, scopeKey, messageCount: trimmed.length });
    saveMemory(memConfig, scopeKey, trimmed.join('\n')).catch((err) => {
      log.warn('Failed to save memory', { scopeKey, error: String(err) });
    });
  });
}
