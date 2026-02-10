'use client'

/**
 * Decision Tree Component
 *
 * Visualizes agent decision points as an interactive tree.
 * Shows routing, planning, and tool selection decisions with
 * alternatives considered and outcomes.
 */

import { clsx } from 'clsx'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  GitBranch,
  Route,
  Target,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  DecisionNode,
  DecisionOutcome,
  DecisionTree as DecisionTreeType,
  DecisionType,
} from '@/lib/trace-to-decision-tree'

// =============================================================================
// Helpers
// =============================================================================

function getDecisionTypeConfig(type: DecisionType) {
  const configs: Record<
    DecisionType,
    {
      icon: typeof GitBranch
      label: string
      color: string
      bgColor: string
    }
  > = {
    routing: {
      icon: Route,
      label: 'Routing',
      color: 'text-orange-700 dark:text-orange-300',
      bgColor: 'bg-orange-50 dark:bg-orange-500/10',
    },
    planning: {
      icon: Target,
      label: 'Planning',
      color: 'text-violet-700 dark:text-violet-300',
      bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    },
    tool_selection: {
      icon: GitBranch,
      label: 'Tool Selection',
      color: 'text-sky-700 dark:text-sky-300',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    },
    branching: {
      icon: GitBranch,
      label: 'Branch',
      color: 'text-indigo-700 dark:text-indigo-300',
      bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',
    },
    termination: {
      icon: CheckCircle,
      label: 'Termination',
      color: 'text-content-secondary',
      bgColor: 'bg-surface-raised',
    },
  }
  return configs[type]
}

function getOutcomeConfig(outcome: DecisionOutcome) {
  const configs: Record<
    DecisionOutcome,
    {
      icon: typeof CheckCircle
      label: string
      color: string
      bgColor: string
      borderColor: string
    }
  > = {
    success: {
      icon: CheckCircle,
      label: 'Success',
      color: 'text-emerald-700 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-500/20',
      borderColor: 'border-emerald-200 dark:border-emerald-500/25',
    },
    failure: {
      icon: XCircle,
      label: 'Failed',
      color: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-rose-500/10',
      borderColor: 'border-rose-200 dark:border-rose-500/30',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
      borderColor: 'border-amber-200 dark:border-amber-500/30',
    },
    unknown: {
      icon: AlertCircle,
      label: 'Unknown',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-dark-900',
      borderColor: 'border-border',
    },
  }
  return configs[outcome]
}

function getConfidenceColor(confidence?: number): string {
  if (confidence === undefined) return 'text-content-muted'
  if (confidence >= 0.8) return 'text-emerald-700 dark:text-emerald-300'
  if (confidence >= 0.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getConfidenceGap(node: DecisionNode): number | null {
  const chosen = node.alternatives.find(
    (alt) => alt.wasChosen && alt.confidence !== undefined,
  )?.confidence
  const bestAlternative = node.alternatives
    .filter((alt) => !alt.wasChosen && alt.confidence !== undefined)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.confidence

  if (chosen === undefined || bestAlternative === undefined) return null
  return chosen - bestAlternative
}

function collectNodes(nodes: DecisionNode[]): DecisionNode[] {
  const result: DecisionNode[] = []
  const walk = (list: DecisionNode[]) => {
    for (const node of list) {
      result.push(node)
      if (node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return result
}

type DecisionFilter = 'all' | 'failures' | 'low-confidence' | 'tool-selection'

function filterTree(
  nodes: DecisionNode[],
  predicate: (node: DecisionNode) => boolean,
): DecisionNode[] {
  return nodes
    .map((node) => {
      const filteredChildren = filterTree(node.children, predicate)
      if (predicate(node) || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    })
    .filter((node): node is DecisionNode => node !== null)
}

// =============================================================================
// Decision Node Component
// =============================================================================

interface DecisionNodeProps {
  node: DecisionNode
  level: number
  isLast: boolean
  onNodeClick?: (node: DecisionNode) => void
  onViewInGraph?: (node: DecisionNode) => void
  selectedNodeId?: string
}

function DecisionNodeView({
  node,
  level,
  isLast,
  onNodeClick,
  onViewInGraph,
  selectedNodeId,
}: DecisionNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2)
  const [showAlternatives, setShowAlternatives] = useState(false)

  const typeConfig = getDecisionTypeConfig(node.type)
  const outcomeConfig = getOutcomeConfig(node.outcome)
  const TypeIcon = typeConfig.icon
  const OutcomeIcon = outcomeConfig.icon

  const hasChildren = node.children.length > 0
  const hasAlternatives = node.alternatives.length > 1
  const isSelected = selectedNodeId === node.id
  const confidenceGap = getConfidenceGap(node)
  const isLowMargin = confidenceGap !== null && confidenceGap < 0.1
  const topAlternatives = node.alternatives
    .filter((alt) => !alt.wasChosen)
    .slice(0, 2)

  return (
    <div className="relative">
      {/* Connection line */}
      {level > 0 && (
        <div
          className={clsx(
            'absolute top-0 -left-6 h-4 border-l-2 border-b-2 rounded-bl-lg',
            isLast ? 'border-border' : 'border-border',
          )}
          style={{ width: '24px' }}
        />
      )}

      {/* Node */}
      {/* biome-ignore lint/a11y/useSemanticElements: Node container needs nested interactive controls, so button semantics cannot be used on the root. */}
      <div
        className={clsx(
          'border rounded-xl overflow-hidden transition-all cursor-pointer shadow-sm hover:shadow-md',
          outcomeConfig.borderColor,
          isSelected && 'ring-2 ring-primary-500',
          node.isRootCause && 'ring-2 ring-rose-500',
        )}
        onClick={() => onNodeClick?.(node)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onNodeClick?.(node)
          }
        }}
      >
        {/* Header */}
        <div
          className={clsx(
            'px-3 py-2 flex items-center gap-2',
            outcomeConfig.bgColor,
          )}
        >
          {/* Expand/collapse for children */}
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
              className="p-0.5 hover:bg-white/50 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-content-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-content-muted" />
              )}
            </button>
          )}

          {/* Type icon and label */}
          <div className={clsx('flex items-center gap-1', typeConfig.color)}>
            <TypeIcon className="w-4 h-4" />
            <span className="text-xs font-medium">{typeConfig.label}</span>
          </div>

          <div className="flex-1" />

          {/* Confidence */}
          {node.confidence !== undefined && (
            <span
              className={clsx(
                'text-xs font-medium px-1.5 py-0.5 rounded',
                getConfidenceColor(node.confidence),
                node.confidence < 0.5
                  ? 'bg-rose-100 dark:bg-rose-500/20'
                  : node.confidence < 0.8
                    ? 'bg-amber-100 dark:bg-amber-500/20'
                    : 'bg-emerald-100 dark:bg-emerald-500/20',
              )}
            >
              {Math.round(node.confidence * 100)}%
            </span>
          )}

          {/* Low confidence warning */}
          {node.confidence !== undefined && node.confidence < 0.5 && (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}

          {/* Outcome */}
          <OutcomeIcon className={clsx('w-4 h-4', outcomeConfig.color)} />
        </div>

        {/* Content */}
        <div className="px-3 py-2 bg-surface-card">
          {/* Question and answer */}
          <div className="text-sm">
            <p className="text-content-muted">{node.question}</p>
            <p className="font-medium text-content-primary flex items-center gap-1 mt-0.5">
              <ArrowRight className="w-3 h-3 text-content-muted" />
              <code className="bg-surface-raised px-1.5 py-0.5 rounded text-xs border border-border">
                {node.chosenOption}
              </code>
            </p>
          </div>

          {/* Reason */}
          {node.reason && (
            <p className="text-xs text-content-muted mt-1 italic">
              {node.reason}
            </p>
          )}

          {/* Duration */}
          <div className="flex items-center gap-3 mt-2 text-xs text-content-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(node.durationMs)}
            </span>
            {node.isRootCause && (
              <span className="text-rose-600 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Root Cause
              </span>
            )}
            {isLowMargin && (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-1.5 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                Low margin
              </span>
            )}
            {confidenceGap !== null && (
              <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded px-1.5 py-0.5">
                Gap {Math.round(confidenceGap * 100)}%
              </span>
            )}
          </div>

          {onViewInGraph && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onViewInGraph(node)
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-overlay transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in Graph
            </button>
          )}

          {topAlternatives.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topAlternatives.map((alt) => (
                <span
                  key={alt.option}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[11px] text-content-secondary"
                >
                  <code>{alt.option}</code>
                  {alt.confidence !== undefined && (
                    <span
                      className={clsx(
                        'font-medium',
                        getConfidenceColor(alt.confidence),
                      )}
                    >
                      {Math.round(alt.confidence * 100)}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Alternatives toggle */}
          {hasAlternatives && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowAlternatives(!showAlternatives)
              }}
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
            >
              {showAlternatives ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {node.alternatives.length - 1} alternatives considered
            </button>
          )}

          {/* Alternatives list */}
          {showAlternatives && (
            <div className="mt-2 space-y-1">
              {node.alternatives
                .filter((alt) => !alt.wasChosen)
                .map((alt) => (
                  <div
                    key={alt.option}
                    className="flex items-center justify-between text-xs bg-surface-raised rounded px-2 py-1 border border-border"
                  >
                    <code className="text-content-secondary">{alt.option}</code>
                    {alt.confidence !== undefined && (
                      <span
                        className={clsx(
                          'font-medium',
                          getConfidenceColor(alt.confidence),
                        )}
                      >
                        {Math.round(alt.confidence * 100)}%
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="pl-6 mt-2 space-y-2">
          {node.children.map((child, idx) => (
            <DecisionNodeView
              key={child.id}
              node={child}
              level={level + 1}
              isLast={idx === node.children.length - 1}
              onNodeClick={onNodeClick}
              onViewInGraph={onViewInGraph}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

interface DecisionTreeProps {
  tree: DecisionTreeType
  onNodeClick?: (node: DecisionNode) => void
  onViewInGraph?: (node: DecisionNode) => void
  selectedNodeId?: string
}

export function DecisionTree({
  tree,
  onNodeClick,
  onViewInGraph,
  selectedNodeId,
}: DecisionTreeProps) {
  const [filter, setFilter] = useState<DecisionFilter>('all')

  const allNodes = useMemo(() => collectNodes(tree.roots), [tree.roots])
  const counts = useMemo(
    () => ({
      failures: allNodes.filter((node) => node.outcome === 'failure').length,
      lowConfidence: allNodes.filter(
        (node) => node.confidence !== undefined && node.confidence < 0.6,
      ).length,
      toolSelection: allNodes.filter((node) => node.type === 'tool_selection')
        .length,
    }),
    [allNodes],
  )

  const filteredRoots = useMemo(
    () =>
      filterTree(tree.roots, (node) => {
        if (filter === 'all') return true
        if (filter === 'failures') return node.outcome === 'failure'
        if (filter === 'low-confidence')
          return node.confidence !== undefined && node.confidence < 0.6
        if (filter === 'tool-selection') return node.type === 'tool_selection'
        return true
      }),
    [tree.roots, filter],
  )

  if (tree.roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-content-muted border border-border rounded-xl bg-surface-card">
        <GitBranch className="w-12 h-12 mb-4 text-content-muted/60" />
        <p className="text-lg font-medium">No decision points found</p>
        <p className="text-sm">
          This trace doesn&apos;t contain any routing, planning, or tool
          selection spans
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-card px-3 py-2 text-sm shadow-sm">
        <div className="flex items-center gap-2 rounded-md bg-surface-raised px-2 py-1">
          <span className="text-content-muted">Decisions</span>
          <span className="font-semibold text-content-primary">
            {tree.totalDecisions}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-500/20 px-2 py-1 border border-emerald-200 dark:border-emerald-500/25">
          <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            {tree.successPaths}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-500/10 px-2 py-1 border border-rose-200 dark:border-rose-500/30">
          <XCircle className="w-4 h-4 text-rose-500" />
          <span className="font-semibold text-rose-700 dark:text-rose-300">
            {tree.failedPaths}
          </span>
        </div>
        {tree.avgConfidence > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-surface-raised px-2 py-1">
            <span className="text-content-muted">Avg Confidence</span>
            <span
              className={clsx(
                'font-semibold',
                getConfidenceColor(tree.avgConfidence),
              )}
            >
              {Math.round(tree.avgConfidence * 100)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-content-secondary mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filter
        </span>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={clsx(
            'px-2 py-1 rounded-md text-xs border transition-colors',
            filter === 'all'
              ? 'bg-surface-overlay text-content-primary border-border'
              : 'text-content-muted border-border hover:text-content-primary',
          )}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter('failures')}
          className={clsx(
            'px-2 py-1 rounded-md text-xs border transition-colors',
            filter === 'failures'
              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
              : 'text-content-muted border-border hover:text-content-primary',
          )}
        >
          Failures {counts.failures}
        </button>
        <button
          type="button"
          onClick={() => setFilter('low-confidence')}
          className={clsx(
            'px-2 py-1 rounded-md text-xs border transition-colors',
            filter === 'low-confidence'
              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              : 'text-content-muted border-border hover:text-content-primary',
          )}
        >
          Low Confidence {counts.lowConfidence}
        </button>
        <button
          type="button"
          onClick={() => setFilter('tool-selection')}
          className={clsx(
            'px-2 py-1 rounded-md text-xs border transition-colors',
            filter === 'tool-selection'
              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
              : 'text-content-muted border-border hover:text-content-primary',
          )}
        >
          Tool Decisions {counts.toolSelection}
        </button>
      </div>

      {/* Tree */}
      <div className="space-y-4">
        {filteredRoots.map((root, idx) => (
          <DecisionNodeView
            key={root.id}
            node={root}
            level={0}
            isLast={idx === tree.roots.length - 1}
            onNodeClick={onNodeClick}
            onViewInGraph={onViewInGraph}
            selectedNodeId={selectedNodeId}
          />
        ))}
        {filteredRoots.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-border bg-surface-card px-4 py-8 text-sm text-content-muted">
            No decision nodes match the current filter
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function DecisionTreeSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-6">
        <div className="h-5 w-24 bg-surface-raised rounded" />
        <div className="h-5 w-16 bg-surface-raised rounded" />
        <div className="h-5 w-16 bg-surface-raised rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border border-border rounded-lg overflow-hidden"
        >
          <div className="h-10 bg-surface-raised" />
          <div className="p-3 space-y-2">
            <div className="h-4 w-3/4 bg-surface-raised rounded" />
            <div className="h-4 w-1/2 bg-surface-raised rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
