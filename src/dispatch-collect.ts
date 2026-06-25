import { dispatch, observe } from '@flue/runtime';
import type { NamedAgentDispatchRequest } from '@flue/runtime';
import type { Context } from '@opentelemetry/api';
import { parseReplyAttachments } from './telegram-attachments.ts';
import { trackDispatchContext } from './instrumentation.ts';
import { createLogger } from './log.ts';

const log = createLogger('dispatch');

const DEFAULT_TIMEOUT_MS = 300_000;

export interface CollectedReply {
  dispatchId: string | undefined;
  text: string;
  imagePaths: string[];
}

export interface DispatchAndCollectOptions {
  parentContext?: Context;
  timeoutMs?: number;
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

    dispatch(request).then((receipt) => {
      log.debug('Dispatch admitted', { agent, instanceId, dispatchId: receipt.dispatchId });
      if (opts.parentContext && receipt.dispatchId) {
        trackDispatchContext(receipt.dispatchId, opts.parentContext);
      }
      unsub = observe((event) => {
        if (event.dispatchId !== receipt.dispatchId) return;
        if (instanceId !== undefined && (event as any).instanceId !== instanceId) return;

        if (event.type === 'operation' && (event as any).isError) {
          clearTimeout(timeout);
          unsub?.();
          const errObj = (event as any).error;
          const msg = typeof errObj?.message === 'string'
            ? errObj.message
            : typeof errObj === 'string'
              ? errObj
              : 'Agent operation failed';
          log.error('Agent operation failed', { agent, instanceId, dispatchId: receipt.dispatchId, error: msg });
          reject(new Error(msg));
          return;
        }

        if (event.type !== 'agent_end') return;

        clearTimeout(timeout);
        unsub?.();
        const rawText = event.messages
          .filter((m: any) => m.role === 'assistant')
          .flatMap((m: any) => Array.isArray(m.content) ? m.content : [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .filter(Boolean)
          .join('\n');
        const { text, imagePaths } = parseReplyAttachments(rawText);
        log.info('Dispatch complete', {
          agent,
          instanceId,
          dispatchId: receipt.dispatchId,
          textLength: text.length,
          imageCount: imagePaths.length,
        });
        resolve({ dispatchId: receipt.dispatchId, text, imagePaths });
      });
    }).catch((err) => {
      clearTimeout(timeout);
      log.error('Dispatch failed', { agent, instanceId, error: err instanceof Error ? err.message : String(err) });
      reject(err);
    });
  });
}
