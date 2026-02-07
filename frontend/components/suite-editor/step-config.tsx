'use client'

import type { ScorerType } from '@/lib/types'
import { ALL_SCORERS, type SuiteFormData } from './types'

interface StepConfigProps {
  data: SuiteFormData
  onChange: (updates: Partial<SuiteFormData>) => void
}

export function StepConfig({ data, onChange }: StepConfigProps) {
  const toggleScorer = (scorer: ScorerType) => {
    const current = data.default_scorers
    const updated = current.includes(scorer)
      ? current.filter((s) => s !== scorer)
      : [...current, scorer]
    onChange({ default_scorers: updated })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-zinc-100">Default Configuration</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Set defaults that apply to all test cases unless overridden.
        </p>
      </div>

      {/* Scorers */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Default Scorers
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_SCORERS.map((scorer) => {
            const active = data.default_scorers.includes(scorer.value)
            return (
              <button
                key={scorer.value}
                type="button"
                onClick={() => toggleScorer(scorer.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {scorer.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Min score */}
      <div>
        <label htmlFor="min-score" className="block text-sm font-medium text-zinc-300">
          Minimum Pass Score: {data.default_min_score}
        </label>
        <input
          id="min-score"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={data.default_min_score}
          onChange={(e) => onChange({ default_min_score: Number.parseFloat(e.target.value) })}
          className="mt-2 w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>0 (permissive)</span>
          <span>1 (strict)</span>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label htmlFor="timeout" className="block text-sm font-medium text-zinc-300">
          Default Timeout (seconds)
        </label>
        <input
          id="timeout"
          type="number"
          min={1}
          max={3600}
          value={data.default_timeout_seconds}
          onChange={(e) => onChange({ default_timeout_seconds: Number.parseInt(e.target.value, 10) || 120 })}
          className="mt-1 block w-32 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.parallel}
            onChange={(e) => onChange({ parallel: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm font-medium text-zinc-200">Run cases in parallel</span>
            <p className="text-xs text-zinc-500">Execute test cases concurrently for faster results</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.stop_on_failure}
            onChange={(e) => onChange({ stop_on_failure: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm font-medium text-zinc-200">Stop on first failure</span>
            <p className="text-xs text-zinc-500">Halt execution immediately when a case fails</p>
          </div>
        </label>
      </div>
    </div>
  )
}
