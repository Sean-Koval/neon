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
  GitBranch,
  Route,
  Target,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
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
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    planning: {
      icon: Target,
      label: 'Planning',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    tool_selection: {
      icon: GitBranch,
      label: 'Tool Selection',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    branching: {
      icon: GitBranch,
      label: 'Branch',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    termination: {
      icon: CheckCircle,
      label: 'Termination',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
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
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-300',
    },
    failure: {
      icon: XCircle,
      label: 'Failed',
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-300',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
    },
    unknown: {
      icon: AlertCircle,
      label: 'Unknown',
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-300',
    },
  }
  return configs[outcome]
}

function getConfidenceColor(confidence?: number): string {
  if (confidence === undefined) return 'text-gray-500'
  if (confidence >= 0.8) return 'text-emerald-600'
  if (confidence >= 0.5) return 'text-amber-600'
  return 'text-rose-600'
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// =============================================================================
// Decision Node Component
// =============================================================================

interface DecisionNodeProps {
  node: DecisionNode
  level: number
  isLast: boolean
  onNodeClick?: (node: DecisionNode) => void
  selectedNodeId?: string
}

function DecisionNodeView({
  node,
  level,
  isLast,
  onNodeClick,
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

  return (
    <div className="relative">
      {/* Connection line */}
      {level > 0 && (
        <div
          className={clsx(
            'absolute top-0 -left-6 h-4 border-l-2 border-b-2 rounded-bl-lg',
            isLast ? 'border-gray-200' : 'border-gray-200',
          )}
          style={{ width: '24px' }}
        />
      )}

      {/* Node */}
      <div
        className={clsx(
          'border rounded-lg overflow-hidden transition-all cursor-pointer',
          outcomeConfig.borderColor,
          isSelected && 'ring-2 ring-primary-500',
          node.isRootCause && 'ring-2 ring-rose-500',
        )}
        onClick={() => onNodeClick?.(node)}
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
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
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
                  ? 'bg-rose-100'
                  : node.confidence < 0.8
                    ? 'bg-amber-100'
                    : 'bg-emerald-100',
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
        <div className="px-3 py-2 bg-white">
          {/* Question and answer */}
          <div className="text-sm">
            <p className="text-gray-500">{node.question}</p>
            <p className="font-medium text-gray-900 flex items-center gap-1 mt-0.5">
              <ArrowRight className="w-3 h-3 text-gray-400" />
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                {node.chosenOption}
              </code>
            </p>
          </div>

          {/* Reason */}
          {node.reason && (
            <p className="text-xs text-gray-500 mt-1 italic">{node.reason}</p>
          )}

          {/* Duration */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
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
          </div>

          {/* Alternatives toggle */}
          {hasAlternatives && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowAlternatives(!showAlternatives)
              }}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
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
                    className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                  >
                    <code className="text-gray-600">{alt.option}</code>
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
  selectedNodeId?: string
}

export function DecisionTree({
  tree,
  onNodeClick,
  selectedNodeId,
}: DecisionTreeProps) {
  if (tree.roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <GitBranch className="w-12 h-12 mb-4 text-gray-300" />
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
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Decisions:</span>
          <span className="font-semibold">{tree.totalDecisions}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-emerald-600">
            {tree.successPaths}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-500" />
          <span className="font-semibold text-rose-600">
            {tree.failedPaths}
          </span>
        </div>
        {tree.avgConfidence > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Avg Confidence:</span>
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

      {/* Tree */}
      <div className="space-y-4">
        {tree.roots.map((root, idx) => (
          <DecisionNodeView
            key={root.id}
            node={root}
            level={0}
            isLast={idx === tree.roots.length - 1}
            onNodeClick={onNodeClick}
            selectedNodeId={selectedNodeId}
          />
        ))}
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
        <div className="h-5 w-24 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          <div className="h-10 bg-gray-100" />
          <div className="p-3 space-y-2">
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
