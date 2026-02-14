'use client'

import { clsx } from 'clsx'
import {
  ArrowLeft,
  Bot,
  Minus,
  Server,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { use, useState } from 'react'
import { AgentContextRow } from '@/components/agents/agent-context-row'
import {
  AgentHeader,
  type AgentHeaderData,
} from '@/components/agents/agent-header'
import { AgentOverview } from '@/components/agents/agent-overview'
import { AgentQuickStats } from '@/components/agents/agent-quick-stats'
import { AgentTracesTab } from '@/components/agents/agent-traces-tab'
import { RegisterAgentModal } from '@/components/agents/register-agent-modal'
import { VersionsTab } from '@/components/agents/versions-tab'
import { useMCPHealth } from '@/hooks/use-mcp-health'
import {
  type SkillEvalSummary,
  useSkillEvalSummaries,
  useSkillRegressions,
} from '@/hooks/use-skill-eval'
import { trpc } from '@/lib/trpc'

// =============================================================================
// Tabs
// =============================================================================

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'versions', label: 'Versions' },
  { id: 'traces', label: 'Traces' },
]

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
      return <Minus className="w-4 h-4 text-content-muted" />
  }
}

function getPassRateColor(rate: number): string {
  if (rate >= 0.9) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getStatusDotColor(status: string): string {
  if (status === 'healthy') return 'bg-emerald-500'
  if (status === 'degraded') return 'bg-amber-500'
  return 'bg-rose-500'
}

// =============================================================================
// Skills Tab
// =============================================================================

function SkillsTab() {
  const { data: summaries = [], isLoading: summariesLoading } =
    useSkillEvalSummaries()
  const { data: regressions = [], isLoading: regressionsLoading } =
    useSkillRegressions()

  if (summariesLoading || regressionsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card">
              <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-3 h-8 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="h-5 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full bg-gray-100 dark:bg-dark-800 rounded" />
                <div className="h-4 w-2/3 bg-gray-100 dark:bg-dark-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const totalEvals = summaries.reduce((sum, s) => sum + s.totalEvals, 0)
  const avgPassRate =
    summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.passRate, 0) / summaries.length
      : 0

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Total Skills</p>
          <p className="mt-1 text-2xl font-bold text-content-primary">
            {summaries.length}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Total Evals</p>
          <p className="mt-1 text-2xl font-bold text-content-primary">
            {totalEvals.toLocaleString()}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Avg Pass Rate</p>
          <p
            className={clsx(
              'mt-1 text-2xl font-bold',
              getPassRateColor(avgPassRate),
            )}
          >
            {formatPercent(avgPassRate)}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Active Regressions</p>
          <p
            className={clsx(
              'mt-1 text-2xl font-bold',
              regressions.length > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {regressions.length}
          </p>
        </div>
      </div>

      {/* Active Regressions */}
      {regressions.length > 0 && (
        <div className="card p-6">
          <h3 className="text-content-primary font-semibold mb-4">
            Active Regressions ({regressions.length})
          </h3>
          <div className="space-y-3">
            {regressions.map((reg) => (
              <div
                key={reg.skillId}
                className="border border-border rounded-lg p-4 flex items-start justify-between"
              >
                <div className="space-y-1">
                  <p className="text-content-primary font-medium">
                    {reg.skillName}
                  </p>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-content-secondary">
                      {formatPercent(reg.baselineScore)} &rarr;{' '}
                      {formatPercent(reg.currentScore)}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      {formatPercent(Math.abs(reg.delta))}
                    </span>
                    <span className="text-content-muted text-xs">
                      {formatRelativeTime(reg.detectedAt)}
                    </span>
                  </div>
                </div>
                <span
                  className={clsx(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    reg.severity === 'high'
                      ? 'badge-red'
                      : reg.severity === 'medium'
                        ? 'badge-yellow'
                        : 'badge-green',
                  )}
                >
                  {reg.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Skills */}
      <div>
        <h3 className="text-content-primary font-semibold mb-4">All Skills</h3>
        {summaries.length === 0 ? (
          <div className="card p-8 text-center">
            <Wrench className="w-10 h-10 text-content-muted mx-auto mb-3" />
            <p className="text-content-secondary text-sm">
              No skills data available yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((skill) => (
              <div key={skill.skillId} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-content-primary font-medium">
                    {skill.skillName}
                  </h4>
                  {getTrendIcon(skill.trend)}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-content-muted text-xs">Pass Rate</p>
                    <p
                      className={clsx(
                        'font-semibold',
                        getPassRateColor(skill.passRate),
                      )}
                    >
                      {formatPercent(skill.passRate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-content-muted text-xs">Avg Score</p>
                    <p className="text-content-primary font-semibold">
                      {formatPercent(skill.avgScore)}
                    </p>
                  </div>
                  <div>
                    <p className="text-content-muted text-xs">Latency</p>
                    <p className="text-content-secondary font-semibold">
                      {formatDuration(skill.avgLatencyMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-content-muted text-xs">Total Evals</p>
                    <p className="text-content-secondary font-semibold">
                      {skill.totalEvals.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Tools Tab
// =============================================================================

function ToolsTab() {
  const { servers, summary, isLoading } = useMCPHealth()

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card">
              <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-3 h-8 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="card p-6">
              <div className="h-5 w-40 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full bg-gray-100 dark:bg-dark-800 rounded" />
                <div className="h-4 w-3/4 bg-gray-100 dark:bg-dark-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const avgErrorRate =
    servers.length > 0
      ? servers.reduce((sum, s) => sum + s.errorRate, 0) / servers.length
      : 0

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Total Servers</p>
          <p className="mt-1 text-2xl font-bold text-content-primary">
            {summary.totalServers}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Healthy</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.healthyServers}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Total Calls</p>
          <p className="mt-1 text-2xl font-bold text-content-primary">
            {summary.totalCalls >= 1000
              ? `${(summary.totalCalls / 1000).toFixed(1)}K`
              : summary.totalCalls}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-content-secondary">Error Rate</p>
          <p
            className={clsx(
              'mt-1 text-2xl font-bold',
              avgErrorRate > 0.1
                ? 'text-rose-600 dark:text-rose-400'
                : avgErrorRate > 0.01
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {(avgErrorRate * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Server Cards */}
      {servers.length === 0 ? (
        <div className="card p-8 text-center">
          <Server className="w-10 h-10 text-content-muted mx-auto mb-3" />
          <p className="text-content-secondary text-sm">
            No MCP servers found.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {servers.map((server) => (
            <div key={server.serverId} className="card p-5">
              {/* Server Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'w-2.5 h-2.5 rounded-full',
                      getStatusDotColor(server.status),
                    )}
                  />
                  <h4 className="text-content-primary font-medium">
                    {server.serverId}
                  </h4>
                </div>
                {server.protocolVersion && (
                  <span className="text-xs text-content-muted font-mono">
                    {server.protocolVersion}
                  </span>
                )}
              </div>

              {/* Server Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
                <div>
                  <p className="text-content-muted text-xs">Calls</p>
                  <p className="text-content-primary font-semibold">
                    {server.callCount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-content-muted text-xs">Error Rate</p>
                  <p className="text-content-primary font-semibold">
                    {(server.errorRate * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-content-muted text-xs">Avg Latency</p>
                  <p className="text-content-primary font-semibold">
                    {formatDuration(server.avgLatencyMs)}
                  </p>
                </div>
                <div>
                  <p className="text-content-muted text-xs">P99 Latency</p>
                  <p className="text-content-primary font-semibold">
                    {formatDuration(server.p99LatencyMs)}
                  </p>
                </div>
              </div>

              {/* Tools Table */}
              {server.tools.length > 0 && (
                <div className="border-t border-border pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-content-muted text-xs">
                        <th className="text-left pb-2 font-medium">Tool</th>
                        <th className="text-right pb-2 font-medium">Calls</th>
                        <th className="text-right pb-2 font-medium">Success</th>
                        <th className="text-right pb-2 font-medium">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {server.tools.map((tool) => (
                        <tr
                          key={tool.toolId}
                          className="border-t border-border/50"
                        >
                          <td className="py-1.5 text-content-primary">
                            {tool.name}
                          </td>
                          <td className="py-1.5 text-right text-content-secondary">
                            {tool.callCount.toLocaleString()}
                          </td>
                          <td
                            className={clsx(
                              'py-1.5 text-right font-medium',
                              tool.successRate >= 0.95
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : tool.successRate >= 0.8
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400',
                            )}
                          >
                            {formatPercent(tool.successRate)}
                          </td>
                          <td className="py-1.5 text-right text-content-secondary">
                            {formatDuration(tool.avgLatencyMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Tab Content Router
// =============================================================================

function TabContent({ tab, agentId }: { tab: string; agentId: string }) {
  if (tab === 'overview') {
    return <AgentOverview agentId={agentId} />
  }

  if (tab === 'skills') {
    return <SkillsTab />
  }

  if (tab === 'tools') {
    return <ToolsTab />
  }

  if (tab === 'versions') {
    return <VersionsTab agentId={agentId} />
  }

  if (tab === 'traces') {
    return <AgentTracesTab agentId={agentId} />
  }

  return null
}

// =============================================================================
// Page
// =============================================================================

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState('overview')
  const [editModalOpen, setEditModalOpen] = useState(false)

  const agentQuery = trpc.agents.get.useQuery({ id })
  const agentData = agentQuery.data
  const isLoading = agentQuery.isLoading
  const isError = agentQuery.isError

  // Not found state
  if (!isLoading && !agentData && !isError) {
    return (
      <div className="p-8 space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Registry
        </Link>
        <div className="bg-surface-card border border-border rounded-xl p-12 text-center">
          <Bot className="w-12 h-12 text-content-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-content-primary mb-2">
            Agent Not Found
          </h2>
          <p className="text-content-secondary text-sm">
            No agent with ID &quot;{id}&quot; was found in this workspace.
          </p>
        </div>
      </div>
    )
  }

  // Build header data from tRPC response or fallback
  const agent: AgentHeaderData = agentData
    ? {
        id: agentData.id,
        name: agentData.name,
        version: agentData.version,
        environments: agentData.environments,
        health: agentData.health as AgentHeaderData['health'],
        totalTraces: agentData.traceCount,
        avgScore:
          agentData.errorRate != null ? (100 - agentData.errorRate) / 100 : 0,
        errorRate: agentData.errorRate,
        p50Latency: agentData.p50Latency,
      }
    : {
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        version: '—',
        environments: [],
        health: 'healthy' as const,
        totalTraces: 0,
        avgScore: 0,
        errorRate: 0,
        p50Latency: 0,
      }

  return (
    <div className="p-8 space-y-6">
      {/* Back Link */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Registry
      </Link>

      {/* Agent Header */}
      <AgentHeader agent={agent} onEdit={() => setEditModalOpen(true)} />

      {/* Quick Stats */}
      <AgentQuickStats
        traceCount={agentData?.traceCount}
        avgScore={agentData ? 100 - agentData.errorRate : undefined}
        errorRate={agentData?.errorRate}
        p50Latency={agentData?.p50Latency}
        isLoading={isLoading}
      />

      {/* Context Row */}
      {agentData && (
        <AgentContextRow
          agentId={agentData.id}
          environments={agentData.environments}
          model={
            (agentData.metadata as Record<string, unknown> | undefined)
              ?.model as string | undefined
          }
          team={agentData.team ?? undefined}
          tags={agentData.tags}
        />
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary-500 dark:text-primary-400 border-primary-500 dark:border-primary-400'
                  : 'text-content-muted border-transparent hover:text-content-primary hover:border-content-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <TabContent tab={activeTab} agentId={id} />

      {/* Edit Modal */}
      <RegisterAgentModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        mode="edit"
        agentData={
          agentData
            ? {
                id: agentData.id,
                name: agentData.name,
                description: agentData.description ?? undefined,
                team: agentData.team ?? undefined,
                environments: agentData.environments,
                tags: agentData.tags,
                associatedSuites: agentData.associatedSuites,
                mcpServers: agentData.mcpServers,
                metadata: agentData.metadata as
                  | Record<string, unknown>
                  | undefined,
              }
            : undefined
        }
      />
    </div>
  )
}
