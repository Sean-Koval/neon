'use client'

import { clsx } from 'clsx'
import { CheckCircle, Clock, MessageSquare, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface PreferenceSessionProps {
  agentId?: string
}

export function FeedbackPreferences({ agentId }: PreferenceSessionProps) {
  const { data: comparisons, isLoading } = trpc.feedback.comparisons.useQuery({ limit: 10 })
  const createFeedback = trpc.feedback.create.useMutation()
  const utils = trpc.useUtils()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<'A' | 'B' | 'tie' | 'both_bad' | null>(null)
  const [confidence, setConfidence] = useState(3)
  const [reason, setReason] = useState('')
  const [decisionTimeMs, setDecisionTimeMs] = useState(0)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [totalDecisionTimeMs, setTotalDecisionTimeMs] = useState(0)
  const [totalConfidence, setTotalConfidence] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)
  const startTimeRef = useRef(Date.now())

  const pairs = comparisons?.items ?? []
  const totalPairs = pairs.length
  const currentPair = pairs[currentIndex]

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now()
    setDecisionTimeMs(0)
    timerRef.current = setInterval(() => {
      setDecisionTimeMs(Date.now() - startTimeRef.current)
    }, 100)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentIndex])

  const handleChoice = useCallback((choice: 'A' | 'B' | 'tie' | 'both_bad') => {
    setSelectedChoice(choice)
    if (timerRef.current) clearInterval(timerRef.current)
    setDecisionTimeMs(Date.now() - startTimeRef.current)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!selectedChoice || !currentPair) return

    const time = Date.now() - startTimeRef.current
    await createFeedback.mutateAsync({
      type: 'preference',
      preference: {
        comparison_id: currentPair.id,
        choice: selectedChoice,
        reason: reason || undefined,
        confidence: confidence / 5,
        decision_time_ms: time,
      },
    })

    setCompletedCount((c) => c + 1)
    setTotalDecisionTimeMs((t) => t + time)
    setTotalConfidence((t) => t + confidence)

    // Reset and advance
    setSelectedChoice(null)
    setReason('')
    setConfidence(3)

    if (currentIndex + 1 >= totalPairs) {
      setSessionComplete(true)
    } else {
      setTimeout(() => setCurrentIndex((i) => i + 1), 300)
    }
  }, [selectedChoice, currentPair, reason, confidence, currentIndex, totalPairs, createFeedback])

  const handleStartNew = useCallback(() => {
    setCurrentIndex(0)
    setSessionComplete(false)
    setCompletedCount(0)
    setTotalDecisionTimeMs(0)
    setTotalConfidence(0)
    utils.feedback.comparisons.invalidate()
  }, [utils])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-2 bg-surface-overlay rounded-full w-full" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-surface-overlay rounded-xl" />
          <div className="h-64 bg-surface-overlay rounded-xl" />
        </div>
      </div>
    )
  }

  if (!pairs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
        <h3 className="text-lg font-medium text-content-primary">All comparisons reviewed</h3>
        <p className="text-sm text-content-muted mt-2 max-w-sm">
          You've reviewed all available pairs. New pairs are generated when agents produce new responses.
        </p>
      </div>
    )
  }

  if (sessionComplete) {
    const avgTime = completedCount > 0 ? (totalDecisionTimeMs / completedCount / 1000).toFixed(1) : '0'
    const avgConf = completedCount > 0 ? (totalConfidence / completedCount).toFixed(1) : '0'
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
        <h3 className="text-lg font-medium text-content-primary">
          Session complete! {completedCount}/{totalPairs} preferences recorded.
        </h3>
        <p className="text-sm text-content-muted mt-2">
          Avg decision time: {avgTime}s · Avg confidence: {avgConf}/5
        </p>
        <button type="button" onClick={handleStartNew} className="btn btn-primary mt-4">
          Start New Session
        </button>
      </div>
    )
  }

  if (!currentPair) return null

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm text-content-muted">
          <span>Session Progress</span>
          <span>{currentIndex + 1}/{totalPairs}</span>
        </div>
        <div className="h-2 bg-surface-overlay rounded-full">
          <div
            className="h-2 bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalPairs) * 100}%` }}
          />
        </div>
      </div>

      {/* Prompt */}
      <div className="bg-surface-overlay/30 rounded-lg p-4">
        <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">Prompt</span>
        <p className="mt-1 text-content-primary text-sm">{currentPair.prompt}</p>
        {currentPair.context && (
          <p className="mt-1 text-xs text-content-muted italic">Context: {currentPair.context}</p>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative">
        <button
          type="button"
          onClick={() => handleChoice('A')}
          disabled={createFeedback.isPending}
          className={clsx(
            'text-left rounded-xl border-2 p-4 transition-all',
            selectedChoice === 'A'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/5'
              : 'border-border hover:border-blue-300',
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
              Response A
            </span>
            {currentPair.responseA.source && (
              <span className="text-xs text-content-muted font-mono">{currentPair.responseA.source}</span>
            )}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-content-primary leading-relaxed bg-surface-overlay/30 p-3 rounded-lg max-h-72 overflow-auto">
            {currentPair.responseA.content}
          </pre>
          <div className="mt-3 text-center">
            <span className="btn btn-secondary text-xs">Choose A</span>
          </div>
        </button>

        {/* VS divider */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-content-muted bg-surface-card px-2 py-1 rounded-full z-10 hidden lg:block">
          VS
        </div>

        <button
          type="button"
          onClick={() => handleChoice('B')}
          disabled={createFeedback.isPending}
          className={clsx(
            'text-left rounded-xl border-2 p-4 transition-all',
            selectedChoice === 'B'
              ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/5'
              : 'border-border hover:border-purple-300',
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
              Response B
            </span>
            {currentPair.responseB.source && (
              <span className="text-xs text-content-muted font-mono">{currentPair.responseB.source}</span>
            )}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-content-primary leading-relaxed bg-surface-overlay/30 p-3 rounded-lg max-h-72 overflow-auto">
            {currentPair.responseB.content}
          </pre>
          <div className="mt-3 text-center">
            <span className="btn btn-secondary text-xs">Choose B</span>
          </div>
        </button>
      </div>

      {/* Secondary choices */}
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => handleChoice('tie')} className="btn btn-ghost text-sm">Tie</button>
        <button type="button" onClick={() => handleChoice('both_bad')} className="btn btn-ghost text-sm">Both Bad</button>
        <button type="button" onClick={() => { setSelectedChoice(null); setCurrentIndex((i) => Math.min(i + 1, totalPairs - 1)) }} className="btn btn-ghost text-sm">Skip</button>
      </div>

      {/* After selection: confidence + reason + submit */}
      {selectedChoice && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Reason */}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)..."
            className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500"
          />

          {/* Confidence stars */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-content-muted">Confidence:</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setConfidence(star)}
                  className="p-0.5"
                >
                  <Star
                    className={clsx(
                      'w-5 h-5',
                      star <= confidence ? 'text-amber-400 fill-amber-400' : 'text-content-muted',
                    )}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm text-content-muted">({confidence}/5)</span>
          </div>

          {/* Timer + Submit */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-content-muted">
              <Clock className="w-4 h-4" />
              <span>{formatTime(decisionTimeMs)}</span>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createFeedback.isPending}
              className="btn btn-primary"
            >
              {createFeedback.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
