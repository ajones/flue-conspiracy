import type { Span } from '@opentelemetry/api';
import { isClearCommand, isCompactCommand } from './session-clear.ts';
import { createLogger } from './log.ts';

const log = createLogger('session-commands');

export type SessionCommand = 'clear' | 'compact';

export type SessionCommandResult = {
  command: SessionCommand;
  message: string;
  compactResult?: import('./session-compact.ts').CompactResult;
};

export type SessionCommandHandle =
  | { handled: false }
  | ({ handled: true } & SessionCommandResult);

export function isSessionCommand(text: string): boolean {
  return isClearCommand(text) || isCompactCommand(text);
}

export async function tryHandleSessionCommand(
  text: string,
  agent: string,
  instanceId: string,
): Promise<SessionCommandHandle> {
  if (isClearCommand(text)) {
    const { clearAgentSession } = await import('./session-reset.ts');
    await clearAgentSession(instanceId);
    log.info('Session cleared', { agent, instanceId });
    return { handled: true, command: 'clear', message: 'Conversation cleared.' };
  }

  if (isCompactCommand(text)) {
    const { compactAgentSession, compactSessionMessage } = await import('./session-compact.ts');
    const compactResult = await compactAgentSession(agent, instanceId);
    const message = compactSessionMessage(compactResult);
    log.info('Session compacted', { agent, instanceId, result: compactResult });
    return { handled: true, command: 'compact', message, compactResult };
  }

  return { handled: false };
}

export function sessionCommandJsonBody(result: SessionCommandResult): Record<string, unknown> {
  if (result.command === 'clear') {
    return { cleared: true, message: result.message };
  }
  return {
    compacted: true,
    result: result.compactResult,
    message: result.message,
  };
}

export function recordSessionCommandSpan(span: Span, result: SessionCommandResult): void {
  if (result.command === 'clear') {
    span.addEvent('session.cleared');
    return;
  }
  span.addEvent('session.compacted', { 'raven.compact.result': result.compactResult ?? 'noop' });
}
