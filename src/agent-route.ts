import { dispatch, type AgentRouteHandler } from '@flue/runtime';
import type { EventStreamStore } from '@flue/runtime/adapter';
import { context as otelContext } from '@opentelemetry/api';
import adapter from './db.ts';
import { gatherContext, spreadContext } from './context.ts';
import { trackAgentInstance } from './agent-names.ts';
import { trackDispatchContext } from './instrumentation.ts';

function agentStreamPath(agentName: string, instanceId: string): string {
  return `agents/${agentName}/${instanceId}`;
}

function invocationStreamUrl(request: Request): string {
  const url = new URL(request.url);
  url.search = '';
  return url.toString();
}

function admissionResponse(body: object, streamUrl: string, offset: string): Response {
  return new Response(JSON.stringify(body), {
    status: 202,
    headers: {
      'content-type': 'application/json',
      Location: streamUrl,
      'Stream-Next-Offset': offset,
    },
  });
}

let eventStreamStore: EventStreamStore | null = null;

async function getEventStreamStore(): Promise<EventStreamStore> {
  if (!eventStreamStore) {
    const stores = await adapter.connect();
    eventStreamStore = stores.eventStreamStore;
  }
  return eventStreamStore;
}

async function getStreamOffset(agentName: string, instanceId: string): Promise<string> {
  const store = await getEventStreamStore();
  const meta = await store.getStreamMeta(agentStreamPath(agentName, instanceId));
  return meta?.nextOffset ?? '-1';
}

export function createContextGatheringRoute(agentName: string): AgentRouteHandler {
  return async (c, next) => {
    if (c.req.method !== 'POST') return next();

    let body: { message?: unknown; images?: unknown[] };
    try {
      body = await c.req.json();
    } catch {
      return next();
    }

    if (typeof body.message !== 'string') return next();

    const id = c.req.param('id') ?? '';
    trackAgentInstance(id, agentName);

    const ctx = await gatherContext({
      text: body.message,
      agent: agentName,
      conversationKey: id,
    });

    const receipt = await dispatch({
      agent: agentName,
      id,
      input: {
        type: 'tui.message',
        text: body.message,
        ...(body.images ? { images: body.images } : {}),
        ...spreadContext(ctx),
      },
    });

    trackDispatchContext(receipt.dispatchId, otelContext.active());

    const streamUrl = invocationStreamUrl(c.req.raw);
    const offset = await getStreamOffset(agentName, id);

    return admissionResponse({ streamUrl, offset }, streamUrl, offset);
  };
}
