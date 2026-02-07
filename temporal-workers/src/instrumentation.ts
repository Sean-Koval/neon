/**
 * Temporal Worker OpenTelemetry Instrumentation
 *
 * Sets up distributed tracing for Temporal workflow executions
 * and activities, exporting spans to the OTel Collector.
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

let sdk: NodeSDK | null = null

/**
 * Initialize OpenTelemetry instrumentation for the Temporal worker.
 * Call this before creating the Temporal Worker instance.
 */
export function initInstrumentation(): void {
  if (sdk) return

  const collectorUrl =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318'

  const traceExporter = new OTLPTraceExporter({
    url: `${collectorUrl}/v1/traces`,
  })

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'neon-temporal-worker',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
      'temporal.namespace': process.env.TEMPORAL_NAMESPACE || 'default',
      'temporal.task_queue': process.env.TEMPORAL_TASK_QUEUE || 'agent-workers',
    }),
    spanProcessor: new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  })

  sdk.start()
}

/**
 * Gracefully shutdown the OpenTelemetry SDK.
 * Call this during worker shutdown to flush pending spans.
 */
export async function shutdownInstrumentation(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
  }
}
