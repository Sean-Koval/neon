'use client'

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  Search,
  Shield,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useState } from 'react'

interface EvidenceLink {
  type: string
  sourceSpanId: string
  targetSpanId?: string
  description: string
  strength: number
}

interface Hypothesis {
  id: string
  rank: number
  confidence: number
  category: 'root_cause' | 'contributing_factor' | 'systemic_issue'
  summary: string
  evidenceChain: EvidenceLink[]
  affectedSpans: string[]
  remediation?: {
    action: string
    description: string
    confidence: number
  }
  statisticalBasis: {
    method: string
    strength: number
    sampleSize: number
  }
}

interface RcaAnalysis {
  hypotheses: Hypothesis[]
  analysisTimestamp: string
  traceId: string
}

interface RcaOverlayProps {
  traceId: string
}

const CATEGORY_CONFIG = {
  root_cause: {
    label: 'Root Cause',
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/25',
    icon: Zap,
  },
  contributing_factor: {
    label: 'Contributing Factor',
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/25',
    icon: AlertTriangle,
  },
  systemic_issue: {
    label: 'Systemic Issue',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/25',
    icon: Shield,
  },
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color =
    confidence >= 0.8
      ? 'bg-emerald-500'
      : confidence >= 0.6
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-10 text-right">
        {pct}%
      </span>
    </div>
  )
}

function EvidenceChain({ evidence }: { evidence: EvidenceLink[] }) {
  return (
    <div className="space-y-2">
      {evidence.map((link, i) => (
        <div
          key={`${link.sourceSpanId}-${i}`}
          className="flex items-start gap-2 text-sm"
        >
          <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
          <div>
            <span className="text-gray-600 dark:text-gray-300">{link.description}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {link.type.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                strength: {Math.round(link.strength * 100)}%
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function HypothesisCard({ hypothesis }: { hypothesis: Hypothesis }) {
  const [expanded, setExpanded] = useState(false)
  const config = CATEGORY_CONFIG[hypothesis.category]
  const CategoryIcon = config.icon

  return (
    <div className="card border border-gray-200 dark:border-dark-700">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-lg font-semibold text-gray-400 dark:text-gray-500 mt-0.5">
              #{hypothesis.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
                >
                  <CategoryIcon className="w-3 h-3" />
                  {config.label}
                </span>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                {hypothesis.summary}
              </p>
              <div className="mt-2 max-w-xs">
                <ConfidenceBar confidence={hypothesis.confidence} />
              </div>
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-1" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-dark-700 pt-3">
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Evidence Chain
            </h4>
            <EvidenceChain evidence={hypothesis.evidenceChain} />
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>
              Method: {hypothesis.statisticalBasis.method.replace(/_/g, ' ')}
            </span>
            <span>
              Sample size: {hypothesis.statisticalBasis.sampleSize}
            </span>
            <span>
              Affected spans: {hypothesis.affectedSpans.length}
            </span>
          </div>

          {hypothesis.remediation && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 rounded-lg">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Suggested Remediation
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {hypothesis.remediation.description}
                  </p>
                  <span className="text-xs text-emerald-600 mt-1 inline-block">
                    Confidence: {Math.round(hypothesis.remediation.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RcaOverlay({ traceId }: RcaOverlayProps) {
  const [analysis, setAnalysis] = useState<RcaAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const runAnalysis = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setIsOpen(true)

    try {
      const res = await fetch(`/api/traces/${traceId}/analyze`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Analysis failed')
      }

      const data = await res.json()
      setAnalysis(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsLoading(false)
    }
  }, [traceId])

  return (
    <>
      <button
        type="button"
        onClick={runAnalysis}
        disabled={isLoading}
        className="btn btn-secondary text-sm"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Search className="w-4 h-4" />
        )}
        {isLoading ? 'Analyzing...' : 'Analyze Root Cause'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsOpen(false)}
            onKeyDown={() => {}}
            role="presentation"
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-dark-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Root Cause Analysis
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Trace {traceId.slice(0, 8)}...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {isLoading && (
                <div className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Analyzing trace for root causes...
                  </p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              {analysis && !isLoading && (
                <>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                    <span>
                      {analysis.hypotheses.length} hypothes{analysis.hypotheses.length === 1 ? 'is' : 'es'} found
                    </span>
                    <span>
                      {new Date(analysis.analysisTimestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {analysis.hypotheses.map((h) => (
                    <HypothesisCard key={h.id} hypothesis={h} />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
