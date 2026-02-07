/**
 * ClickHouse Query Abstraction Layer
 *
 * Centralizes all ClickHouse query logic with:
 * - Type-safe query builder with in-memory caching
 * - Domain-specific query modules (traces, evals, metrics)
 * - Centralized connection management
 * - Consistent error handling and timing metadata
 *
 * Usage:
 *   import { traces, evals, metrics } from '@/lib/db/clickhouse'
 *
 *   const { data, queryTimeMs } = await traces.listTraces({ projectId: '...' })
 *   const { data: summary } = await evals.getDashboard({ ... })
 *   const { data: tools } = await metrics.getToolMetricsData({ ... })
 */

// Connection management
export { closeClickHouseClient, healthCheck } from '../../clickhouse'
// Re-export types for convenience
export type {
  DailyRunSummary,
  DashboardSummary,
  DurationStats,
  PromptRecord,
  ScoreRecord,
  ScorerStats,
  ScoreTrendPoint,
  SpanDetails,
  SpanRecord,
  SpanSummary,
  ToolMetric,
  ToolMetricsSummary,
  TraceRecord,
} from './query-builder'
// Query builder utilities
export {
  addDateRangeConditions,
  type BaseQueryParams,
  buildWhereClause,
  clearCache,
  executeQuery,
  getCacheMetrics,
  getClickHouseClient,
  invalidateCache,
  invalidateOnWrite,
  type PaginationParams,
  type QueryResult,
} from './query-builder'

import * as compare from './queries/compare'
import * as evals from './queries/evals'
import * as metrics from './queries/metrics'
import * as prompts from './queries/prompts'
// Domain-specific query modules
import * as traces from './queries/traces'

export { traces, evals, metrics, compare, prompts }
