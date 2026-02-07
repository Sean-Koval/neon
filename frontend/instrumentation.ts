/**
 * Next.js Instrumentation Hook
 *
 * Auto-instruments the Next.js application with OpenTelemetry for
 * distributed tracing. Traces HTTP requests, ClickHouse queries,
 * and tRPC calls, exporting to the OTel Collector.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node')
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    )
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    )
    const { resourceFromAttributes } = await import(
      '@opentelemetry/resources'
    )
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    )
    const { BatchSpanProcessor } = await import(
      '@opentelemetry/sdk-trace-base'
    )

    const collectorUrl =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318'

    const traceExporter = new OTLPTraceExporter({
      url: `${collectorUrl}/v1/traces`,
    })

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'neon-frontend',
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
      }),
      spanProcessor: new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (request) => {
              const url = request.url || ''
              return (
                url.startsWith('/api/health') ||
                url.startsWith('/_next/static')
              )
            },
          },
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    })

    sdk.start()

    process.on('SIGTERM', () => {
      sdk.shutdown().catch(console.error)
    })
  }
}
