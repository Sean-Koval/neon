'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { GitCompare, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '@/lib/api'
import type { CompareResponse } from '@/lib/types'

export default function ComparePage() {
  const [baselineId, setBaselineId] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [threshold, setThreshold] = useState(0.05)

  const { data: runsData } = useQuery({
    queryKey: ['runs'],
    queryFn: () => api.getRuns(),
  })

  const compareMutation = useMutation({
    mutationFn: () => api.compare({
      baseline_run_id: baselineId,
      candidate_run_id: candidateId,
      threshold,
    }),
  })

  const runs = runsData?.items
  const comparison: CompareResponse | undefined = compareMutation.data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compare Runs</h1>
        <p className="text-gray-500">Identify regressions between agent versions</p>
      </div>

      {/* Comparison form */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Baseline Run
            </label>
            <select
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">Select baseline...</option>
              {runs?.map((run: any) => (
                <option key={run.id} value={run.id}>
                  {run.suite_name} - {run.agent_version || run.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Candidate Run
            </label>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">Select candidate...</option>
              {runs?.map((run: any) => (
                <option key={run.id} value={run.id}>
                  {run.suite_name} - {run.agent_version || run.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Threshold
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              step="0.01"
              min="0"
              max="1"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => compareMutation.mutate()}
            disabled={!baselineId || !candidateId || compareMutation.isPending}
            className="btn btn-primary flex items-center space-x-2"
          >
            <GitCompare className="w-4 h-4" />
            <span>{compareMutation.isPending ? 'Comparing...' : 'Compare'}</span>
          </button>
        </div>
      </div>

      {/* Comparison results */}
      {comparison && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-gray-500">
                  {comparison.baseline.agent_version || comparison.baseline.id.slice(0, 8)}
                </span>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900 font-medium">
                  {comparison.candidate.agent_version || comparison.candidate.id.slice(0, 8)}
                </span>
              </div>
              <div className={`badge ${comparison.passed ? 'badge-green' : 'badge-red'}`}>
                {comparison.passed ? 'PASSED' : 'REGRESSION DETECTED'}
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-8">
              <div>
                <span className="text-sm text-gray-500">Overall Delta</span>
                <p className={`text-2xl font-bold ${comparison.overall_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {comparison.overall_delta >= 0 ? '+' : ''}{comparison.overall_delta.toFixed(4)}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Regressions</span>
                <p className="text-2xl font-bold text-red-600">{comparison.regressions.length}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Improvements</span>
                <p className="text-2xl font-bold text-green-600">{comparison.improvements.length}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Unchanged</span>
                <p className="text-2xl font-bold text-gray-600">{comparison.unchanged}</p>
              </div>
            </div>
          </div>

          {/* Regressions */}
          {comparison.regressions.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-red-600 flex items-center space-x-2">
                  <TrendingDown className="w-5 h-5" />
                  <span>Regressions ({comparison.regressions.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {comparison.regressions.map((r: any, i: number) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{r.case_name}</p>
                      <p className="text-sm text-gray-500">{r.scorer}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500">{r.baseline_score.toFixed(2)}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{r.candidate_score.toFixed(2)}</span>
                      <span className="text-red-600 font-medium">
                        {r.delta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvements */}
          {comparison.improvements.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-green-600 flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5" />
                  <span>Improvements ({comparison.improvements.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {comparison.improvements.map((i: any, idx: number) => (
                  <div key={idx} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{i.case_name}</p>
                      <p className="text-sm text-gray-500">{i.scorer}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500">{i.baseline_score.toFixed(2)}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{i.candidate_score.toFixed(2)}</span>
                      <span className="text-green-600 font-medium">
                        +{i.delta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
