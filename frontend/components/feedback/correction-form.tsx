'use client'

import { clsx } from 'clsx'
import {
  AlertCircle,
  Check,
  Edit3,
  FileText,
  Loader2,
  RefreshCw,
  Tag,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ResponseOption } from '@/lib/types'

// =============================================================================
// Correction Type Tags
// =============================================================================

const CORRECTION_TYPES = [
  { id: 'factual', label: 'Factual Error', color: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' },
  {
    id: 'incomplete',
    label: 'Incomplete',
    color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  },
  { id: 'tone', label: 'Tone/Style', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' },
  { id: 'clarity', label: 'Clarity', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' },
  {
    id: 'relevance',
    label: 'Relevance',
    color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  },
  { id: 'formatting', label: 'Formatting', color: 'bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-gray-300' },
] as const

interface CorrectionTypeTagsProps {
  selected: string[]
  onChange: (types: string[]) => void
  disabled: boolean
}

function CorrectionTypeTags({
  selected,
  onChange,
  disabled,
}: CorrectionTypeTagsProps) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((t) => t !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Tag className="w-4 h-4" />
        Correction Type (optional)
      </span>
      <div className="flex flex-wrap gap-2">
        {CORRECTION_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => toggle(type.id)}
            disabled={disabled}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              selected.includes(type.id)
                ? `${type.color} ring-2 ring-offset-1 ring-current`
                : 'bg-gray-50 dark:bg-dark-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Diff View Component
// =============================================================================

interface DiffViewProps {
  original: string
  corrected: string
}

function DiffView({ original, corrected }: DiffViewProps) {
  // Simple diff visualization - shows character count difference
  const charDiff = corrected.length - original.length
  const wordCountOriginal = original.split(/\s+/).filter(Boolean).length
  const wordCountCorrected = corrected.split(/\s+/).filter(Boolean).length
  const wordDiff = wordCountCorrected - wordCountOriginal

  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
      <span>
        Characters:{' '}
        <span
          className={clsx(
            charDiff > 0 && 'text-emerald-600 dark:text-emerald-400',
            charDiff < 0 && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {charDiff > 0 ? '+' : ''}
          {charDiff}
        </span>
      </span>
      <span>
        Words:{' '}
        <span
          className={clsx(
            wordDiff > 0 && 'text-emerald-600 dark:text-emerald-400',
            wordDiff < 0 && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {wordDiff > 0 ? '+' : ''}
          {wordDiff}
        </span>
      </span>
    </div>
  )
}

// =============================================================================
// Main Correction Form Component
// =============================================================================

export interface CorrectionFormProps {
  /** The response to correct */
  response: ResponseOption
  /** Optional prompt context */
  prompt?: string
  /** Callback when correction is submitted */
  onSubmit: (data: {
    correctedContent: string
    changeSummary?: string
    correctionTypes?: string[]
  }) => Promise<void>
  /** Callback to cancel */
  onCancel?: () => void
  /** Is submitting */
  isSubmitting?: boolean
}

export function CorrectionForm({
  response,
  prompt,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CorrectionFormProps) {
  const [correctedContent, setCorrectedContent] = useState(response.content)
  const [changeSummary, setChangeSummary] = useState('')
  const [correctionTypes, setCorrectionTypes] = useState<string[]>([])
  const [showSummary, setShowSummary] = useState(false)

  const hasChanges = correctedContent !== response.content
  const isValid = hasChanges && correctedContent.trim().length > 0

  const handleReset = useCallback(() => {
    setCorrectedContent(response.content)
    setChangeSummary('')
    setCorrectionTypes([])
    setShowSummary(false)
  }, [response.content])

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    await onSubmit({
      correctedContent,
      changeSummary: changeSummary || undefined,
      correctionTypes: correctionTypes.length > 0 ? correctionTypes : undefined,
    })
  }, [isValid, correctedContent, changeSummary, correctionTypes, onSubmit])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-primary-500" />
          Provide Correction
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Edit the response to improve it, then submit your correction
        </p>
      </div>

      {/* Original Prompt (if provided) */}
      {prompt && (
        <div className="card p-4 bg-gray-50 dark:bg-dark-900">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Original Prompt
          </span>
          <p className="mt-2 text-gray-900 dark:text-gray-100 text-sm">{prompt}</p>
        </div>
      )}

      {/* Original Response (collapsed reference) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-2">
          <span className="group-open:rotate-90 transition-transform">▶</span>
          View Original Response
          {response.source && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-2">
              ({response.source})
            </span>
          )}
        </summary>
        <div className="mt-2 p-4 bg-gray-50 dark:bg-dark-900 rounded-lg border border-gray-200 dark:border-dark-700">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
            {response.content}
          </pre>
        </div>
      </details>

      {/* Editable Content */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="corrected-content"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Corrected Response
          </label>
          {hasChanges && (
            <DiffView
              original={response.content}
              corrected={correctedContent}
            />
          )}
        </div>
        <textarea
          id="corrected-content"
          value={correctedContent}
          onChange={(e) => setCorrectedContent(e.target.value)}
          className={clsx(
            'w-full px-4 py-3 border rounded-lg text-sm font-mono dark:bg-dark-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors',
            hasChanges
              ? 'border-emerald-300 dark:border-emerald-500/25 bg-emerald-50/30 dark:bg-emerald-500/5'
              : 'border-gray-300 dark:border-dark-600',
            isSubmitting && 'opacity-50',
          )}
          rows={12}
          disabled={isSubmitting}
          placeholder="Edit the response here..."
        />
        {!hasChanges && (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Make changes to the response to enable submission
          </p>
        )}
      </div>

      {/* Correction Types */}
      {hasChanges && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <CorrectionTypeTags
            selected={correctionTypes}
            onChange={setCorrectionTypes}
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* Change Summary */}
      {hasChanges && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
          {!showSummary ? (
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              + Add change summary (optional)
            </button>
          ) : (
            <>
              <label
                htmlFor="change-summary"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Change Summary (optional)
              </label>
              <textarea
                id="change-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Briefly describe what you changed and why..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-sm dark:bg-dark-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                rows={2}
                disabled={isSubmitting}
              />
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-dark-700">
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasChanges || isSubmitting}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4" />
          Reset
        </button>

        <div className="flex gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Submit Correction
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Skeleton Loader
// =============================================================================

export function CorrectionFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-gray-200 dark:bg-dark-700 rounded" />
        <div className="h-4 w-72 bg-gray-200 dark:bg-dark-700 rounded" />
      </div>

      <div className="h-20 bg-gray-200 dark:bg-dark-700 rounded-lg" />

      <div className="h-6 w-40 bg-gray-200 dark:bg-dark-700 rounded" />

      <div className="space-y-2">
        <div className="h-5 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
        <div className="h-64 bg-gray-200 dark:bg-dark-700 rounded-lg" />
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-dark-700">
        <div className="h-10 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
        <div className="flex gap-3">
          <div className="h-10 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-10 w-36 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
      </div>
    </div>
  )
}
