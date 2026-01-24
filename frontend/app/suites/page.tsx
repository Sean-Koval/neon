'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function SuitesPage() {
  const { data: suitesData, isLoading } = useQuery({
    queryKey: ['suites'],
    queryFn: () => api.getSuites(),
  })
  const suites = suitesData?.items ?? []

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eval Suites</h1>
          <p className="text-gray-500">Manage your evaluation test suites</p>
        </div>
        <button
          type="button"
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Suite</span>
        </button>
      </div>

      <div className="card divide-y divide-gray-200">
        {suites.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              No suites yet
            </h3>
            <p className="mt-2 text-gray-500">
              Create your first eval suite to start testing your agents.
            </p>
          </div>
        ) : (
          suites.map((suite) => (
            <Link
              key={suite.id}
              href={`/suites/${suite.id}`}
              className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <FileText className="w-8 h-8 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{suite.name}</p>
                  <p className="text-sm text-gray-500">
                    {suite.description || `Agent: ${suite.agent_id}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {suite.cases?.length || 0} cases
                  </p>
                  <p className="text-sm text-gray-500">
                    {suite.default_scorers?.join(', ')}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
