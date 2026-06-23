import { dispatch, observe } from '@flue/runtime';
import type { NamedAgentDispatchRequest } from '@flue/runtime';
import type { Context } from '@opentelemetry/api';
import { trackDispatchContext } from './instrumentation.ts';

const TIMEOUT_MS = 60_000;

export interface CollectedReply {
  dispatchId: string | undefined;
  text: string;
}

export function dispatchAndCollect(
  request: NamedAgentDispatchRequest,
  parentContext?: Context,
): Promise<CollectedReply> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    const timeout = setTimeout(() => {
      unsub?.();
      reject(new Error('dispatchAndCollect timeout'));
    }, TIMEOUT_MS);

    dispatch(request).then((receipt) => {
      if (parentContext && receipt.dispatchId) {
        trackDispatchContext(receipt.dispatchId, parentContext);
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
