'use client'

import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useState } from 'react'
import { CONFIG } from '@/lib/config'

/**
 * Expandable panel explaining statistical concepts used in the dashboard.
 */
export function StatisticalGuidance() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-800">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          Statistical Guidance
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-dark-700 pt-3">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Score Interpretation</h4>
            <p>
              Scores range from 0 to 1. A score of{' '}
              <span className="font-medium text-emerald-600">0.9+</span> indicates
              excellent performance,{' '}
              <span className="font-medium text-amber-600">
                {CONFIG.DASHBOARD_SCORE_THRESHOLD}–0.9
              </span>{' '}
              is acceptable, and below{' '}
              <span className="font-medium text-rose-600">
                {CONFIG.DASHBOARD_SCORE_THRESHOLD}
              </span>{' '}
              suggests the agent needs improvement.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Pass Rate</h4>
            <p>
              The percentage of test cases that met or exceeded the minimum score
              threshold ({CONFIG.DEFAULT_MIN_SCORE}). A pass rate of 100% means every
              test case in the suite passed.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Regression Detection</h4>
            <p>
              A regression is flagged when the current score drops significantly below the
              baseline (historical average). Severity is based on the magnitude of the
              drop: high (&gt;20%), medium (10–20%), or low (5–10%).
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Score Trends</h4>
            <p>
              Trend charts show daily average scores over time. The dashed threshold line
              at {CONFIG.DASHBOARD_SCORE_THRESHOLD} marks the pass/fail boundary.
              Consistent scores above this line indicate stable performance.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
