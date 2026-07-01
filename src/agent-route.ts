import { dispatch, type AgentRouteHandler } from '@flue/runtime';
import type { EventStreamStore } from '@flue/runtime/adapter';
import { SpanStatusCode, context as otelContext, trace } from '@opentelemetry/api';
import adapter from './db.ts';
import { gatherContext, spreadContext } from './context.ts';
import { trackAgentInstance } from './agent-names.ts';
import { trackDispatchContext, trackTuiDispatch } from './instrumentation.ts';
import { recordSessionCommandSpan, sessionCommandJsonBody, tryHandleSessionCommand } from './session-commands.ts';
import { createLogger } from './log.ts';

const tracer = trace.getTracer('raven');

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
  const tuiLog = createLogger(`tui:${agentName}`);

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

    return tracer.startActiveSpan('tui.message', {
      attributes: {
        'raven.agent': agentName,
        'raven.conversation': id,
        'raven.tui.text_length': body.message.length,
      },
    }, async (span) => {
      try {
        tuiLog.info('Message received', { instanceId: id, text: body.message.slice(0, 80) });
        span.addEvent('message.received', {
          'raven.tui.text_length': body.message.length,
        });
        if (body.message) {
          span.setAttribute('raven.tui.message', body.message.slice(0, 4000));
        }

        trackAgentInstance(id, agentName);

        const cmd = await tryHandleSessionCommand(body.message, agentName, id);
        if (cmd.handled) {
          recordSessionCommandSpan(span, cmd);
          span.setStatus({ code: SpanStatusCode.OK });
          return new Response(JSON.stringify(sessionCommandJsonBody(cmd)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        const ctx = await gatherContext({
          text: body.message,
          agent: agentName,
          conversationKey: id,
        });

        tuiLog.debug('Dispatching to agent', { agent: agentName, instanceId: id });
        span.addEvent('dispatching', {
          'raven.agent': agentName,
          'raven.conversation': id,
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

        if (receipt.dispatchId) {
          span.setAttribute('raven.tui.dispatch_id', receipt.dispatchId);
          trackDispatchContext(receipt.dispatchId, otelContext.active());
          trackTuiDispatch(receipt.dispatchId, otelContext.active());
        }

        const streamUrl = invocationStreamUrl(c.req.raw);
        const offset = await getStreamOffset(agentName, id);

        span.setStatus({ code: SpanStatusCode.OK });
        return admissionResponse({ streamUrl, offset }, streamUrl, offset);
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
