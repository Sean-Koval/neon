'use client'

/**
 * Failure Cascade Component
 *
 * Visualizes cascading failures across agents, showing how
 * one agent's failure propagated to downstream agents.
 */

import { clsx } from 'clsx'
import {
  AlertCircle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import type { CascadeChain } from '@/lib/multi-agent-analysis'

// =============================================================================
// Component
// =============================================================================

interface FailureCascadeProps {
  chains: CascadeChain[]
  onSpanClick?: (spanId: string) => void
}

export function FailureCascade({ chains, onSpanClick }: FailureCascadeProps) {
  const [expandedChains, setExpandedChains] = useState<Set<number>>(
    new Set([0]), // Expand first chain by default
  )

  const toggleChain = (index: number) => {
    const newExpanded = new Set(expandedChains)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedChains(newExpanded)
  }

  if (chains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <AlertCircle className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
        <p className="font-medium">No cascading failures detected</p>
        <p className="text-sm">All agent failures appear to be isolated</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500">Cascade chains:</span>
        <span className="font-semibold text-rose-600 dark:text-rose-400">{chains.length}</span>
        <span className="text-gray-500">Total impact:</span>
        <span className="font-semibold text-rose-600 dark:text-rose-400">
          {chains.reduce((sum, c) => sum + c.impactScore, 0)} affected agents
        </span>
      </div>

      {/* Chains */}
      <div className="space-y-3">
        {chains.map((chain, idx) => {
          const isExpanded = expandedChains.has(idx)

          return (
            <div
              key={idx}
              className="border border-rose-200 dark:border-rose-500/25 rounded-lg overflow-hidden"
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => toggleChain(idx)}
                className="w-full px-4 py-3 bg-rose-50 dark:bg-rose-500/10 flex items-center gap-3 hover:bg-rose-100 dark:hover:bg-rose-500/15 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-rose-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-rose-500" />
                )}
                <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <div className="flex-1 text-left">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Root: {chain.rootCause.agentId}
                  </span>
                  {chain.rootCause.errorMessage && (
                    <span className="ml-2 text-sm text-rose-600 dark:text-rose-400">
                      — {chain.rootCause.errorMessage.slice(0, 50)}
                      {chain.rootCause.errorMessage.length > 50 ? '...' : ''}
                    </span>
                  )}
                </div>
                <span className="px-2 py-0.5 bg-rose-200 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 text-xs font-medium rounded">
                  {chain.impactScore} affected
                </span>
              </button>

              {/* Chain details */}
              {isExpanded && (
                <div className="p-4 bg-white dark:bg-dark-800">
                  {/* Root cause */}
                  <div
                    className={clsx(
                      'p-3 rounded-lg border-2 border-rose-400 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10',
                      onSpanClick && 'cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-500/15',
                    )}
                    onClick={() => onSpanClick?.(chain.rootCause.spanId)}
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      <span className="font-semibold text-rose-800 dark:text-rose-300">
                        Root Cause: {chain.rootCause.agentId}
                      </span>
                    </div>
                    {chain.rootCause.errorMessage && (
                      <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
                        {chain.rootCause.errorMessage}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-rose-500 font-mono">
                      Span: {chain.rootCause.spanId}
                    </p>
                  </div>

                  {/* Arrow */}
                  {chain.affectedAgents.length > 0 && (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="w-5 h-5 text-rose-400" />
                    </div>
                  )}

                  {/* Affected agents */}
                  <div className="space-y-2">
                    {chain.affectedAgents.map((affected, affIdx) => (
                      <div key={affIdx}>
                        <div
                          className={clsx(
                            'p-3 rounded-lg border border-rose-200 dark:border-rose-500/25 bg-rose-50/50 dark:bg-rose-500/5',
                            onSpanClick && 'cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-500/10',
                          )}
                          onClick={() => onSpanClick?.(affected.spanId)}
                        >
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-500" />
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {affected.agentId}
                            </span>
                          </div>
                          {affected.errorMessage && (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {affected.errorMessage}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400 font-mono">
                            Span: {affected.spanId}
                          </p>
                        </div>

                        {affIdx < chain.affectedAgents.length - 1 && (
                          <div className="flex justify-center py-1">
                            <ArrowDown className="w-4 h-4 text-rose-300" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function FailureCascadeSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          <div className="h-12 bg-rose-50 dark:bg-rose-500/10" />
          <div className="p-4 space-y-3">
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-12 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
