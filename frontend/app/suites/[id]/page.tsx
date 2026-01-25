'use client'

import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  FileText,
  Layers,
  StopCircle,
  Target,
  XCircle,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import {
  SuiteHeader,
  SuiteHeaderSkeleton,
} from '@/components/suites/suite-header'
import { useSuite } from '@/hooks/use-suites'

interface SuiteDetailPageProps {
  params: Promise<{ id: string }>
}

export default function SuiteDetailPage({ params }: SuiteDetailPageProps) {
  const { id } = use(params)
  const { data: suite, isLoading, error } = useSuite(id)

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-8">
        <SuiteHeaderSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ConfigCardSkeleton />
            <ConfigCardSkeleton />
          </div>
          <div className="space-y-6">
            <ConfigCardSkeleton />
          </div>
        </div>
      </div>
    )
  }

  // 404 state
  if (error || !suite) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Suite Not Found</h2>
        <p className="mt-2 text-gray-500 text-center max-w-md">
          The suite you're looking for doesn't exist or you don't have access to
          it.
        </p>
        <Link href="/suites" className="btn btn-primary mt-6">
          Back to Suites
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SuiteHeader suite={suite} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agent Configuration */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-primary-500" />
              Agent Configuration
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem
                label="Agent ID"
                value={suite.agent_id}
                icon={<Bot className="w-4 h-4" />}
              />
              <InfoItem
                label="Default Min Score"
                value={`${(suite.default_min_score * 100).toFixed(0)}%`}
                icon={<Target className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* Scoring Configuration */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-accent-500" />
              Default Scorers
            </h2>
            {suite.default_scorers && suite.default_scorers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suite.default_scorers.map((scorer) => (
                  <span key={scorer} className="badge badge-primary capitalize">
                    {scorer.replace('_', ' ')}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                No default scorers configured. Individual cases will define
                their own scorers.
              </p>
            )}
          </div>

          {/* Test Cases */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-500" />
                Test Cases
              </h2>
              <span className="text-sm text-gray-500">
                {suite.cases?.length || 0} total
              </span>
            </div>
            {suite.cases && suite.cases.length > 0 ? (
              <div className="space-y-3">
                {suite.cases.map((testCase) => (
                  <div
                    key={testCase.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">
                          {testCase.name}
                        </h4>
                        {testCase.description && (
                          <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                            {testCase.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {testCase.scorers?.map((scorer) => (
                            <span
                              key={scorer}
                              className="badge badge-gray text-xs capitalize"
                            >
                              {scorer.replace('_', ' ')}
                            </span>
                          ))}
                          {testCase.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="badge badge-accent text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span className="text-sm text-gray-500">
                          {(testCase.min_score * 100).toFixed(0)}% min
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-gray-300" />
                <p className="mt-3 text-gray-500">No test cases yet</p>
                <Link
                  href={`/suites/${suite.id}/edit`}
                  className="btn btn-secondary mt-4 inline-flex"
                >
                  Add Test Cases
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Settings */}
        <div className="space-y-6">
          {/* Execution Settings */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-primary-500" />
              Execution Settings
            </h2>
            <div className="space-y-4">
              <SettingItem
                icon={<Clock className="w-4 h-4" />}
                label="Default Timeout"
                value={`${suite.default_timeout_seconds}s`}
              />
              <SettingItem
                icon={
                  suite.parallel ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )
                }
                label="Parallel Execution"
                value={suite.parallel ? 'Enabled' : 'Disabled'}
                valueClass={
                  suite.parallel ? 'text-emerald-600' : 'text-gray-500'
                }
              />
              <SettingItem
                icon={
                  suite.stop_on_failure ? (
                    <StopCircle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  )
                }
                label="Stop on Failure"
                value={suite.stop_on_failure ? 'Yes' : 'No'}
                valueClass={
                  suite.stop_on_failure ? 'text-amber-600' : 'text-emerald-600'
                }
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Details
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">
                  {formatDistanceToNow(new Date(suite.created_at), {
                    addSuffix: true,
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900">
                  {formatDistanceToNow(new Date(suite.updated_at), {
                    addSuffix: true,
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Suite ID</dt>
                <dd className="text-gray-900 font-mono text-xs truncate max-w-[150px]">
                  {suite.id}
                </dd>
              </div>
            </dl>
          </div>

          {/* Quick Tips */}
          <div className="card p-6 bg-gradient-to-br from-primary-50 to-accent-50 border-primary-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <AlertTriangle className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Quick Tip</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Click &quot;Run&quot; to trigger a new evaluation. Results
                  will be available in the Runs section.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper Components

interface InfoItemProps {
  label: string
  value: string
  icon?: React.ReactNode
}

function InfoItem({ label, value, icon }: InfoItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {icon && (
        <div className="p-2 bg-white rounded-md shadow-sm text-gray-400">
          {icon}
        </div>
      )}
      <div>
        <dt className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </dt>
        <dd className="mt-0.5 font-medium text-gray-900 truncate max-w-[200px]">
          {value}
        </dd>
      </div>
    </div>
  )
}

interface SettingItemProps {
  icon: React.ReactNode
  label: string
  value: string
  valueClass?: string
}

function SettingItem({ icon, label, value, valueClass }: SettingItemProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-600">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-medium ${valueClass || 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

function ConfigCardSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 bg-gray-200 rounded" />
        <div className="h-5 w-32 bg-gray-200 rounded" />
      </div>
      <div className="space-y-3">
        <div className="h-12 bg-gray-100 rounded-lg" />
        <div className="h-12 bg-gray-100 rounded-lg" />
      </div>
    </div>
  )
}
