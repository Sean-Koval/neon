'use client'

import { useQuery } from '@tanstack/react-query'
import { Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'

export default function RunsPage() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: () => api.getRuns(),
  })

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eval Runs</h1>
          <p className="text-gray-500">View evaluation run history</p>
        </div>
        <button className="btn btn-primary flex items-center space-x-2">
          <Play className="w-4 h-4" />
          <span>New Run</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <select className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option>All Suites</option>
        </select>
        <select className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option>All Status</option>
          <option>Completed</option>
          <option>Running</option>
          <option>Failed</option>
        </select>
      </div>

      {/* Runs table */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Run
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Results
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {runs?.map((run: any) => (
              <tr key={run.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link href={`/runs/${run.id}`} className="hover:underline">
                    <div>
                      <p className="font-medium text-gray-900">{run.suite_name}</p>
                      <p className="text-sm text-gray-500">
                        {run.agent_version || 'No version'}
                      </p>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {run.summary && (
                    <span className="text-sm">
                      <span className="text-green-600">{run.summary.passed}</span>
                      /
                      <span className="text-gray-600">{run.summary.total_cases}</span>
                      {' passed'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {run.summary && (
                    <ScoreBadge score={run.summary.avg_score} />
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {run.created_at && formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    running: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
    pending: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100' },
    cancelled: { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100' },
  }

  const { icon: Icon, color, bg } = config[status as keyof typeof config] || config.pending

  return (
    <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
      <Icon className="w-3 h-3" />
      <span>{status}</span>
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 0.8 ? 'text-green-600' : score >= 0.6 ? 'text-yellow-600' : 'text-red-600'

  return (
    <span className={`font-medium ${color}`}>
      {score.toFixed(2)}
    </span>
  )
}
