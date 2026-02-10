'use client'

/**
 * Eval Run Results Component
 *
 * Displays the results of individual eval cases within a run.
 */

import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  XCircle,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

/**
 * Score from an evaluation
 */
interface Score {
  name: string
  value: number
  reason?: string
}

/**
 * Result from a single eval case
 */
interface EvalCaseResult {
  caseIndex: number
  result: {
    traceId: string
    status: string
    iterations: number
    reason?: string
  }
  scores: Score[]
}

interface EvalRunResultsProps {
  results: EvalCaseResult[]
  showAll?: boolean
}

/**
 * Format score as percentage with color
 */
function ScoreBadge({ value }: { value: number }) {
  const percentage = Math.round(value * 100)
  const color =
    percentage >= 80
      ? 'bg-green-100 dark:bg-emerald-500/20 text-green-800 dark:text-emerald-300'
      : percentage >= 60
        ? 'bg-yellow-100 dark:bg-amber-500/20 text-yellow-800 dark:text-amber-300'
        : 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300'

  return (
    <span className={`px-2 py-0.5 rounded text-sm font-medium ${color}`}>
      {percentage}%
    </span>
  )
}

/**
 * Single result row
 */
function ResultRow({
  result,
  isExpanded,
  onToggle,
}: {
  result: EvalCaseResult
  isExpanded: boolean
  onToggle: () => void
}) {
  const passed = result.result.status === 'completed'
  const avgScore =
    result.scores.length > 0
      ? result.scores.reduce((sum, s) => sum + s.value, 0) /
        result.scores.length
      : 0

  return (
    <div className="border-b last:border-b-0">
      {/* Row header */}
      <div
        className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-700 cursor-pointer"
        onClick={onToggle}
      >
        <button className="mr-3 text-gray-400 dark:text-gray-500">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 flex items-center gap-3">
          {passed ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
          <span className="font-medium">Case #{result.caseIndex + 1}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <Zap className="w-4 h-4" />
            {result.result.iterations} iter
          </div>
          <ScoreBadge value={avgScore} />
          <Link
            href={`/traces/${result.result.traceId}`}
            className="text-blue-500 hover:text-blue-700"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 py-4 bg-gray-50 dark:bg-dark-900 border-t">
          {/* Scores */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scores</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.scores.map((score) => (
                <div
                  key={score.name}
                  className="bg-white dark:bg-dark-800 rounded-lg p-3 border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{score.name}</span>
                    <ScoreBadge value={score.value} />
                  </div>
                  {score.reason && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {score.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Status info */}
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Status: </span>
              <span
                className={
                  passed
                    ? 'text-green-600 dark:text-emerald-400 font-medium'
                    : 'text-red-600 dark:text-red-400 font-medium'
                }
              >
                {result.result.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Trace ID: </span>
              <code className="text-xs bg-gray-200 dark:bg-dark-700 px-1.5 py-0.5 rounded">
                {result.result.traceId}
              </code>
            </div>
          </div>

          {/* Reason (if failed) */}
          {result.result.reason && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded">
              <p className="text-sm text-red-800 dark:text-red-300">{result.result.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function EvalRunResults({
  results,
  showAll = false,
}: EvalRunResultsProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedRows(new Set(results.map((_, i) => i)))
  }

  const collapseAll = () => {
    setExpandedRows(new Set())
  }

  // Filter results
  const filteredResults = results.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'passed') return r.result.status === 'completed'
    return r.result.status !== 'completed'
  })

  // Calculate summary
  const passed = results.filter((r) => r.result.status === 'completed').length
  const failed = results.length - passed

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-900 border-b">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">Results</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {results.length} cases •{' '}
            <span className="text-green-600 dark:text-emerald-400">{passed} passed</span> •{' '}
            <span className="text-red-600 dark:text-red-400">{failed} failed</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="all">All ({results.length})</option>
            <option value="passed">Passed ({passed})</option>
            <option value="failed">Failed ({failed})</option>
          </select>

          {/* Expand/Collapse */}
          <button
            onClick={expandAll}
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            Expand all
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Results list */}
      <div className="divide-y">
        {filteredResults.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No results to display
          </div>
        ) : (
          filteredResults.map((result, index) => (
            <ResultRow
              key={result.caseIndex}
              result={result}
              isExpanded={expandedRows.has(index)}
              onToggle={() => toggleRow(index)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default EvalRunResults
