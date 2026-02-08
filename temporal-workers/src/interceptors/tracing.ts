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
 */

import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
} from '@temporalio/interceptors-opentelemetry'
import { trace } from '@opentelemetry/api'

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
 * Get the activity interceptors for Temporal Worker.create().
 *
 * Creates spans for each activity execution with Temporal attributes.
 */
export function getActivityInterceptors() {
  return [
    {
      inbound: new OpenTelemetryActivityInboundInterceptor(),
    },
  ]
}

/**
 * Get the sink for exporting workflow spans.
 *
 * The workflow exporter collects spans created inside the workflow
 * sandbox and exports them via the worker's OTel tracer provider.
 */
export function getWorkflowSinks() {
  const tracer = trace.getTracerProvider()
  return {
    ...makeWorkflowExporter(tracer),
  }
}
