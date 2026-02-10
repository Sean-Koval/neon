'use client'

/**
 * Trace Detail Page
 *
 * Shows full trace details with hierarchical span tree, timeline visualization,
 * decision tree view, agent graph view, and detailed span information.
 * Supports deep linking via ?span=[spanId], cost stat card, related traces,
 * and test case creation.
 */

import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Bug,
  CheckCircle,
  Clock,
  DollarSign,
  FlaskConical,
  GitBranch,
  Hash,
  ListTree,
  MessageSquare,
  Network,
  RefreshCw,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  FailureCascade,
  MultiAgentExecutionFlow,
} from '@/components/multi-agent'
import { DecisionTree, traceToDecisionTree } from '@/components/traces'
import { AgentGraph } from '@/components/traces/agent-graph'
import { CopyButton } from '@/components/traces/copy-button'
import { CreateTestCasesModal } from '@/components/traces/create-test-cases-modal'
import {
  LazySpanDetail,
  LazyTraceTimeline,
  TraceLoadingSkeleton,
} from '@/components/traces/lazy-components'
import type { SpanSummary } from '@/components/traces/span-detail'
import { useTrace, useTraces } from '@/hooks/use-traces'
import {
  analyzeMultiAgentTrace,
  type MultiAgentAnalysis,
} from '@/lib/multi-agent-analysis'
import type { DecisionNode } from '@/lib/trace-to-decision-tree'

type Span = SpanSummary

type ViewMode = 'timeline' | 'decisions' | 'graph' | 'multi-agent'
type TimelinePlotMode = 'waterfall' | 'duration'

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function countSpansByType(spans: Span[]): {
  llm: number
  tool: number
  agent: number
  total: number
} {
  let llm = 0,
    tool = 0,
    agent = 0,
    total = 0
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

function calculateTotalCost(spans: Span[]): number {
  let total = 0
  function sum(spanList: Span[]) {
    for (const span of spanList) {
      total += span.cost_usd || 0
      if (span.children) sum(span.children)
    }
  }
  sum(spans)
  return total
}

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

function countDistinctAgents(spans: Span[]): number {
  const agents = new Set<string>()
  function walk(list: Span[]) {
    for (const span of list) {
      if (span.span_type === 'agent') agents.add(span.name)
      if (span.children) walk(span.children)
    }
  }
  walk(spans)
  return agents.size
}

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

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  iconColor = 'text-content-muted',
}: {
  icon: typeof Clock
  label: string
  value: string | number
  iconColor?: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-card rounded-lg border border-border">
      <Icon className={clsx('w-4 h-4', iconColor)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
        <span className="text-xs text-content-muted sm:hidden">{label}</span>
        <span className="text-sm font-medium text-content-primary">
          {value}
        </span>
        <span className="hidden sm:inline text-xs text-content-muted">
          {label}
        </span>
      </div>
    </div>
  )
}

// ─── View Toggle ────────────────────────────────────────────────────────────

function ViewToggle({
  view,
  onViewChange,
}: {
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}) {
  const tabs: Array<{ key: ViewMode; label: string; icon: typeof ListTree }> = [
    { key: 'timeline', label: 'Timeline', icon: ListTree },
    { key: 'decisions', label: 'Decisions', icon: GitBranch },
    { key: 'graph', label: 'Graph', icon: Network },
    { key: 'multi-agent', label: 'Multi-Agent', icon: Users },
  ]

  return (
    <div className="flex bg-surface-raised rounded-lg p-1 border border-border">
      {tabs.map(({ key, label, icon: TabIcon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onViewChange(key)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            view === key
              ? 'bg-surface-card text-content-primary shadow-sm border border-border'
              : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay',
          )}
        >
          <TabIcon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Score Badge ────────────────────────────────────────────────────────────

function ScoreBadge({ name, value }: { name: string; value: number }) {
  const percentage = Math.round(value * 100)
  const isGood = percentage >= 90
  const isWarning = percentage >= 70 && percentage < 90

  return (
    <div
      className={clsx(
        'px-4 py-2.5 rounded-lg border',
        isGood &&
          'bg-green-50 dark:bg-emerald-500/10 border-green-200 dark:border-emerald-500/25',
        isWarning &&
          'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25',
        !isGood &&
          !isWarning &&
          'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25',
      )}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
        {name}
      </div>
      <div
        className={clsx(
          'text-lg font-semibold',
          isGood && 'text-green-700 dark:text-emerald-400',
          isWarning && 'text-amber-700 dark:text-amber-400',
          !isGood && !isWarning && 'text-red-700 dark:text-red-400',
        )}
      >
        {percentage}%
      </div>
    </div>
  )
}

// ─── Related Traces ─────────────────────────────────────────────────────────

function RelatedTraces({
  agentId,
  excludeTraceId,
}: {
  agentId: string | null
  excludeTraceId: string
}) {
  const { data: traces, isLoading } = useTraces(
    agentId ? { agentId, limit: 6 } : { limit: 0 },
  )

  const relatedTraces = useMemo(
    () =>
      (traces || []).filter((t) => t.trace_id !== excludeTraceId).slice(0, 5),
    [traces, excludeTraceId],
  )

  if (!agentId) return null

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="text-sm font-semibold text-content-secondary mb-1">
        Related Traces
      </h3>
      <p className="text-xs text-content-muted mb-3">
        Recent traces from the same agent
      </p>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-surface-raised rounded" />
          ))}
        </div>
      ) : relatedTraces.length === 0 ? (
        <p className="text-sm text-content-muted py-4 text-center">
          No other traces from this agent
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-surface-card">
          {relatedTraces.map((trace) => (
            <Link
              key={trace.trace_id}
              href={`/traces/${trace.trace_id}`}
              className="flex items-center px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
            >
              <code className="text-xs font-mono text-content-muted w-20">
                {trace.trace_id.slice(0, 8)}
              </code>
              <div className="flex-1 min-w-0 mx-3">
                {trace.status === 'ok' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                    <XCircle className="w-3 h-3" />
                    Error
                  </span>
                )}
              </div>
              <span className="text-xs text-content-secondary mr-4">
                {formatDuration(trace.duration_ms)}
              </span>
              <span className="text-xs text-content-muted">
                {formatRelativeTime(trace.timestamp)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Error States ───────────────────────────────────────────────────────────

function TraceNotFound({ traceId }: { traceId: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] px-4 bg-surface-base">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <XCircle className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-content-primary mb-2">
        Trace not found
      </h2>
      <p className="text-xs text-content-muted font-mono mb-6 break-all max-w-md text-center">
        {traceId}
      </p>
      <Link
        href="/traces"
        className="inline-flex items-center gap-2 px-4 py-2 bg-content-primary text-content-inverted rounded-lg hover:opacity-90 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to traces
      </Link>
    </div>
  )
}

function TraceError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] px-4 bg-surface-base">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-content-primary mb-2">
        Failed to load trace
      </h2>
      <p className="text-content-muted text-center mb-4 max-w-md">
        {error.message}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-content-primary text-content-inverted rounded-lg hover:opacity-90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <Link
          href="/traces"
          className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-surface-raised transition-colors"
        >
          Back to traces
        </Link>
      </div>
    </div>
  )
}

// ─── Decision Tree View ─────────────────────────────────────────────────────

function DecisionTreeView({
  spans,
  selectedSpanId,
  onNodeClick,
  onViewInGraph,
}: {
  spans: Span[]
  selectedSpanId: string | null
  onNodeClick: (node: DecisionNode) => void
  onViewInGraph: (node: DecisionNode) => void
}) {
  const decisionTree = useMemo(() => {
    const transformedSpans = transformSpansForDecisionTree(spans)
    return traceToDecisionTree(transformedSpans)
  }, [spans])

  return (
    <DecisionTree
      tree={decisionTree}
      onNodeClick={onNodeClick}
      onViewInGraph={onViewInGraph}
      selectedNodeId={selectedSpanId ? `decision-${selectedSpanId}` : undefined}
    />
  )
}

// ─── Multi-Agent View ───────────────────────────────────────────────────────

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

function MultiAgentView({
  spans,
  onSpanClick,
}: {
  spans: Span[]
  onSpanClick: (spanId: string | null) => void
}) {
  const analysis = useMemo<MultiAgentAnalysis>(() => {
    const transformedSpans = transformSpansForMultiAgent(spans)
    return analyzeMultiAgentTrace(transformedSpans)
  }, [spans])

  const handleAgentClick = useCallback(
    (agent: { spans: Array<{ spanId: string }> }) => {
      if (agent.spans.length > 0) onSpanClick(agent.spans[0].spanId)
    },
    [onSpanClick],
  )

  const handleCascadeSpanClick = useCallback(
    (spanId: string) => {
      onSpanClick(spanId)
    },
    [onSpanClick],
  )

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-content-secondary mb-3">
          Agent Execution Flow
          <span className="ml-2 font-normal text-content-muted">
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
      {analysis.cascadeChains.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-content-secondary mb-3">
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
      {analysis.cascadeChains.length === 0 &&
        analysis.summary.failedAgents === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 px-4 py-3 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span>
              No cascading failures detected. All agents completed successfully.
            </span>
          </div>
        )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TraceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const traceId = params.id as string

  const { data, isLoading, error, refetch } = useTrace(traceId)

  // Deep link: read ?span= from URL
  const selectedSpanId = searchParams.get('span')
  const rawPlotMode = searchParams.get('plot')
  const timelinePlotMode: TimelinePlotMode =
    rawPlotMode === 'compare' ? 'duration' : 'waterfall'

  // Auto-select Graph tab for multi-agent traces
  const distinctAgents = data ? countDistinctAgents(data.spans) : 0
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [showTestCasesModal, setShowTestCasesModal] = useState(false)

  const setSelectedSpanId = useCallback(
    (spanId: string | null) => {
      const p = new URLSearchParams(searchParams.toString())
      if (spanId) {
        p.set('span', spanId)
      } else {
        p.delete('span')
      }
      router.replace(`?${p.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const handleDecisionNodeClick = useCallback(
    (node: DecisionNode) => {
      setSelectedSpanId(node.spanId)
    },
    [setSelectedSpanId],
  )

  const handleDecisionViewInGraph = useCallback(
    (node: DecisionNode) => {
      setSelectedSpanId(node.spanId)
      setViewMode('graph')
    },
    [setSelectedSpanId],
  )

  const setTimelinePlotMode = useCallback(
    (mode: TimelinePlotMode) => {
      const p = new URLSearchParams(searchParams.toString())
      p.set('plot', mode === 'duration' ? 'compare' : 'absolute')
      router.replace(`?${p.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  useEffect(() => {
    if (distinctAgents >= 2 && viewMode === 'timeline') {
      setViewMode('graph')
    }
  }, [distinctAgents, viewMode])

  if (isLoading) return <TraceLoadingSkeleton />
  if (error) return <TraceError error={error} onRetry={() => refetch()} />
  if (!data) return <TraceNotFound traceId={traceId} />

  const { trace, spans, scores } = data
  const spanCounts = countSpansByType(spans)
  const totalTokens = calculateTotalTokens(spans)
  const totalCost = calculateTotalCost(spans)
  const selectedSpan = selectedSpanId ? findSpan(spans, selectedSpanId) : null

  return (
    <div className="h-screen flex flex-col bg-surface-base">
      {/* Header */}
      <header className="border-b border-border bg-gradient-to-br from-white via-white to-slate-50/80 px-4 py-4 sm:px-6 dark:bg-[var(--sidebar-bg)] dark:bg-none dark:border-[var(--sidebar-border)]">
        <div className="flex items-center gap-3 sm:gap-4 mb-4">
          <Link
            href="/traces"
            className="p-2 hover:bg-surface-raised rounded-lg transition-colors flex-shrink-0"
            title="Back to traces"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-content-primary truncate">
              {trace.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs sm:text-sm text-content-muted font-mono truncate">
                {trace.trace_id}
              </code>
              <CopyButton value={trace.trace_id} size="sm" label="Copy ID" />
            </div>
          </div>
          {/* Create Test Case button */}
          <button
            type="button"
            onClick={() => setShowTestCasesModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-content-secondary border border-border bg-surface-card rounded-lg hover:bg-surface-raised transition-colors flex-shrink-0"
            title="Create test case from this trace"
          >
            <FlaskConical className="w-4 h-4" />
            <span className="hidden sm:inline">Create Test Case</span>
          </button>
          <Link
            href={`/traces/${traceId}/debug`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/25 hover:bg-orange-100 dark:hover:bg-orange-500/20 rounded-lg transition-colors flex-shrink-0"
          >
            <Bug className="w-4 h-4" />
            Debug
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 hover:bg-surface-raised rounded-lg transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div
            className={clsx(
              'flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
              trace.status === 'ok'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
            )}
          >
            {trace.status === 'ok' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {trace.status === 'ok' ? 'Success' : 'Error'}
          </div>
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
              iconColor="text-purple-600 dark:text-purple-400"
            />
          )}
          {spanCounts.tool > 0 && (
            <StatCard
              icon={Wrench}
              label="tool calls"
              value={spanCounts.tool}
              iconColor="text-sky-600 dark:text-sky-400"
            />
          )}
          {spanCounts.agent > 0 && (
            <StatCard
              icon={Bot}
              label="agent spans"
              value={spanCounts.agent}
              iconColor="text-orange-600 dark:text-orange-400"
            />
          )}
          {totalTokens > 0 && (
            <StatCard
              icon={Hash}
              label="tokens"
              value={totalTokens.toLocaleString()}
            />
          )}
          {/* Cost stat card - ticket neon-l9vj */}
          <StatCard
            icon={DollarSign}
            label="cost"
            value={totalCost > 0 ? `$${totalCost.toFixed(2)}` : '---'}
            iconColor="text-emerald-600 dark:text-emerald-400"
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex justify-start">
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
          <span className="text-xs sm:text-sm text-content-muted">
            {new Date(trace.timestamp).toLocaleString()}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div
          className={clsx(
            'flex-1 overflow-auto p-4 sm:p-6',
            selectedSpan && 'lg:border-r lg:border-border',
          )}
        >
          {/* Scores */}
          {scores && scores.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-content-secondary mb-3">
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

          {/* View content */}
          <ErrorBoundary
            fallback={
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6">
                <h2 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-300">
                  Something went wrong
                </h2>
              </div>
            }
          >
            {viewMode === 'timeline' && (
              <div>
                <h3 className="text-sm font-semibold text-content-secondary mb-3">
                  Execution Timeline{' '}
                  <span className="ml-2 font-normal text-content-muted">
                    ({spanCounts.total} spans)
                  </span>
                </h3>
                {!selectedSpanId && (
                  <p className="text-xs text-content-muted mb-2 lg:hidden">
                    Tap a span to view details
                  </p>
                )}
                <LazyTraceTimeline
                  spans={spans}
                  selectedSpanId={selectedSpanId || undefined}
                  onSpanSelect={(span) => setSelectedSpanId(span.span_id)}
                  plotMode={timelinePlotMode}
                  onPlotModeChange={setTimelinePlotMode}
                />
              </div>
            )}
            {viewMode === 'decisions' && (
              <div>
                <h3 className="text-sm font-semibold text-content-secondary mb-3">
                  Decision Tree
                </h3>
                <DecisionTreeView
                  spans={spans}
                  selectedSpanId={selectedSpanId}
                  onNodeClick={handleDecisionNodeClick}
                  onViewInGraph={handleDecisionViewInGraph}
                />
              </div>
            )}
            {viewMode === 'graph' && (
              <div>
                <h3 className="text-sm font-semibold text-content-secondary mb-3">
                  Agent Graph{' '}
                  <span className="ml-2 font-normal text-content-muted">
                    ({spanCounts.total} nodes)
                  </span>
                </h3>
                <AgentGraph
                  spans={spans}
                  selectedSpanId={selectedSpanId}
                  onSpanSelect={setSelectedSpanId}
                />
              </div>
            )}
            {viewMode === 'multi-agent' && (
              <MultiAgentView spans={spans} onSpanClick={setSelectedSpanId} />
            )}
          </ErrorBoundary>

          {/* Related Traces - ticket neon-25tq */}
          <RelatedTraces
            agentId={
              trace.metadata?.agent_id ||
              ((data as unknown as Record<string, unknown>)
                .agent_id as string) ||
              null
            }
            excludeTraceId={traceId}
          />
        </div>

        {/* Span detail panel */}
        {selectedSpan && (
          <>
            <button
              type="button"
              className="fixed inset-0 bg-black/20 z-40 lg:hidden appearance-none border-none cursor-default"
              onClick={() => setSelectedSpanId(null)}
              aria-label="Close detail panel"
            />
            <div
              className={clsx(
                'fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-surface-card shadow-xl dark:border-slate-700/80 dark:bg-slate-900/90',
                'lg:relative lg:inset-auto lg:z-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:shadow-none lg:border-l lg:border-t-0',
              )}
            >
              <div className="sticky top-0 flex justify-center bg-surface-card pt-2 pb-1 dark:bg-slate-900/95 lg:hidden">
                <div className="w-10 h-1 bg-gray-300 dark:bg-dark-600 rounded-full" />
              </div>
              <ErrorBoundary
                fallback={
                  <div className="p-6 text-center">
                    <p className="text-sm text-red-600">
                      Failed to load span details.
                    </p>
                  </div>
                }
              >
                <LazySpanDetail
                  span={selectedSpan}
                  onClose={() => setSelectedSpanId(null)}
                  projectId="00000000-0000-0000-0000-000000000001"
                />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

      {/* Create Test Cases Modal */}
      <CreateTestCasesModal
        traceIds={[traceId]}
        open={showTestCasesModal}
        onClose={() => setShowTestCasesModal(false)}
      />
    </div>
  )
}
