'use client'

import { Activity, AlertCircle, Clock, Wrench } from 'lucide-react'
import Link from 'next/link'

interface ActiveIssue {
  id: string
  title: string
  severity: 'critical' | 'warning' | 'info'
  timestamp: string
}

interface ToolUsage {
  name: string
  count: number
  percentage: number
}

interface RecentTrace {
  id: string
  name: string
  status: 'ok' | 'error'
  duration_ms: number
  timestamp: string
}

interface AgentOverviewProps {
  agentId: string
  issues?: ActiveIssue[]
  toolUsage?: ToolUsage[]
  recentTraces?: RecentTrace[]
}

const defaultIssues: ActiveIssue[] = [
  { id: '1', title: 'Score regression detected on v2.1.0', severity: 'warning', timestamp: '2h ago' },
  { id: '2', title: 'Error rate spike in prod environment', severity: 'critical', timestamp: '4h ago' },
  { id: '3', title: 'New tool pattern detected', severity: 'info', timestamp: '1d ago' },
]

const defaultToolUsage: ToolUsage[] = [
  { name: 'web_search', count: 1240, percentage: 85 },
  { name: 'code_executor', count: 890, percentage: 61 },
  { name: 'file_reader', count: 650, percentage: 45 },
  { name: 'calculator', count: 320, percentage: 22 },
  { name: 'api_call', count: 180, percentage: 12 },
]

const defaultRecentTraces: RecentTrace[] = [
  { id: 't1', name: 'Research task', status: 'ok', duration_ms: 4520, timestamp: '5m ago' },
  { id: 't2', name: 'Code review', status: 'ok', duration_ms: 8230, timestamp: '12m ago' },
  { id: 't3', name: 'Data analysis', status: 'error', duration_ms: 15200, timestamp: '25m ago' },
  { id: 't4', name: 'Document generation', status: 'ok', duration_ms: 3100, timestamp: '1h ago' },
  { id: 't5', name: 'API integration', status: 'ok', duration_ms: 6700, timestamp: '2h ago' },
]

const severityStyles: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

export function AgentOverview({
  agentId,
  issues = defaultIssues,
  toolUsage = defaultToolUsage,
  recentTraces = defaultRecentTraces,
}: AgentOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Score Trend Chart */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">Score Trend</h3>
        <div className="h-48 flex items-end gap-1 px-2">
          {Array.from({ length: 30 }, (_, i) => {
            const height = 40 + Math.sin(i * 0.3) * 20 + Math.random() * 15
            return (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-primary-500/50 to-primary-400/80 rounded-t"
                style={{ height: `${height}%` }}
              />
            )
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-content-muted">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Active Issues */}
        <div className="bg-surface-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            <h3 className="text-content-primary font-semibold">Active Issues</h3>
          </div>
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={`border rounded-lg p-3 ${severityStyles[issue.severity]}`}
              >
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-xs opacity-60 mt-1">{issue.timestamp}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tool Usage */}
        <div className="bg-surface-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-primary-500 dark:text-primary-400" />
            <h3 className="text-content-primary font-semibold">Tool Usage</h3>
          </div>
          <div className="space-y-3">
            {toolUsage.map((tool) => (
              <div key={tool.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-content-secondary">{tool.name}</span>
                  <span className="text-xs text-content-muted">{tool.count.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
                    style={{ width: `${tool.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Traces */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-500 dark:text-primary-400" />
            <h3 className="text-content-primary font-semibold">Recent Traces</h3>
          </div>
          <Link
            href={`/traces?agent_id=${agentId}`}
            className="text-xs text-primary-500 dark:text-primary-400 hover:text-primary-400 dark:hover:text-primary-300 transition-colors"
          >
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {recentTraces.map((trace) => (
            <Link
              key={trace.id}
              href={`/traces/${trace.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    trace.status === 'ok' ? 'bg-green-400' : 'bg-red-400'
                  }`}
                />
                <span className="text-sm text-content-primary">{trace.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-content-muted">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs">{trace.duration_ms.toLocaleString()}ms</span>
                </div>
                <span className="text-xs text-content-muted">{trace.timestamp}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
