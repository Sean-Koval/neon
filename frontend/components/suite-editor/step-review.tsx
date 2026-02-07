'use client'

import { AlertCircle, CheckCircle } from 'lucide-react'
import type { SuiteFormData } from './types'

interface StepReviewProps {
  data: SuiteFormData
}

export function StepReview({ data }: StepReviewProps) {
  const issues: string[] = []
  if (!data.name.trim()) issues.push('Suite name is required')
  if (!data.agent_id.trim()) issues.push('Agent ID is required')
  if (data.default_scorers.length === 0)
    issues.push('At least one default scorer is required')
  if (data.cases.length === 0) issues.push('At least one test case is required')

  for (let i = 0; i < data.cases.length; i++) {
    const c = data.cases[i]
    if (!c.name.trim()) issues.push(`Case ${i + 1} is missing a name`)
    if (Object.keys(c.input).length === 0)
      issues.push(`Case ${i + 1} has empty input`)
    if (c.scorers.length === 0)
      issues.push(`Case ${i + 1} has no scorers selected`)
  }

  const isValid = issues.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-zinc-100">Review Suite</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Review your configuration before creating the suite.
        </p>
      </div>

      {/* Validation */}
      {!isValid && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-2">
            <AlertCircle className="h-4 w-4" />
            Issues to resolve
          </div>
          <ul className="space-y-1">
            {issues.map((issue) => (
              <li
                key={issue}
                className="text-sm text-amber-300/80 ml-6 list-disc"
              >
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isValid && (
        <div className="rounded-lg border border-green-700/50 bg-green-900/20 p-4">
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            Suite is ready to create
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-zinc-700 divide-y divide-zinc-700">
        <div className="p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">Suite Info</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Name</dt>
            <dd className="text-zinc-200">{data.name || '—'}</dd>
            <dt className="text-zinc-500">Agent</dt>
            <dd className="text-zinc-200 font-mono">{data.agent_id || '—'}</dd>
            <dt className="text-zinc-500">Description</dt>
            <dd className="text-zinc-200">{data.description || '—'}</dd>
          </dl>
        </div>

        <div className="p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">
            Configuration
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Scorers</dt>
            <dd className="text-zinc-200">
              {data.default_scorers.length > 0
                ? data.default_scorers.join(', ')
                : '—'}
            </dd>
            <dt className="text-zinc-500">Min Score</dt>
            <dd className="text-zinc-200">{data.default_min_score}</dd>
            <dt className="text-zinc-500">Timeout</dt>
            <dd className="text-zinc-200">{data.default_timeout_seconds}s</dd>
            <dt className="text-zinc-500">Parallel</dt>
            <dd className="text-zinc-200">{data.parallel ? 'Yes' : 'No'}</dd>
            <dt className="text-zinc-500">Stop on Failure</dt>
            <dd className="text-zinc-200">
              {data.stop_on_failure ? 'Yes' : 'No'}
            </dd>
          </dl>
        </div>

        <div className="p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">
            Test Cases ({data.cases.length})
          </h4>
          {data.cases.length === 0 ? (
            <p className="text-sm text-zinc-500">No cases defined</p>
          ) : (
            <ul className="space-y-2">
              {data.cases.map((c, i) => (
                <li
                  key={`review-${i}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="text-zinc-500 shrink-0">{i + 1}.</span>
                  <div>
                    <span className="text-zinc-200">
                      {c.name || '(untitled)'}
                    </span>
                    <span className="text-zinc-500 ml-2">
                      {c.scorers.length} scorer
                      {c.scorers.length !== 1 ? 's' : ''}, min {c.min_score}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
