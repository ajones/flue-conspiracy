import { observe } from '@flue/runtime';
import { getAgentName } from './agent-names.ts';
import { createLogger } from './log.ts';

const log = createLogger('tools');
const MAX_TEXT = 500;

interface ToolResultShape {
  content?: Array<{ type?: string; text?: string }>;
  details?: {
    command?: string;
    exitCode?: number;
  };
}

function toolResultText(result: unknown): string | undefined {
  if (result == null) return undefined;
  if (typeof result === 'string') return result.slice(0, MAX_TEXT);
  if (typeof result !== 'object') return String(result).slice(0, MAX_TEXT);

  const shaped = result as ToolResultShape;
  const fromContent = shaped.content
    ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!)
    .join('\n')
    .trim();
  if (fromContent) return fromContent.slice(0, MAX_TEXT);

  try {
    return JSON.stringify(result).slice(0, MAX_TEXT);
  } catch {
    return undefined;
  }
}

function isToolFailure(
  toolName: string,
  isError: boolean,
  result: unknown,
): boolean {
  if (isError) return true;

  if (toolName !== 'bash') return false;

  const shaped = result as ToolResultShape | undefined;
  const exitCode = shaped?.details?.exitCode;
  if (typeof exitCode === 'number' && exitCode !== 0) return true;

  const text = toolResultText(result);
  return !!text && /\bcommand not found\b/i.test(text);
}

export function registerToolObserver(): void {
  observe((event) => {
    if (event.type !== 'tool') return;
    if (!isToolFailure(event.toolName, event.isError, event.result)) return;

    const shaped = event.result as ToolResultShape | undefined;
    const instanceId = event.instanceId;

    log.error('Tool failed', {
      tool: event.toolName,
      agent: instanceId ? getAgentName(instanceId) : undefined,
      instanceId,
      durationMs: event.durationMs,
      isError: event.isError,
      command: shaped?.details?.command,
      exitCode: shaped?.details?.exitCode,
      text: toolResultText(event.result),
    });
  });
}
