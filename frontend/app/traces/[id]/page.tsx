'use client'

/**
 * Trace Detail Page
 *
 * Shows full trace details with hierarchical span tree, timeline visualization,
 * decision tree view, and detailed span information. Supports agent-native
 * concepts like tool calls, LLM reasoning steps, and execution flow.
 */

import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle,
  Clock,
  GitBranch,
  Hash,
  ListTree,
  MessageSquare,
  RefreshCw,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import {
  FailureCascade,
  MultiAgentExecutionFlow,
} from '@/components/multi-agent'
import { DecisionTree, traceToDecisionTree } from '@/components/traces'
import { CopyButton } from '@/components/traces/copy-button'
import {
  LazySpanDetail,
  LazyTraceTimeline,
  TraceLoadingSkeleton,
} from '@/components/traces/lazy-components'
import type { SpanSummary } from '@/components/traces/span-detail'
import { useTrace } from '@/hooks/use-traces'
import {
  analyzeMultiAgentTrace,
  type MultiAgentAnalysis,
} from '@/lib/multi-agent-analysis'
import type { DecisionNode } from '@/lib/trace-to-decision-tree'

// Type alias for backward compatibility
type Span = SpanSummary

type ViewMode = 'timeline' | 'decisions' | 'multi-agent'

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

/**
 * Count spans by type recursively
 */
function countSpansByType(spans: Span[]): {
  llm: number
  tool: number
  agent: number
  total: number
} {
  let llm = 0
  let tool = 0
  let agent = 0
  let total = 0

  function count(spanList: Span[]) {
    for (const span of spanList) {
      total++
      if (span.span_type === 'generation') llm++
      else if (span.span_type === 'tool') tool++
      else if (span.span_type === 'agent') agent++
      if (span.children) count(span.children)
    }
  }

  count(spans)
  return { llm, tool, agent, total }
}

/**
 * Calculate total tokens recursively
 */
function calculateTotalTokens(spans: Span[]): number {
  let total = 0

  function sum(spanList: Span[]) {
    for (const span of spanList) {
      total += span.total_tokens || 0
      if (span.children) sum(span.children)
    }
  }

  sum(spans)
  return total
}

/**
 * Find a span by ID in the tree
 */
function findSpan(spans: Span[], spanId: string): Span | null {
  for (const span of spans) {
    if (span.span_id === spanId) return span
    if (span.children) {
      const found = findSpan(span.children, spanId)
      if (found) return found
    }
  }
  return null
}

/**
 * Transform spans to decision tree format
 * Maps SpanSummary to the format expected by traceToDecisionTree.
 * Uses type coercion since SpanSummary has string timestamps while
 * SpanWithChildren expects Date objects, but the decision tree only
 * uses the subset of fields we're providing.
 */
function transformSpansForDecisionTree(
  spans: Span[],
): Parameters<typeof traceToDecisionTree>[0] {
  function transform(spanList: Span[]): unknown[] {
    return spanList.map((span) => ({
      spanId: span.span_id,
      traceId: span.trace_id || '',
      projectId: '',
      name: span.name,
      spanType: span.span_type,
      // Infer componentType from span_type for decision tree
      componentType:
        span.span_type === 'tool'
          ? 'tool'
          : span.span_type === 'generation'
            ? 'prompt'
            : undefined,
      status: span.status,
      timestamp: new Date(span.timestamp),
      endTime: span.end_time ? new Date(span.end_time) : null,
      durationMs: span.duration_ms,
      toolName: span.tool_name,
      kind: 'internal',
      attributes: {},
      children: span.children ? transform(span.children) : [],
    }))
  }
  return transform(spans) as Parameters<typeof traceToDecisionTree>[0]
}

/**
 * Stat card component for consistent display
 */
function StatCard({
  icon: Icon,
  label,
  value,
  iconColor = 'text-gray-500',
}: {
  icon: typeof Clock
  label: string
  value: string | number
  iconColor?: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border">
      <Icon className={clsx('w-4 h-4', iconColor)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
        <span className="text-xs text-gray-500 sm:hidden">{label}</span>
        <span className="text-sm font-medium text-gray-900">{value}</span>
        <span className="hidden sm:inline text-xs text-gray-500">{label}</span>
      </div>
    </div>
  )
}

/**
 * View toggle component
 */
function ViewToggle({
  view,
  onViewChange,
}: {
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1">
      <button
        type="button"
        onClick={() => onViewChange('timeline')}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          view === 'timeline'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900',
        )}
      >
        <ListTree className="w-4 h-4" />
        Timeline
      </button>
      <button
        type="button"
        onClick={() => onViewChange('decisions')}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          view === 'decisions'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900',
        )}
      >
        <GitBranch className="w-4 h-4" />
        Decisions
      </button>
      <button
        type="button"
        onClick={() => onViewChange('multi-agent')}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          view === 'multi-agent'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900',
        )}
      >
        <Users className="w-4 h-4" />
        Multi-Agent
      </button>
    </div>
  )
}

/**
 * Score badge component
 */
function ScoreBadge({ name, value }: { name: string; value: number }) {
  const percentage = Math.round(value * 100)
  const isGood = percentage >= 80
  const isWarning = percentage >= 60 && percentage < 80

  return (
    <div
      className={clsx(
        'px-4 py-2.5 rounded-lg border',
        isGood && 'bg-green-50 border-green-200',
        isWarning && 'bg-amber-50 border-amber-200',
        !isGood && !isWarning && 'bg-red-50 border-red-200',
      )}
    >
      <div className="text-xs text-gray-500 mb-0.5">{name}</div>
      <div
        className={clsx(
          'text-lg font-semibold',
          isGood && 'text-green-700',
          isWarning && 'text-amber-700',
          !isGood && !isWarning && 'text-red-700',
        )}
      >
        {percentage}%
      </div>
    </div>
  )
}

/**
 * Error state component
 */
function TraceNotFound({ traceId }: { traceId: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] px-4">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <XCircle className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Trace not found
      </h2>
      <p className="text-gray-500 text-center mb-1">
        The trace you're looking for doesn't exist or has been deleted.
      </p>
      <p className="text-xs text-gray-400 font-mono mb-6 break-all max-w-md text-center">
        {traceId}
      </p>
      <Link
        href="/traces"
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to traces
      </Link>
    </div>
  )
}

/**
 * Error state for API errors
 */
function TraceError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] px-4">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Failed to load trace
      </h2>
      <p className="text-gray-500 text-center mb-4 max-w-md">
        {error.message ||
          'An unexpected error occurred while loading the trace.'}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <Link
          href="/traces"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to traces
        </Link>
      </div>
    </div>
  )
}

export default function TraceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const traceId = params.id as string

  const { data, isLoading, error, refetch } = useTrace(traceId)

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')

  // Get selected span from URL for shareable links
  const selectedSpanId = searchParams.get('span')

  // Update URL when span is selected
  const setSelectedSpanId = useCallback(
    (spanId: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (spanId) {
        params.set('span', spanId)
      } else {
        params.delete('span')
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Handle decision node click - select the corresponding span
  const handleDecisionNodeClick = useCallback(
    (node: DecisionNode) => {
      setSelectedSpanId(node.spanId)
    },
    [setSelectedSpanId],
  )

  // Loading state
  if (isLoading) {
    return <TraceLoadingSkeleton />
  }

  // Error state
  if (error) {
    return <TraceError error={error} onRetry={() => refetch()} />
  }

  // Not found state
  if (!data) {
    return <TraceNotFound traceId={traceId} />
  }

  const { trace, spans, scores } = data

  // Calculate stats
  const spanCounts = countSpansByType(spans)
  const totalTokens = calculateTotalTokens(spans)
  const selectedSpan = selectedSpanId ? findSpan(spans, selectedSpanId) : null

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sm:px-6">
        {/* Top row: back button, title, refresh */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4">
          <Link
            href="/traces"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="Back to traces"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {trace.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs sm:text-sm text-gray-500 font-mono truncate">
                {trace.trace_id}
              </code>
              <CopyButton value={trace.trace_id} size="sm" label="Copy ID" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Status */}
          <div
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
              trace.status === 'ok'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700',
            )}
          >
            {trace.status === 'ok' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {trace.status === 'ok' ? 'Success' : 'Error'}
          </div>

          {/* Stats */}
          <StatCard
            icon={Clock}
            label="duration"
            value={formatDuration(trace.duration_ms)}
          />
          {spanCounts.llm > 0 && (
            <StatCard
              icon={MessageSquare}
              label="LLM calls"
              value={spanCounts.llm}
              iconColor="text-purple-500"
            />
          )}
          {spanCounts.tool > 0 && (
            <StatCard
              icon={Wrench}
              label="tool calls"
              value={spanCounts.tool}
              iconColor="text-blue-500"
            />
          )}
          {spanCounts.agent > 0 && (
            <StatCard
              icon={Bot}
              label="agent spans"
              value={spanCounts.agent}
              iconColor="text-orange-500"
            />
          )}
          {totalTokens > 0 && (
            <StatCard
              icon={Hash}
              label="tokens"
              value={totalTokens.toLocaleString()}
            />
          )}

          {/* View toggle - pushed to right on larger screens */}
          <div className="hidden lg:flex ml-auto items-center gap-4">
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
            <span className="text-sm text-gray-500">
              {new Date(trace.timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Mobile view toggle */}
        <div className="lg:hidden mt-3">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main view section */}
        <div
          className={clsx(
            'flex-1 overflow-auto p-4 sm:p-6',
            selectedSpan && 'lg:border-r',
          )}
        >
          {/* Scores summary */}
          {scores && scores.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Scores
              </h3>
              <div className="flex flex-wrap gap-3">
                {scores.map((score) => (
                  <ScoreBadge
                    key={score.score_id}
                    name={score.name}
                    value={score.value}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Timeline, Decision Tree, or Multi-Agent view */}
          {viewMode === 'timeline' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Execution Timeline
                <span className="ml-2 font-normal text-gray-500">
                  ({spanCounts.total} spans)
                </span>
              </h3>
              <LazyTraceTimeline
                spans={spans}
                selectedSpanId={selectedSpanId || undefined}
                onSpanSelect={(span) => setSelectedSpanId(span.span_id)}
              />
            </div>
          )}
          {viewMode === 'decisions' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Decision Tree
                <span className="ml-2 font-normal text-gray-500">
                  Agent decision points and outcomes
                </span>
              </h3>
              <DecisionTreeView
                spans={spans}
                selectedSpanId={selectedSpanId}
                onNodeClick={handleDecisionNodeClick}
              />
            </div>
          )}
          {viewMode === 'multi-agent' && (
            <MultiAgentView spans={spans} onSpanClick={setSelectedSpanId} />
          )}

          {/* Mobile timestamp */}
          <div className="lg:hidden mt-6 text-center text-sm text-gray-500">
            {new Date(trace.timestamp).toLocaleString()}
          </div>
        </div>

        {/* Span detail panel - slide in from right on mobile */}
        {selectedSpan && (
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/20 z-40 lg:hidden"
              onClick={() => setSelectedSpanId(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSelectedSpanId(null)
              }}
              role="button"
              tabIndex={0}
              aria-label="Close detail panel"
            />

            {/* Detail panel */}
            <div
              className={clsx(
                'fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50',
                'lg:relative lg:w-[400px] lg:max-w-none lg:shadow-none lg:z-auto',
              )}
            >
              <LazySpanDetail
                span={selectedSpan}
                onClose={() => setSelectedSpanId(null)}
                projectId="00000000-0000-0000-0000-000000000001"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Decision Tree View Component
 * Memoized to prevent unnecessary re-renders during transformation
 */
function DecisionTreeView({
  spans,
  selectedSpanId,
  onNodeClick,
}: {
  spans: Span[]
  selectedSpanId: string | null
  onNodeClick: (node: DecisionNode) => void
}) {
  // Transform spans to decision tree format and build tree
  const decisionTree = useMemo(() => {
    const transformedSpans = transformSpansForDecisionTree(spans)
    return traceToDecisionTree(transformedSpans)
  }, [spans])

  return (
    <DecisionTree
      tree={decisionTree}
      onNodeClick={onNodeClick}
      selectedNodeId={selectedSpanId ? `decision-${selectedSpanId}` : undefined}
    />
  )
}

/**
 * Transform SpanSummary to SpanWithChildren format for multi-agent analysis
 */
function transformSpansForMultiAgent(
  spans: Span[],
): Parameters<typeof analyzeMultiAgentTrace>[0] {
  function transform(spanList: Span[]): unknown[] {
    return spanList.map((span) => ({
      spanId: span.span_id,
      traceId: span.trace_id || '',
      projectId: '',
      name: span.name,
      spanType: span.span_type,
      componentType:
        span.span_type === 'tool'
          ? 'tool'
          : span.span_type === 'generation'
            ? 'prompt'
            : undefined,
      status: span.status,
      timestamp: new Date(span.timestamp),
      endTime: span.end_time ? new Date(span.end_time) : null,
      durationMs: span.duration_ms,
      toolName: span.tool_name,
      kind: 'internal',
      attributes: {},
      statusMessage: span.status_message,
      children: span.children ? transform(span.children) : [],
    }))
  }
  return transform(spans) as Parameters<typeof analyzeMultiAgentTrace>[0]
}

/**
 * Multi-Agent View Component
 * Shows execution flow and failure cascades for multi-agent traces
 */
function MultiAgentView({
  spans,
  onSpanClick,
}: {
  spans: Span[]
  onSpanClick: (spanId: string | null) => void
}) {
  // Transform and analyze spans
  const analysis = useMemo<MultiAgentAnalysis>(() => {
    const transformedSpans = transformSpansForMultiAgent(spans)
    return analyzeMultiAgentTrace(transformedSpans)
  }, [spans])

  // Handle agent click - select first span
  const handleAgentClick = useCallback(
    (agent: { spans: Array<{ spanId: string }> }) => {
      if (agent.spans.length > 0) {
        onSpanClick(agent.spans[0].spanId)
      }
    },
    [onSpanClick],
  )

  // Handle cascade span click
  const handleCascadeSpanClick = useCallback(
    (spanId: string) => {
      onSpanClick(spanId)
    },
    [onSpanClick],
  )

  return (
    <div className="space-y-8">
      {/* Agent Execution Flow */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Agent Execution Flow
          <span className="ml-2 font-normal text-gray-500">
            {analysis.summary.totalAgents} agent
            {analysis.summary.totalAgents !== 1 ? 's' : ''},{' '}
            {analysis.summary.totalHandoffs} handoff
            {analysis.summary.totalHandoffs !== 1 ? 's' : ''}
          </span>
        </h3>
        <MultiAgentExecutionFlow
          analysis={analysis}
          onAgentClick={handleAgentClick}
        />
      </div>

      {/* Failure Cascades */}
      {analysis.cascadeChains.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Failure Cascades
            <span className="ml-2 font-normal text-rose-500">
              {analysis.cascadeChains.length} cascade chain
              {analysis.cascadeChains.length !== 1 ? 's' : ''} detected
            </span>
          </h3>
          <FailureCascade
            chains={analysis.cascadeChains}
            onSpanClick={handleCascadeSpanClick}
          />
        </div>
      )}

      {/* No failures - show positive message */}
      {analysis.cascadeChains.length === 0 &&
        analysis.summary.failedAgents === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span>
              No cascading failures detected. All agents completed successfully.
            </span>
          </div>
        )}
    </div>
  )
}
