'use client'

import { BookOpen, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useCallback, useState } from 'react'

const DISMISSED_KEY = 'neon:compare:guidance-dismissed'

function getInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(DISMISSED_KEY) === 'true'
}

interface StatisticalGuidanceProps {
  /** When true, renders the "Show statistical guidance" restore link instead of managing internally */
  onDismissChange?: (dismissed: boolean) => void
}

/**
 * Expandable panel explaining statistical concepts used in comparison views.
 * Dismissable with localStorage persistence.
 */
export function StatisticalGuidance({ onDismissChange }: StatisticalGuidanceProps) {
  const [isDismissed, setIsDismissed] = useState(getInitialDismissed)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleDismiss = useCallback(() => {
    setIsDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
    onDismissChange?.(true)
  }, [onDismissChange])

  const handleRestore = useCallback(() => {
    setIsDismissed(false)
    localStorage.removeItem(DISMISSED_KEY)
    onDismissChange?.(false)
  }, [onDismissChange])

  if (isDismissed) {
    return (
      <button
        type="button"
        onClick={handleRestore}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline transition-colors"
      >
        Show statistical guidance
      </button>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/15 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Statistical Guidance
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-4 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/15 transition-colors"
          title="Dismiss guidance"
        >
          <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 text-sm">
          {/* Significance */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              Statistical Significance
            </h4>
            <p className="text-gray-600 dark:text-gray-300">
              A p-value below <strong>0.05</strong> means the difference is
              statistically significant — unlikely to be due to random chance.
            </p>
          </div>

          {/* Effect Size */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Effect Size</h4>
            <p className="text-gray-600 dark:text-gray-300">
              Cohen&apos;s d measures practical impact. Values above{' '}
              <strong>0.1</strong> are practically meaningful.
            </p>
            <div className="mt-1 grid grid-cols-4 gap-1 text-xs">
              <span className="px-2 py-1 bg-gray-100 dark:bg-dark-800 rounded text-gray-600 dark:text-gray-300 text-center">
                &lt;0.2 negligible
              </span>
              <span className="px-2 py-1 bg-yellow-50 dark:bg-amber-500/10 rounded text-yellow-700 dark:text-amber-400 text-center">
                &lt;0.5 small
              </span>
              <span className="px-2 py-1 bg-orange-50 dark:bg-orange-500/10 rounded text-orange-700 dark:text-orange-400 text-center">
                &lt;0.8 medium
              </span>
              <span className="px-2 py-1 bg-red-50 dark:bg-red-500/10 rounded text-red-700 dark:text-red-400 text-center">
                &ge;0.8 large
              </span>
            </div>
          </div>

          {/* Score Interpretation */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              Score Interpretation
            </h4>
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>0.8 – 1.0:</strong> Excellent
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>0.6 – 0.8:</strong> Good
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="text-gray-700 dark:text-gray-300">
                  <strong>0.0 – 0.6:</strong> Needs work
                </span>
              </div>
            </div>
          </div>

          {/* Confidence Intervals */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              Confidence Intervals
            </h4>
            <p className="text-gray-600 dark:text-gray-300">
              A 95% CI shows the range where the true value likely falls. If two
              CIs don&apos;t overlap, the difference is likely significant.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
