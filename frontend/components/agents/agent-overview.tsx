'use client'

import { AgentActivityFeed } from './agent-activity-feed'
import { AgentInfoSection } from './agent-info-section'
import { CostBreakdown } from './cost-breakdown'
import { HealthTrends } from './health-trends'

interface AgentOverviewProps {
  agentId: string
}

export function AgentOverview({ agentId }: AgentOverviewProps) {
  return (
    <div className="space-y-6">
      <AgentInfoSection agentId={agentId} />
      <CostBreakdown agentId={agentId} />
      <HealthTrends agentId={agentId} />
      <AgentActivityFeed agentId={agentId} />
    </div>
  )
}
