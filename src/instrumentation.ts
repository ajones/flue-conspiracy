import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { createOpenTelemetryObserver } from '@flue/opentelemetry';
import { observe } from '@flue/runtime';
import { getAgentName } from './agent-names.ts';

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
      const serviceName = typeof provider === 'string'
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
      if (!serviceName) return span;

      let resource = this.resourceCache.get(serviceName);
      if (!resource) {
        resource = span.resource.merge(
          resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
        );
        this.resourceCache.set(serviceName, resource);
      }

      return Object.create(span, {
        resource: { value: resource, enumerable: true },
      }) as ReadableSpan;
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
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'flue-conspiracy' }),
    spanProcessors: [new BatchSpanProcessor(new AgentServiceNameExporter(otlp))],
  });

  sdk.start();

  observe(createOpenTelemetryObserver({
    exportContent: (event) => event,
  }));

  process.on('SIGTERM', () => sdk.shutdown());
  process.on('SIGINT', () => sdk.shutdown());
}
