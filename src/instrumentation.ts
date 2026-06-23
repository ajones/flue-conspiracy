import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { type Context, context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { createOpenTelemetryObserver } from '@flue/opentelemetry';
import { observe } from '@flue/runtime';
import { getAgentName } from './agent-names.ts';

const dispatchContexts = new Map<string, Context>();

export function trackDispatchContext(dispatchId: string, ctx: Context): void {
  dispatchContexts.set(dispatchId, ctx);
}

export function untrackDispatchContext(dispatchId: string): void {
  dispatchContexts.delete(dispatchId);
}

const ATTR_MAX_LENGTH = 16_000;
const LARGE_ATTRS = new Set([
  'flue.turn.input', 'flue.turn.output',
  'flue.task.prompt', 'flue.task.result',
  'flue.tool.arguments', 'flue.tool.result',
  'flue.operation.result', 'flue.workflow.payload', 'flue.workflow.result',
]);

function truncateAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (LARGE_ATTRS.has(k) && typeof v === 'string' && v.length > ATTR_MAX_LENGTH) {
      out[k] = v.slice(0, ATTR_MAX_LENGTH) + `... [truncated ${v.length - ATTR_MAX_LENGTH} chars]`;
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return changed ? out : attrs;
}

class AgentServiceNameExporter implements SpanExporter {
  private resourceCache = new Map<string, Resource>();
  private taskAgentMap = new Map<string, string>();

  constructor(private inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      const taskAgent = span.attributes['flue.task.agent'];
      const taskId = span.attributes['flue.task.id'];
      if (typeof taskAgent === 'string' && typeof taskId === 'string') {
        this.taskAgentMap.set(taskId, taskAgent);
      }
    }

    const rewritten = spans.map((span) => {
      const taskAgent = span.attributes['flue.task.agent'];
      const taskId = span.attributes['flue.task.id'];
      const instanceId = span.attributes['flue.instance.id'];
      const provider = span.attributes['gen_ai.provider.name'];
      const toolName = span.attributes['flue.tool.name'];
      const explicit = span.attributes['raven.service.name'];
      const serviceName = typeof explicit === 'string'
        ? explicit
        : typeof provider === 'string'
          ? provider
          : typeof toolName === 'string'
            ? 'tools'
          : typeof taskAgent === 'string'
            ? taskAgent
            : typeof taskId === 'string'
              ? this.taskAgentMap.get(taskId)
              : typeof instanceId === 'string'
                ? getAgentName(instanceId)
                : undefined;

      const truncated = truncateAttributes(span.attributes as Record<string, unknown>);
      const overrides: Record<string, PropertyDescriptor> = {};

      if (truncated !== span.attributes) {
        overrides.attributes = { value: truncated, enumerable: true };
      }

      if (serviceName) {
        let resource = this.resourceCache.get(serviceName);
        if (!resource) {
          resource = span.resource.merge(
            resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
          );
          this.resourceCache.set(serviceName, resource);
        }
        overrides.resource = { value: resource, enumerable: true };
      }

      return Object.keys(overrides).length > 0
        ? Object.create(span, overrides) as ReadableSpan
        : span;
    });

    this.inner.export(rewritten, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

if (process.env.OTEL_DISABLED !== 'true') {
  const otlp = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'raven' }),
    spanProcessors: [new BatchSpanProcessor(new AgentServiceNameExporter(otlp))],
  });

  sdk.start();

  observe(createOpenTelemetryObserver({
    exportContent: (event) => event,
    resolveRootContext: (event: { dispatchId?: string }) => {
      if (event.dispatchId) {
        const stored = dispatchContexts.get(event.dispatchId);
        if (stored) return stored;
      }
      return undefined;
    },
  }));

  observe((event: { type: string; dispatchId?: string }) => {
    if (event.type === 'operation' && event.dispatchId) {
      dispatchContexts.delete(event.dispatchId);
    }
  });

  process.on('SIGTERM', () => sdk.shutdown());
  process.on('SIGINT', () => sdk.shutdown());
}
