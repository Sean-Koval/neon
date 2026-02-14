'use client'

import { GitBranch } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { DeploymentCards } from './deployment-card'
import { VersionComparisonChart } from './version-comparison-chart'
import { VersionHistoryTable } from './version-history-table'

interface VersionsTabProps {
  agentId: string
}

export function VersionsTab({ agentId }: VersionsTabProps) {
  const { data: versions = [], isLoading } = trpc.agents.getVersions.useQuery({
    agentId,
  })

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-card border border-border rounded-xl p-6"
            >
              <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-3 h-6 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-2 h-4 w-32 bg-gray-100 dark:bg-dark-800 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-surface-card border border-border rounded-xl p-6">
          <div className="h-5 w-40 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="mt-4 h-48 bg-gray-100 dark:bg-dark-800 rounded" />
        </div>
        <div className="bg-surface-card border border-border rounded-xl p-6">
          <div className="h-5 w-40 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 bg-gray-100 dark:bg-dark-800 rounded"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="bg-surface-card border border-border rounded-xl p-8 text-center">
        <GitBranch className="w-10 h-10 text-content-muted mx-auto mb-3" />
        <h3 className="text-content-primary font-medium mb-2">
          No versions detected yet
        </h3>
        <p className="text-content-secondary text-sm max-w-md mx-auto">
          Versions auto-discover when new agent_version values appear in traces.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DeploymentCards agentId={agentId} versions={versions} />
      <VersionComparisonChart versions={versions} />
      <VersionHistoryTable agentId={agentId} versions={versions} />
    </div>
  )
}
