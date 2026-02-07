'use client'

import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

/**
 * Expandable panel explaining statistical concepts used in comparison views.
 */
export function StatisticalGuidance() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-blue-50 border-b border-blue-200 hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">
            Statistical Guidance
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-blue-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-600" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 text-sm">
          {/* Significance */}
          <div>
            <h4 className="font-medium text-gray-900 mb-1">
              Statistical Significance
            </h4>
            <p className="text-gray-600">
              A p-value below <strong>0.05</strong> means the difference is
              statistically significant — unlikely to be due to random chance.
            </p>
          </div>

          {/* Effect Size */}
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Effect Size</h4>
            <p className="text-gray-600">
              Cohen&apos;s d measures practical impact. Values above{' '}
              <strong>0.1</strong> are practically meaningful.
            </p>
            <div className="mt-1 grid grid-cols-4 gap-1 text-xs">
              <span className="px-2 py-1 bg-gray-100 rounded text-gray-600 text-center">
                &lt;0.2 negligible
              </span>
              <span className="px-2 py-1 bg-yellow-50 rounded text-yellow-700 text-center">
                &lt;0.5 small
              </span>
              <span className="px-2 py-1 bg-orange-50 rounded text-orange-700 text-center">
                &lt;0.8 medium
              </span>
              <span className="px-2 py-1 bg-red-50 rounded text-red-700 text-center">
                &ge;0.8 large
              </span>
            </div>
          </div>

          {/* Score Interpretation */}
          <div>
            <h4 className="font-medium text-gray-900 mb-1">
              Score Interpretation
            </h4>
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-gray-700">
                  <strong>0.8 – 1.0:</strong> Excellent
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-gray-700">
                  <strong>0.6 – 0.8:</strong> Good
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="text-gray-700">
                  <strong>0.0 – 0.6:</strong> Needs work
                </span>
              </div>
            </div>
          </div>

          {/* Confidence Intervals */}
          <div>
            <h4 className="font-medium text-gray-900 mb-1">
              Confidence Intervals
            </h4>
            <p className="text-gray-600">
              A 95% CI shows the range where the true value likely falls. If two
              CIs don&apos;t overlap, the difference is likely significant.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
