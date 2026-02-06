/**
 * Trace Queries
 *
 * Centralized query module for trace and span operations.
 * Wraps the raw ClickHouse functions with caching and consistent interfaces.
 */

import {
  getScoresForTrace,
  getSpanDetails,
  getTraceWithSpanSummaries,
  getTraceWithSpans,
  queryTraces,
  type ScoreRecord,
  type SpanDetails as SpanDetailsType,
  type SpanRecord,
  type SpanSummary,
  type TraceRecord,
} from '../../../clickhouse'
import {
  type BaseQueryParams,
  executeQuery,
  type PaginationParams,
  type QueryResult,
} from '../query-builder'

// =============================================================================
// Trace Queries
// =============================================================================

/** List traces with filtering and pagination */
export async function listTraces(
  params: BaseQueryParams &
    PaginationParams & {
      status?: 'ok' | 'error'
    },
): Promise<QueryResult<TraceRecord[]>> {
  return executeQuery(
    'traces.list',
    params,
    () =>
      queryTraces({
        projectId: params.projectId,
        status: params.status,
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      }),
    15_000, // 15s cache - traces change frequently
  )
}

/** Get a single trace with all its spans */
export async function getTrace(
  projectId: string,
  traceId: string,
): Promise<QueryResult<{ trace: TraceRecord; spans: SpanRecord[] } | null>> {
  return executeQuery(
    'traces.get',
    { projectId, traceId },
    () => getTraceWithSpans(projectId, traceId),
    60_000, // 1 min cache - individual traces are immutable
  )
}

/** Get a trace with lightweight span summaries (no large payloads) */
export async function getTraceSummary(
  projectId: string,
  traceId: string,
): Promise<QueryResult<{ trace: TraceRecord; spans: SpanSummary[] } | null>> {
  return executeQuery(
    'traces.summary',
    { projectId, traceId },
    () => getTraceWithSpanSummaries(projectId, traceId),
    60_000,
  )
}

// =============================================================================
// Span Queries
// =============================================================================

/** Get full details for a single span (lazy-loaded payloads) */
export async function getSpanDetail(
  projectId: string,
  spanId: string,
): Promise<QueryResult<SpanDetailsType | null>> {
  return executeQuery(
    'spans.detail',
    { projectId, spanId },
    () => getSpanDetails(projectId, spanId),
    120_000, // 2 min cache - span details are immutable
  )
}

// =============================================================================
// Score Queries (trace-level)
// =============================================================================

/** Get scores for a specific trace */
export async function getTraceScores(
  projectId: string,
  traceId: string,
): Promise<QueryResult<ScoreRecord[]>> {
  return executeQuery(
    'traces.scores',
    { projectId, traceId },
    () => getScoresForTrace(projectId, traceId),
    30_000,
  )
}
