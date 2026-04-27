export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.HDX_EXPORTER_ENABLED === 'false') return;

  // Require at least one of: a base endpoint or a traces-specific endpoint.
  // Without either, there is nowhere to send spans.
  const hasEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!hasEndpoint) return;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import(
    '@opentelemetry/auto-instrumentations-node'
  );
  const { OTLPTraceExporter } = await import(
    '@opentelemetry/exporter-trace-otlp-http'
  );

  // OTLPTraceExporter with no url reads OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  // then OTEL_EXPORTER_OTLP_ENDPOINT from the environment automatically.
  const sdk = new NodeSDK({
    serviceName:
      process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'hdx-oss-dev-app',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
