'use client'

/**
 * Skills Evaluation Dashboard
 *
 * Displays skill evaluation results, regression tracking, and
 * per-skill performance metrics.
 */

import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle,
  Filter,
  Minus,
  RefreshCw,
  Search,
  Settings,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import {
  type SkillEvalSummary,
  useSkillEvalDetail,
  useSkillEvalHistory,
  useSkillEvalSummaries,
  useSkillRegressions,
} from '@/hooks/use-skill-eval'

// =============================================================================
// Helpers
// =============================================================================

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()

  if (diff < 60 * 1000) return 'just now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getTrendIcon(trend: SkillEvalSummary['trend']) {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="w-4 h-4 text-emerald-500" />
    case 'regressing':
      return <TrendingDown className="w-4 h-4 text-rose-500" />
    case 'stable':
      return <Minus className="w-4 h-4 text-gray-400" />
  }
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-emerald-600'
  if (score >= 0.7) return 'text-amber-600'
  return 'text-rose-600'
}

function getScoreBgColor(score: number): string {
  if (score >= 0.9) return 'bg-emerald-100'
  if (score >= 0.7) return 'bg-amber-100'
  return 'bg-rose-100'
}

// =============================================================================
// Components
// =============================================================================

function SkillCard({
  skill,
  onClick,
}: {
  skill: SkillEvalSummary
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{skill.skillName}</h3>
          <p className="text-sm text-gray-500 font-mono">{skill.skillId}</p>
        </div>
        <div className="flex items-center gap-2">
          {getTrendIcon(skill.trend)}
          {skill.regressionCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 rounded-full">
              {skill.regressionCount} regressions
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500">Pass Rate</p>
          <p
            className={clsx(
              'text-lg font-semibold',
              getScoreColor(skill.passRate),
            )}
          >
            {formatPercent(skill.passRate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Score</p>
          <p
            className={clsx(
              'text-lg font-semibold',
              getScoreColor(skill.avgScore),
            )}
          >
            {formatPercent(skill.avgScore)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Latency</p>
          <p className="text-lg font-semibold text-gray-700">
            {formatDuration(skill.avgLatencyMs)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Evals</p>
          <p className="text-lg font-semibold text-gray-700">
            {skill.totalEvals}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>Last evaluated {formatRelativeTime(skill.lastEvalDate)}</span>
        <span className="text-primary-600">View details →</span>
      </div>
    </button>
  )
}

function RegressionAlert({
  regression,
}: {
  regression: {
    skillId: string
    skillName: string
    severity: 'high' | 'medium' | 'low'
    delta: number
    baselineScore: number
    currentScore: number
    detectedAt: Date
    affectedTests: number
  }
}) {
  const severityStyles = {
    high: 'border-rose-200 bg-rose-50',
    medium: 'border-amber-200 bg-amber-50',
    low: 'border-gray-200 bg-gray-50',
  }

  const severityIconStyles = {
    high: 'text-rose-600',
    medium: 'text-amber-600',
    low: 'text-gray-500',
  }

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border',
        severityStyles[regression.severity],
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={clsx(
            'w-5 h-5 mt-0.5',
            severityIconStyles[regression.severity],
          )}
        />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">
              {regression.skillName}
            </h4>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(regression.detectedAt)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              Score: {formatPercent(regression.baselineScore)} →{' '}
              {formatPercent(regression.currentScore)}
            </span>
            <span
              className={clsx(
                'flex items-center gap-1 font-medium',
                regression.delta < 0 ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {regression.delta < 0 ? (
                <ArrowDown className="w-3 h-3" />
              ) : (
                <ArrowUp className="w-3 h-3" />
              )}
              {formatPercent(Math.abs(regression.delta))}
            </span>
            <span className="text-gray-500">
              {regression.affectedTests} tests affected
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryStats({ skills }: { skills: SkillEvalSummary[] }) {
  const totalEvals = skills.reduce((sum, s) => sum + s.totalEvals, 0)
  const avgPassRate =
    skills.length > 0
      ? skills.reduce((sum, s) => sum + s.passRate, 0) / skills.length
      : 0
  const _avgScore =
    skills.length > 0
      ? skills.reduce((sum, s) => sum + s.avgScore, 0) / skills.length
      : 0
  const totalRegressions = skills.reduce((sum, s) => sum + s.regressionCount, 0)

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <Zap className="w-4 h-4" />
          <span className="text-sm">Total Skills</span>
        </div>
        <p className="mt-2 text-2xl font-bold text-gray-900">{skills.length}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm">Total Evaluations</span>
        </div>
        <p className="mt-2 text-2xl font-bold text-gray-900">
          {totalEvals.toLocaleString()}
        </p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Avg Pass Rate</span>
        </div>
        <p
          className={clsx(
            'mt-2 text-2xl font-bold',
            getScoreColor(avgPassRate),
          )}
        >
          {formatPercent(avgPassRate)}
        </p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">Active Regressions</span>
        </div>
        <p
          className={clsx(
            'mt-2 text-2xl font-bold',
            totalRegressions > 0 ? 'text-rose-600' : 'text-emerald-600',
          )}
        >
          {totalRegressions}
        </p>
      </div>
    </div>
  )
}

function SkillDetailModal({
  skillId,
  onClose,
}: {
  skillId: string
  onClose: () => void
}) {
  const { data: history, isLoading: historyLoading } =
    useSkillEvalHistory(skillId)
  const latestEvalId = history?.evaluations[history.evaluations.length - 1]?.id
  const { data: detail, isLoading: detailLoading } = useSkillEvalDetail(
    latestEvalId || skillId,
  )

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {detail?.skillName || skillId}
              </h2>
              <p className="text-sm text-gray-500 font-mono">{skillId}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <XCircle className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {historyLoading || detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 w-48 bg-gray-200 rounded" />
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded" />
                ))}
              </div>
              <div className="h-40 bg-gray-100 rounded" />
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Pass Rate</p>
                  <p
                    className={clsx(
                      'text-2xl font-bold',
                      getScoreColor(detail.passRate),
                    )}
                  >
                    {formatPercent(detail.passRate)}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Avg Score</p>
                  <p
                    className={clsx(
                      'text-2xl font-bold',
                      getScoreColor(detail.avgScore),
                    )}
                  >
                    {formatPercent(detail.avgScore)}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Avg Latency</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {formatDuration(detail.avgLatencyMs)}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Version</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {detail.version}
                  </p>
                </div>
              </div>

              {/* Baseline comparison */}
              {detail.baselineScore !== undefined && (
                <div
                  className={clsx(
                    'p-4 rounded-lg flex items-center gap-3',
                    detail.isRegression
                      ? 'bg-rose-50 border border-rose-200'
                      : 'bg-emerald-50 border border-emerald-200',
                  )}
                >
                  {detail.isRegression ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  )}
                  <div>
                    <p
                      className={clsx(
                        'font-medium',
                        detail.isRegression
                          ? 'text-rose-700'
                          : 'text-emerald-700',
                      )}
                    >
                      {detail.isRegression
                        ? 'Regression Detected'
                        : 'Performance Stable'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Baseline: {formatPercent(detail.baselineScore)} → Current:{' '}
                      {formatPercent(detail.avgScore)}
                    </p>
                  </div>
                </div>
              )}

              {/* Test Results */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Test Results</h3>
                <div className="space-y-3">
                  {detail.testResults.map((test) => (
                    <div
                      key={test.id}
                      className={clsx(
                        'p-4 rounded-lg border',
                        test.passed
                          ? 'bg-white border-gray-200'
                          : 'bg-rose-50 border-rose-200',
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {test.passed ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-rose-500" />
                          )}
                          <span className="font-medium">{test.name}</span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatDuration(test.latencyMs)}
                        </span>
                      </div>

                      {/* Scores */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {test.scores.map((score) => (
                          <div
                            key={score.name}
                            className={clsx(
                              'px-2 py-1 rounded text-xs',
                              getScoreBgColor(score.value),
                              getScoreColor(score.value),
                            )}
                            title={score.reason}
                          >
                            {score.name}: {formatPercent(score.value)}
                          </div>
                        ))}
                      </div>

                      {/* Error message */}
                      {test.error && (
                        <div className="mt-2 p-2 bg-rose-100 rounded text-sm text-rose-700 font-mono">
                          {test.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* History Preview */}
              {history && history.evaluations.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Recent Evaluations
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-gray-500">
                            Version
                          </th>
                          <th className="text-left py-2 font-medium text-gray-500">
                            Date
                          </th>
                          <th className="text-right py-2 font-medium text-gray-500">
                            Pass Rate
                          </th>
                          <th className="text-right py-2 font-medium text-gray-500">
                            Avg Score
                          </th>
                          <th className="text-right py-2 font-medium text-gray-500">
                            Latency
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.evaluations
                          .slice(-5)
                          .reverse()
                          .map((eval_) => (
                            <tr key={eval_.id} className="border-b">
                              <td className="py-2 font-mono">
                                {eval_.version}
                              </td>
                              <td className="py-2 text-gray-500">
                                {eval_.timestamp.toLocaleDateString()}
                              </td>
                              <td
                                className={clsx(
                                  'py-2 text-right',
                                  getScoreColor(eval_.passRate),
                                )}
                              >
                                {formatPercent(eval_.passRate)}
                              </td>
                              <td
                                className={clsx(
                                  'py-2 text-right',
                                  getScoreColor(eval_.avgScore),
                                )}
                              >
                                {formatPercent(eval_.avgScore)}
                              </td>
                              <td className="py-2 text-right text-gray-600">
                                {formatDuration(eval_.avgLatencyMs)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">No evaluation data available</p>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [filterTrend, setFilterTrend] = useState<
    'all' | 'improving' | 'stable' | 'regressing'
  >('all')

  const {
    data: skills = [],
    isLoading: skillsLoading,
    refetch: refetchSkills,
  } = useSkillEvalSummaries()
  const { data: regressions = [], isLoading: regressionsLoading } =
    useSkillRegressions()

  const filteredSkills = skills.filter((skill) => {
    if (
      searchQuery &&
      !skill.skillName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !skill.skillId.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false
    }
    if (filterTrend !== 'all' && skill.trend !== filterTrend) {
      return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Skills Evaluation
              </h1>
              <p className="mt-1 text-gray-500">
                Track skill performance, parameter accuracy, and result quality
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refetchSkills()}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                <Settings className="w-4 h-4" />
                Configure
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Stats */}
        {!skillsLoading && <SummaryStats skills={skills} />}

        {/* Regressions Alert */}
        {regressions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Active Regressions
            </h2>
            <div className="space-y-3">
              {regressions.map((reg) => (
                <RegressionAlert key={reg.skillId} regression={reg} />
              ))}
            </div>
          </div>
        )}

        {/* Skills Grid */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">All Skills</h2>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={filterTrend}
                  onChange={(e) =>
                    setFilterTrend(e.target.value as typeof filterTrend)
                  }
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none bg-white"
                >
                  <option value="all">All trends</option>
                  <option value="improving">Improving</option>
                  <option value="stable">Stable</option>
                  <option value="regressing">Regressing</option>
                </select>
              </div>
            </div>
          </div>

          {skillsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-white rounded-lg border border-gray-200 animate-pulse"
                >
                  <div className="h-5 w-32 bg-gray-200 rounded" />
                  <div className="mt-2 h-4 w-24 bg-gray-100 rounded" />
                  <div className="mt-4 grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j}>
                        <div className="h-3 w-12 bg-gray-100 rounded" />
                        <div className="mt-1 h-6 w-16 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <Zap className="w-12 h-12 mx-auto text-gray-300" />
              <p className="mt-4 text-gray-500">
                No skills found matching your criteria
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.skillId}
                  skill={skill}
                  onClick={() => setSelectedSkill(skill.skillId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <SkillDetailModal
          skillId={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </div>
  )
}
