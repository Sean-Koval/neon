/**
 * React Query hooks exports.
 */

// Compare hooks
export { useCompare } from './use-compare'

// Dashboard hooks
export { useDashboard } from './use-dashboard'
// Lazy span loading hooks
export {
  isLargePayload,
  type SpanDetails,
  TRUNCATION_THRESHOLD,
  truncatePayload,
  useIsSpanCached,
  useLazySpan,
  usePrefetchSpanDetails,
} from './use-lazy-span'
// Real-time hooks (WebSocket + polling)
export { useRealtime, useRealtimeRun } from './use-realtime'
// Run hooks
export {
  useCancelRun,
  useRun,
  useRunResults,
  useRuns,
  useTriggerRun,
} from './use-runs'
// Score trends hooks
export {
  downloadData,
  exportToCSV,
  exportToJSON,
  type RegressionPoint,
  type ScoreByScorer,
  type ScoreBySuite,
  type ScoreStatistics,
  type ScoreTrendDataPoint,
  type TimeRange,
  type UseScoreTrendsOptions,
  type UseScoreTrendsResult,
  useScoreTrends,
} from './use-scores'
// Suite hooks
export {
  useCreateSuite,
  useDeleteSuite,
  useSuite,
  useSuites,
  useUpdateSuite,
} from './use-suites'
// Trace hooks
export {
  type Span,
  type TraceFilters,
  type TraceSummary,
  type TraceWithSpans,
  useTrace,
  useTraceCount,
  useTraceSearch,
  useTraces,
} from './use-traces'

// Workflow run hooks (Temporal-based)
export {
  canControlWorkflow,
  getProgressPercentage,
  getStatusText,
  useCancelWorkflowRun,
  useControlWorkflowRun,
  usePauseWorkflowRun,
  useResumeWorkflowRun,
  useStartWorkflowRun,
  useWorkflowRun,
  useWorkflowRunStatus,
  useWorkflowRuns,
  workflowQueryKeys,
} from './use-workflow-runs'
