import { dispatch, observe } from '@flue/runtime';
import type { NamedAgentDispatchRequest } from '@flue/runtime';
import type { Context } from '@opentelemetry/api';
import { trackDispatchContext } from './instrumentation.ts';

const DEFAULT_TIMEOUT_MS = 180_000;

export interface CollectedReply {
  dispatchId: string | undefined;
  text: string;
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

  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    const timeout = setTimeout(() => {
      unsub?.();
      reject(new Error('dispatchAndCollect timeout'));
    }, timeoutMs);

    dispatch(request).then((receipt) => {
      if (opts.parentContext && receipt.dispatchId) {
        trackDispatchContext(receipt.dispatchId, opts.parentContext);
      }
      unsub = observe((event) => {
        if (event.dispatchId !== receipt.dispatchId || event.type !== 'agent_end') return;
        clearTimeout(timeout);
        unsub?.();
        const text = event.messages
          .filter((m: any) => m.role === 'assistant')
          .flatMap((m: any) => Array.isArray(m.content) ? m.content : [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .filter(Boolean)
          .join('\n');
        resolve({ dispatchId: receipt.dispatchId, text });
      });
    }).catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
