/**
 * Temporal OTel Tracing Interceptors
 *
 * Provides OpenTelemetry interceptors for Temporal workflows and activities.
 * These interceptors automatically create spans for workflow executions,
 * activity invocations, and signal/query handling.
 *
 * Uses @temporalio/interceptors-opentelemetry which:
 * - Propagates trace context across workflow/activity boundaries
 * - Creates spans for workflow start, complete, fail
 * - Creates spans for activity start, complete, fail
 * - Adds Temporal-specific attributes (workflowId, runId, activityType, etc.)
 *
 * Note: The interceptors package uses OTel v1.x internally while the worker
 * uses OTel v2.x. We use type casts at the boundary to bridge the versions.
 */

import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
} from '@temporalio/interceptors-opentelemetry'
import type { ActivityInterceptors, InjectedSinks } from '@temporalio/worker'
import type { Context as ActivityContext } from '@temporalio/activity'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

/**
 * Get the workflow interceptor modules for Temporal Worker.create().
 *
 * The workflow exporter sends workflow spans from the sandbox
 * to the worker's OTel exporter.
 */
export function getWorkflowInterceptorModules(): string[] {
  // This returns the path to the OTel workflow interceptor module
  // that will be loaded inside the Temporal workflow sandbox
  return [require.resolve('@temporalio/interceptors-opentelemetry/workflow')]
}

/**
 * Get the activity interceptor factory for Temporal Worker.create().
 *
 * Creates spans for each activity execution with Temporal attributes.
 * The factory receives the activity context and returns interceptors.
 */
export function getActivityInterceptorFactory(): (ctx: ActivityContext) => ActivityInterceptors {
  return (ctx: ActivityContext): ActivityInterceptors => ({
    inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
  })
}

/**
 * Get the sink for exporting workflow spans.
 *
 * The workflow exporter collects spans created inside the workflow
 * sandbox and exports them via a dedicated OTLP exporter.
 *
 * Note: Type cast needed because @temporalio/interceptors-opentelemetry
 * uses OTel v1.x types while the worker has OTel v2.x installed.
 * The runtime behavior is identical.
 */
export function getWorkflowSinks(): InjectedSinks<Record<string, Record<string, () => void>>> {
  const collectorUrl =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318'

  const exporter = new OTLPTraceExporter({
    url: `${collectorUrl}/v1/traces`,
  })

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'neon-temporal-worker',
    [ATTR_SERVICE_VERSION]: '0.1.0',
  })

  // Cast needed at OTel v1/v2 boundary - runtime compatible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return makeWorkflowExporter(exporter as any, resource as any) as any
}
