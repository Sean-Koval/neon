'use client'

import { clsx } from 'clsx'
import { AlertCircle, Check, Loader2, RefreshCw, SkipForward } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

const CORRECTION_TYPES = [
  { id: 'factual', label: 'Factual Error' },
  { id: 'hallucination', label: 'Hallucination' },
  { id: 'incomplete', label: 'Incomplete' },
  { id: 'wrong_tool', label: 'Wrong Tool' },
  { id: 'tone', label: 'Style/Tone' },
  { id: 'formatting', label: 'Formatting' },
] as const

interface FeedbackCorrectionsProps {
  agentId?: string
}

export function FeedbackCorrections({ agentId }: FeedbackCorrectionsProps) {
  const { data: comparisons, isLoading } = trpc.feedback.comparisons.useQuery({ limit: 10 })
  const createFeedback = trpc.feedback.create.useMutation()
  const utils = trpc.useUtils()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [correctedContent, setCorrectedContent] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [changeSummary, setChangeSummary] = useState('')
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const pairs = comparisons?.items ?? []
  const currentPair = pairs[currentIndex]
  const originalContent = currentPair?.responseA.content ?? ''

  // Initialize corrected content when pair loads
  if (currentPair && !initialized) {
    setCorrectedContent(originalContent)
    setInitialized(true)
  }

  const hasChanges = correctedContent !== originalContent
  const isValid = hasChanges && correctedContent.trim().length > 0 && selectedTypes.length > 0

  const diffStats = useMemo(() => {
    const origChars = originalContent.length
    const corrChars = correctedContent.length
    const origWords = originalContent.split(/\s+/).filter(Boolean).length
    const corrWords = correctedContent.split(/\s+/).filter(Boolean).length
    return {
      charDiff: corrChars - origChars,
      wordDiff: corrWords - origWords,
      origChars,
      corrChars,
      origWords,
      corrWords,
    }
  }, [originalContent, correctedContent])

  const toggleType = useCallback((id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!isValid || !currentPair) return
    await createFeedback.mutateAsync({
      type: 'correction',
      correction: {
        response_id: currentPair.responseA.id,
        original_content: originalContent,
        corrected_content: correctedContent,
        change_summary: changeSummary || undefined,
        correction_types: selectedTypes,
      },
    })

    // Reset and advance
    setCorrectedContent('')
    setSelectedTypes([])
    setChangeSummary('')
    setInitialized(false)

    if (currentIndex + 1 < pairs.length) {
      setCurrentIndex((i) => i + 1)
    }
    utils.feedback.list.invalidate()
  }, [isValid, currentPair, originalContent, correctedContent, changeSummary, selectedTypes, currentIndex, pairs.length, createFeedback, utils])

  const handleSkip = useCallback(() => {
    setCorrectedContent('')
    setSelectedTypes([])
    setChangeSummary('')
    setInitialized(false)
    if (currentIndex + 1 < pairs.length) {
      setCurrentIndex((i) => i + 1)
    }
  }, [currentIndex, pairs.length])

  const handleReset = useCallback(() => {
    setCorrectedContent(originalContent)
    setSelectedTypes([])
    setChangeSummary('')
  }, [originalContent])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 bg-surface-overlay rounded-lg" />
        <div className="h-40 bg-surface-overlay rounded-lg" />
        <div className="h-10 bg-surface-overlay rounded-lg w-48" />
      </div>
    )
  }

  if (!currentPair) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Check className="w-10 h-10 text-emerald-500 mb-3" />
        <h3 className="text-lg font-medium text-content-primary">No responses to correct</h3>
        <p className="text-sm text-content-muted mt-2 max-w-sm">
          All available responses have been reviewed. New responses appear when agents produce traces.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Original Response (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setIsOriginalExpanded(!isOriginalExpanded)}
          className="text-sm font-medium text-content-secondary hover:text-content-primary flex items-center gap-2"
        >
          <span className={clsx('transition-transform', isOriginalExpanded && 'rotate-90')}>&#9654;</span>
          Original Response
          <span className="text-xs text-content-muted font-normal">
            ({currentPair.responseA.source || 'unknown source'})
          </span>
        </button>
        {isOriginalExpanded && (
          <div className="mt-2 bg-surface-overlay/30 rounded-md p-3">
            <pre className="whitespace-pre-wrap font-mono text-sm text-content-secondary">
              {originalContent}
            </pre>
          </div>
        )}
      </div>

      {/* Corrected Response */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="corrected" className="text-sm font-medium text-content-primary">
            Corrected Response *
          </label>
          {hasChanges && (
            <div className="text-xs text-content-muted flex items-center gap-3">
              <span>
                Chars: {diffStats.origChars} → {diffStats.corrChars}{' '}
                <span className={diffStats.charDiff > 0 ? 'text-emerald-500' : diffStats.charDiff < 0 ? 'text-rose-500' : ''}>
                  ({diffStats.charDiff > 0 ? '+' : ''}{diffStats.charDiff})
                </span>
              </span>
              <span>
                Words: {diffStats.origWords} → {diffStats.corrWords}{' '}
                <span className={diffStats.wordDiff > 0 ? 'text-emerald-500' : diffStats.wordDiff < 0 ? 'text-rose-500' : ''}>
                  ({diffStats.wordDiff > 0 ? '+' : ''}{diffStats.wordDiff})
                </span>
              </span>
            </div>
          )}
        </div>
        <textarea
          id="corrected"
          value={correctedContent}
          onChange={(e) => setCorrectedContent(e.target.value)}
          className={clsx(
            'w-full font-mono text-sm min-h-[150px] resize-y rounded-lg border p-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500 transition-colors',
            hasChanges ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border',
          )}
          placeholder="Edit the response here..."
        />
        {!hasChanges && (
          <p className="text-xs text-content-muted flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Make changes to enable submission
          </p>
        )}
      </div>

      {/* Correction Type tags */}
      {hasChanges && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium text-content-primary">
            Correction Type * <span className="text-xs text-content-muted font-normal">(select all that apply)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {CORRECTION_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleType(type.id)}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-md border transition-all',
                  selectedTypes.includes(type.id)
                    ? 'bg-primary-500/10 text-primary-500 border-primary-500'
                    : 'bg-surface-overlay/30 text-content-muted border-border hover:border-content-muted',
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Change Summary */}
      {hasChanges && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <label htmlFor="summary" className="text-sm font-medium text-content-primary block mb-1">
            Change Summary
          </label>
          <input
            id="summary"
            type="text"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. Fixed founding date claim"
            className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasChanges}
          className="flex items-center gap-2 text-sm text-content-muted hover:text-content-primary disabled:opacity-30"
        >
          <RefreshCw className="w-4 h-4" />
          Reset
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={handleSkip} className="btn btn-ghost text-sm">
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || createFeedback.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {createFeedback.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
            ) : (
              <><Check className="w-4 h-4" /> Submit Correction</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
