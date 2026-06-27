import { dispatch, observe } from '@flue/runtime';
import type { NamedAgentDispatchRequest } from '@flue/runtime';
import type { Context } from '@opentelemetry/api';
import { parseReplyAttachments } from './telegram-attachments.ts';
import { trackDispatchContext } from './instrumentation.ts';
import { createLogger } from './log.ts';
import { extractRmPaths, formatFileAudit } from './file-audit.ts';

const log = createLogger('dispatch');

const DEFAULT_TIMEOUT_MS = 300_000;

function matchesDispatch(
  event: { dispatchId?: string; instanceId?: string },
  dispatchId: string,
  instanceId: string | undefined,
): boolean {
  if (event.dispatchId !== dispatchId) return false;
  if (instanceId !== undefined && event.instanceId !== instanceId) return false;
  return true;
}

function extractAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  return messages
    .filter((m: any) => m.role === 'assistant')
    .flatMap((m: any) => Array.isArray(m.content) ? m.content : [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .filter(Boolean)
    .join('\n');
}

function extractOperationText(result: unknown): string {
  if (result && typeof result === 'object' && 'text' in result) {
    const text = (result as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return '';
}

export interface CollectedReply {
  dispatchId: string | undefined;
  text: string;
  imagePaths: string[];
}

export interface DispatchAndCollectOptions {
  parentContext?: Context;
  timeoutMs?: number;
  onRootPromptStart?: () => void;
}

export function dispatchAndCollect(
  request: NamedAgentDispatchRequest,
  parentContextOrOptions?: Context | DispatchAndCollectOptions,
): Promise<CollectedReply> {
  const isContext = parentContextOrOptions && typeof (parentContextOrOptions as any).getValue === 'function';
  const opts: DispatchAndCollectOptions = isContext
    ? { parentContext: parentContextOrOptions as Context }
    : (parentContextOrOptions as DispatchAndCollectOptions) ?? {};
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const instanceId = 'id' in request ? request.id : undefined;

  const agent = request.agent;
  log.info('Dispatching', { agent, instanceId, timeoutMs });

  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    const timeout = setTimeout(() => {
      unsub?.();
      const msg = `dispatchAndCollect timeout after ${timeoutMs}ms`;
      log.error(msg, { agent, instanceId });
      reject(new Error(msg));
    }, timeoutMs);

    // last-write-wins: M for write/edit, D for rm — key is path, value is latest label
    const fileOps = new Map<string, 'M' | 'D'>();

    dispatch(request).then((receipt) => {
      log.debug('Dispatch admitted', { agent, instanceId, dispatchId: receipt.dispatchId });
      if (opts.parentContext && receipt.dispatchId) {
        trackDispatchContext(receipt.dispatchId, opts.parentContext);
      }
      let rootPromptOperationId: string | undefined;
      let latestAgentEndText = '';

      const finish = (rawText: string) => {
        clearTimeout(timeout);
        unsub?.();
        const { text: replyText, imagePaths } = parseReplyAttachments(rawText);
        const diff = formatFileAudit(fileOps);
        const text = diff ? `${replyText}\n\n${diff}` : replyText;
        log.info('Dispatch complete', {
          agent,
          instanceId,
          dispatchId: receipt.dispatchId,
          textLength: text.length,
          imageCount: imagePaths.length,
        });
        resolve({ dispatchId: receipt.dispatchId, text, imagePaths });
      };

      unsub = observe((event) => {
        if (!matchesDispatch(event, receipt.dispatchId, instanceId)) return;

        if (event.type === 'tool_start') {
          const { toolName, args } = event as { toolName: string; args?: any };
          if (toolName === 'write' || toolName === 'edit') {
            const path = typeof args?.path === 'string' ? args.path : undefined;
            if (path) fileOps.set(path, 'M');
          } else if (toolName === 'bash') {
            const command = typeof args?.command === 'string' ? args.command : undefined;
            if (command) {
              for (const path of extractRmPaths(command)) fileOps.set(path, 'D');
            }
          }
          return;
        }

        if (event.type === 'operation_start' && event.operationKind === 'prompt' && !rootPromptOperationId) {
          rootPromptOperationId = event.operationId;
          opts.onRootPromptStart?.();
          return;
        }

        if (event.type === 'operation' && event.operationKind === 'prompt') {
          if (event.operationId !== rootPromptOperationId) return;

          if (event.isError) {
            clearTimeout(timeout);
            unsub?.();
            const errObj = event.error;
            const msg = typeof errObj === 'object' && errObj && 'message' in errObj && typeof errObj.message === 'string'
              ? errObj.message
              : typeof errObj === 'string'
                ? errObj
                : 'Agent operation failed';
            log.error('Agent operation failed', { agent, instanceId, dispatchId: receipt.dispatchId, error: msg });
            reject(new Error(msg));
            return;
          }

          const opText = extractOperationText(event.result);
          finish(opText || latestAgentEndText);
          return;
        }

        if (event.type === 'agent_end') {
          latestAgentEndText = extractAssistantText(event.messages);
        }
      });
    }).catch((err) => {
      clearTimeout(timeout);
      log.error('Dispatch failed', { agent, instanceId, error: err instanceof Error ? err.message : String(err) });
      reject(err);
    });
  });
}
