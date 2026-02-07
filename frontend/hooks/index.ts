/**
 * React Query hooks exports.
 */

// Compare hooks
export { useCompare } from './use-compare'
// Component correlation hooks
export {
  type ComponentHealth,
  type ComponentMetrics,
  type CorrelationMatrix,
  type CorrelationPair,
  type DependencyEdge,
  type DependencyGraph,
  type UseComponentCorrelationOptions,
  type UseComponentCorrelationResult,
  useComponentCorrelation,
} from './use-component-correlation'
// Dashboard hooks
export { useDashboard } from './use-dashboard'
// Eval progress hooks (SSE-based real-time)
export { useEvalProgress } from './use-eval-progress'
// Feedback hooks (RLHF)
export {
  feedbackQueryKeys,
  type PreferenceSession,
  useComparisons,
  useCorrection,
  useFeedback,
  usePreferenceSession,
  useSubmitFeedback,
} from './use-feedback'
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
// Settings hooks
export {
  type InfrastructureHealth,
  type LlmProvidersStatus,
  type ProjectSettings,
  useInfrastructureHealth,
  useLlmProviders,
  useProjectSettings,
} from './use-settings'
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
