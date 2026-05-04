export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (process.env.HDX_EXPORTER_ENABLED === 'false') {
    console.log('[hdx-otel] disabled via HDX_EXPORTER_ENABLED=false');
    return;
  }

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.log('[hdx-otel] no OTLP endpoint set; tracing disabled');
    return;
  }

  const serviceName =
    process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'hdx-oss-dev-app';

  console.log(
    `[hdx-otel] starting SDK (service=${serviceName}, endpoint=${endpoint})`,
  );

  // Wire OTEL's internal diag logger so export failures and batching
  // info appear in pod logs when OTEL_LOG_LEVEL=debug is set.
  const { diag, DiagConsoleLogger, DiagLogLevel } = await import(
    '@opentelemetry/api'
  );
  const level = (process.env.OTEL_LOG_LEVEL ?? 'info').toLowerCase();
  const logLevel =
    level === 'debug' || level === 'verbose'
      ? DiagLogLevel.DEBUG
      : level === 'warn'
        ? DiagLogLevel.WARN
        : level === 'error'
          ? DiagLogLevel.ERROR
          : DiagLogLevel.INFO;
  diag.setLogger(new DiagConsoleLogger(), logLevel);

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import(
    '@opentelemetry/auto-instrumentations-node'
  );
  const { OTLPTraceExporter } = await import(
    '@opentelemetry/exporter-trace-otlp-http'
  );

  try {
    const sdk = new NodeSDK({
      serviceName,
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    console.log('[hdx-otel] SDK started');
  } catch (err) {
    console.error('[hdx-otel] SDK start failed', err);
  }
}
