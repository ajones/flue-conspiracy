import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { createOpenTelemetryObserver } from '@flue/opentelemetry';
import { observe } from '@flue/runtime';

if (process.env.OTEL_DISABLED !== 'true') {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'flue-conspiracy' }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    }),
  });

  sdk.start();

  observe(createOpenTelemetryObserver({
    exportContent: (event) => event,
  }));

  process.on('SIGTERM', () => sdk.shutdown());
  process.on('SIGINT', () => sdk.shutdown());
}
