'use client'

/**
 * Span Diff Detail Component
 *
 * Shows detailed field-by-field comparison for a selected span.
 */

import { clsx } from 'clsx'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { getSpanTypeConfig } from '@/components/traces/span-type-badge'
import type { FieldDiff, SpanDiff } from './types'

interface SpanDiffDetailProps {
  diff: SpanDiff
  onClose?: () => void
}

/**
 * Format value for display
 */
function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString()
    return value.toFixed(4)
  }
  return String(value)
}

/**
 * Get diff status color
 */
function getDiffColor(baseline: unknown, candidate: unknown) {
  if (baseline === undefined || baseline === null) return 'added'
  if (candidate === undefined || candidate === null) return 'removed'
  if (baseline !== candidate) return 'modified'
  return 'unchanged'
}

/**
 * Collapsible section
 */
function Section({
  title,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <span className="font-medium text-sm flex-1">{title}</span>
        {badge}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/**
 * Field diff row
 */
function FieldRow({ field }: { field: FieldDiff }) {
  const status = getDiffColor(field.baselineValue, field.candidateValue)

  const statusStyles = {
    added: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: Plus,
    },
    removed: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: Minus,
    },
    modified: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: ArrowRight,
    },
    unchanged: {
      bg: '',
      text: 'text-gray-500',
      icon: null,
    },
  }

  const styles = statusStyles[status]
  const Icon = styles.icon

  return (
    <div
      className={clsx(
        'flex items-center py-2 text-sm gap-3 rounded px-2 -mx-2',
        field.changed && styles.bg,
      )}
    >
      <div className="w-28 sm:w-32 text-gray-500 flex-shrink-0 capitalize">
        {field.field.replace(/_/g, ' ')}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {/* Baseline value */}
        <div
          className={clsx(
            'flex-1 text-right truncate',
            status === 'removed' && 'line-through',
            field.baselineValue == null
              ? 'text-gray-400 italic'
              : 'text-gray-600',
          )}
        >
          {formatValue(field.baselineValue)}
        </div>

        {/* Arrow */}
        {Icon ? (
          <Icon className={clsx('w-4 h-4 flex-shrink-0', styles.text)} />
        ) : (
          <ArrowRight className="w-4 h-4 flex-shrink-0 text-gray-300" />
        )}

        {/* Candidate value */}
        <div
          className={clsx(
            'flex-1 truncate font-medium',
            field.candidateValue == null
              ? 'text-gray-400 italic'
              : 'text-gray-900',
          )}
        >
          {formatValue(field.candidateValue)}
        </div>
      </div>
    </div>
  )
}

/**
 * Copyable code block with diff highlighting
 */
function DiffCodeBlock({
  baseline,
  candidate,
  label,
}: {
  baseline: string | undefined
  candidate: string | undefined
  label: string
}) {
  const [copied, setCopied] = useState<'baseline' | 'candidate' | null>(null)

  const handleCopy = async (value: string, which: 'baseline' | 'candidate') => {
    await navigator.clipboard.writeText(value)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  // Try to format as JSON
  const formatJson = (str: string | undefined) => {
    if (!str) return str
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  const formattedBaseline = formatJson(baseline)
  const formattedCandidate = formatJson(candidate)

  if (!baseline && !candidate) return null

  return (
    <Section title={label} defaultOpen={false}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Baseline */}
        <div className="relative group">
          <div className="text-xs font-medium text-gray-500 mb-1">Baseline</div>
          {baseline ? (
            <>
              <div className="absolute top-6 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={() => handleCopy(baseline, 'baseline')}
                  className="p-1.5 bg-white/90 hover:bg-white rounded border shadow-sm"
                  title="Copy"
                >
                  {copied === 'baseline' ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </button>
              </div>
              <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto font-mono max-h-64 overflow-y-auto">
                <code>{formattedBaseline}</code>
              </pre>
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-400 italic">
              Not present
            </div>
          )}
        </div>

        {/* Candidate */}
        <div className="relative group">
          <div className="text-xs font-medium text-gray-500 mb-1">
            Candidate
          </div>
          {candidate ? (
            <>
              <div className="absolute top-6 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={() => handleCopy(candidate, 'candidate')}
                  className="p-1.5 bg-white/90 hover:bg-white rounded border shadow-sm"
                  title="Copy"
                >
                  {copied === 'candidate' ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </button>
              </div>
              <pre className="bg-green-50 rounded-lg p-3 text-xs overflow-x-auto font-mono max-h-64 overflow-y-auto">
                <code>{formattedCandidate}</code>
              </pre>
            </>
          ) : (
            <div className="bg-red-50 rounded-lg p-3 text-sm text-gray-400 italic">
              Not present
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

export function SpanDiffDetail({ diff, onClose }: SpanDiffDetailProps) {
  const span = diff.candidate || diff.baseline
  if (!span) return null

  const typeConfig = getSpanTypeConfig(span.span_type)
  const TypeIcon = typeConfig.icon

  // Get status badge
  const statusBadge = {
    added: { bg: 'bg-green-100', text: 'text-green-700', label: 'Added' },
    removed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Removed' },
    modified: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Modified' },
    unchanged: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unchanged' },
  }[diff.status]

  // Count changed fields
  const changedCount = diff.fieldDiffs.filter((f) => f.changed).length

  return (
    <div className="h-full flex flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TypeIcon
            className={clsx('w-5 h-5 flex-shrink-0', typeConfig.textColor)}
          />
          <h3 className="font-medium truncate" title={span.name}>
            {span.tool_name || span.model || span.name}
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-500 ml-2 flex-shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Status banner */}
      <div
        className={clsx(
          'flex items-center gap-2 px-4 py-2 border-b',
          statusBadge.bg,
        )}
      >
        <span className={clsx('text-sm font-medium', statusBadge.text)}>
          {statusBadge.label}
        </span>
        {changedCount > 0 &&
          diff.status !== 'added' &&
          diff.status !== 'removed' && (
            <span className="text-sm text-gray-600">
              — {changedCount} field{changedCount !== 1 ? 's' : ''} changed
            </span>
          )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Field differences */}
        <Section
          title="Field Comparison"
          badge={
            changedCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                {changedCount} changed
              </span>
            )
          }
        >
          <div className="space-y-1">
            {diff.fieldDiffs.map((field) => (
              <FieldRow key={field.field} field={field} />
            ))}
          </div>
        </Section>

        {/* Input/Output diff for LLM generations */}
        {span.span_type === 'generation' && (
          <>
            <DiffCodeBlock
              baseline={diff.baseline?.input}
              candidate={diff.candidate?.input}
              label="Input (Prompt)"
            />
            <DiffCodeBlock
              baseline={diff.baseline?.output}
              candidate={diff.candidate?.output}
              label="Output (Response)"
            />
          </>
        )}

        {/* Tool input/output diff */}
        {span.span_type === 'tool' && (
          <>
            <DiffCodeBlock
              baseline={diff.baseline?.tool_input}
              candidate={diff.candidate?.tool_input}
              label="Tool Input"
            />
            <DiffCodeBlock
              baseline={diff.baseline?.tool_output}
              candidate={diff.candidate?.tool_output}
              label="Tool Output"
            />
          </>
        )}

        {/* Generic input/output for other types */}
        {!['generation', 'tool'].includes(span.span_type) && (
          <>
            <DiffCodeBlock
              baseline={diff.baseline?.input}
              candidate={diff.candidate?.input}
              label="Input"
            />
            <DiffCodeBlock
              baseline={diff.baseline?.output}
              candidate={diff.candidate?.output}
              label="Output"
            />
          </>
        )}

        {/* Match score for modified spans */}
        {diff.matchScore !== undefined && diff.status === 'modified' && (
          <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-500">
            Match confidence: {Math.round(diff.matchScore * 100)}%
          </div>
        )}
      </div>
    </div>
  )
}
