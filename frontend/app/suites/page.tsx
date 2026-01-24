'use client'

import { SuiteCard, SuiteCardSkeleton } from '@/components/suites/suite-card'
import { useSuites } from '@/hooks/use-suites'
import { FileText, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function SuitesPage() {
  const { data: suites, isLoading } = useSuites()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSuites = useMemo(() => {
    if (!suites) return []
    if (!searchQuery.trim()) return suites

    const query = searchQuery.toLowerCase()
    return suites.filter(
      (suite) =>
        suite.name.toLowerCase().includes(query) ||
        suite.description?.toLowerCase().includes(query)
    )
  }, [suites, searchQuery])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eval Suites</h1>
          <p className="mt-1 text-gray-500">Manage your evaluation test suites</p>
        </div>
        <Link href="/suites/new" className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>New Suite</span>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search suites by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <SuiteCardSkeleton key={`skeleton-${n}`} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && suites?.length === 0 && (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 mb-4">
            <FileText className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No suites yet</h3>
          <p className="mt-2 text-gray-500 max-w-md mx-auto">
            Create your first eval suite to start testing your agents with structured test cases and
            automated scoring.
          </p>
          <Link
            href="/suites/new"
            className="btn btn-primary inline-flex items-center space-x-2 mt-6"
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Suite</span>
          </Link>
        </div>
      )}

      {/* No Search Results */}
      {!isLoading && suites && suites.length > 0 && filteredSuites.length === 0 && (
        <div className="card p-8 text-center">
          <Search className="w-12 h-12 mx-auto text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No suites match your search</h3>
          <p className="mt-2 text-gray-500">
            Try adjusting your search terms or{' '}
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-primary-600 hover:underline"
            >
              clear the search
            </button>
          </p>
        </div>
      )}

      {/* Suite Cards Grid */}
      {!isLoading && filteredSuites.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuites.map((suite) => (
            <SuiteCard key={suite.id} suite={suite} />
          ))}
        </div>
      )}
    </div>
  )
}
