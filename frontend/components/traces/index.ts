/**
 * Trace Components Index
 *
 * Exports all trace-related components for the trace viewer.
 */

export {
  type DecisionAlternative,
  type DecisionNode,
  type DecisionOutcome,
  type DecisionTree as DecisionTreeType,
  type DecisionType,
  findCausalDecisions,
  getLowConfidenceDecisions,
  traceToDecisionTree,
} from '@/lib/trace-to-decision-tree'
export { CopyButton } from './copy-button'
// Decision tree components
export { DecisionTree, DecisionTreeSkeleton } from './decision-tree'
// Diff components
export * from './diff'
// Live debugger
export { LiveDebugger } from './live-debugger'
export { type Span, SpanDetail, type SpanSummary } from './span-detail'
export {
  getSpanTypeConfig,
  type SpanType,
  SpanTypeBadge,
} from './span-type-badge'
export { TraceLoadingSkeleton } from './trace-loading-skeleton'
export { type TimelineSpan, TraceTimeline } from './trace-timeline'
