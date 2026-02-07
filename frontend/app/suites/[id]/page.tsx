'use client'

import {
  AlertCircle,
  ArrowLeft,
  Clock,
  ListChecks,
  Loader2,
  RefreshCw,
  Settings,
  Tag,
  Target,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { safeFormatDistance } from '@/lib/format-date'

interface SuiteData {
  id: string
  name: string
  description?: string
  agent_id?: string
  default_scorers?: string[]
  default_min_score?: number
  default_timeout_seconds?: number
  parallel?: boolean
  stop_on_failure?: boolean
  created_at?: string
  updated_at?: string
}

interface CaseData {
  id: string
  name: string
  description?: string
  input?: Record<string, unknown>
  expected_tools?: string[]
  expected_tool_sequence?: string[]
  expected_output_contains?: string[]
  expected_output_pattern?: string
  scorers?: string[]
  min_score?: number
  tags?: string[]
  timeout_seconds?: number
}

export default function SuiteDetailPage() {
  const params = useParams()
  const suiteId = typeof params.id === 'string' ? params.id : ''

  const {
    data: suiteData,
    isLoading: suiteLoading,
    error: suiteError,
    refetch: refetchSuite,
  } = trpc.suites.get.useQuery({ suiteId }, { enabled: !!suiteId })

  const {
    data: casesData,
    isLoading: casesLoading,
    error: casesError,
    refetch: refetchCases,
  } = trpc.suites.listCases.useQuery({ suiteId }, { enabled: !!suiteId })

  const suite = suiteData as SuiteData | undefined
  const cases: CaseData[] = Array.isArray(casesData)
    ? casesData
    : (casesData as { items?: CaseData[]; cases?: CaseData[] })?.items ??
      (casesData as { cases?: CaseData[] })?.cases ??
      []

  const isLoading = suiteLoading || casesLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (suiteError || !suite) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-medium mb-2">Suite not found</h2>
        <p className="text-gray-500 mb-4">
          {suiteError?.message || 'The evaluation suite could not be loaded.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => refetchSuite()}
            className="btn btn-secondary inline-flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <Link href="/suites" className="text-primary-600 hover:text-primary-800">
            Back to suites
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/suites" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{suite.name}</h1>
          {suite.description && (
            <p className="text-gray-500 mt-1">{suite.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { refetchSuite(); refetchCases(); }}
          className="btn btn-secondary inline-flex items-center gap-2"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Agent ID</p>
          <p className="text-sm font-mono truncate">{suite.agent_id || 'Not set'}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Min Score</p>
          <p className="text-sm font-medium">{suite.default_min_score ?? 0.7}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Timeout</p>
          <p className="text-sm">{suite.default_timeout_seconds ?? 30}s</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Created</p>
          <p className="text-sm">
            {suite.created_at ? safeFormatDistance(suite.created_at) : 'Unknown'}
          </p>
        </div>
      </div>

      {/* Execution Config */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1">
          <Settings className="w-4 h-4" />
          {suite.parallel !== false ? 'Parallel execution' : 'Sequential execution'}
        </span>
        {suite.stop_on_failure && (
          <span className="text-amber-600">Stop on failure enabled</span>
        )}
      </div>

      {/* Default Scorers */}
      {suite.default_scorers && suite.default_scorers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Default Scorers
          </h2>
          <div className="flex flex-wrap gap-2">
            {suite.default_scorers.map((scorer) => (
              <span
                key={scorer}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
              >
                {scorer.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Test Cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ListChecks className="w-5 h-5" />
            Test Cases
            {cases.length > 0 && (
              <span className="text-sm font-normal text-gray-500">({cases.length})</span>
            )}
          </h2>
        </div>

        {casesError ? (
          <div className="card p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">Failed to load test cases</p>
            <p className="text-xs text-gray-500 mt-1">{casesError.message}</p>
            <button
              type="button"
              onClick={() => refetchCases()}
              className="mt-3 btn btn-secondary text-sm inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : cases.length === 0 ? (
          <div className="card p-8 text-center">
            <ListChecks className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No test cases defined for this suite.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((testCase) => (
              <TestCaseCard key={testCase.id} testCase={testCase} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TestCaseCard({ testCase }: { testCase: CaseData }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900">{testCase.name}</h3>
        {testCase.min_score != null && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            min: {testCase.min_score}
          </span>
        )}
      </div>

      {testCase.description && (
        <p className="text-sm text-gray-500 mb-2">{testCase.description}</p>
      )}

      {testCase.expected_output_contains && testCase.expected_output_contains.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-400 mb-1">Expected output contains:</p>
          <div className="flex flex-wrap gap-1">
            {testCase.expected_output_contains.map((text, i) => (
              <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                {text}
              </span>
            ))}
          </div>
        </div>
      )}

      {testCase.expected_tools && testCase.expected_tools.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-400 mb-1">Expected tools:</p>
          <div className="flex flex-wrap gap-1">
            {testCase.expected_tools.map((tool) => (
              <span key={tool} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {testCase.tags && testCase.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {testCase.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        {testCase.scorers && testCase.scorers.length > 0 && (
          <span>{testCase.scorers.length} scorer{testCase.scorers.length !== 1 ? 's' : ''}</span>
        )}
        {testCase.timeout_seconds && (
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {testCase.timeout_seconds}s timeout
          </span>
        )}
      </div>
    </div>
  )
}
