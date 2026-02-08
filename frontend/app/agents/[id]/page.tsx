'use client'

import { clsx } from 'clsx'
import { ArrowLeft, Bot } from 'lucide-react'
import Link from 'next/link'
import { use, useState } from 'react'
import { AgentHeader, type AgentHeaderData } from '@/components/agents/agent-header'
import { AgentOverview } from '@/components/agents/agent-overview'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'traces', label: 'Traces' },
  { id: 'evals', label: 'Evals' },
  { id: 'versions', label: 'Versions' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'config', label: 'Config' },
]

// Mock data for initial render
const mockAgent: AgentHeaderData = {
  id: 'research-agent',
  name: 'Research Agent',
  version: '2.1.0',
  environments: ['dev', 'staging', 'prod'],
  health: 'healthy',
  totalTraces: 45230,
  avgScore: 0.87,
  errorRate: 1.2,
  p50Latency: 3200,
}

function TabContent({ tab, agentId }: { tab: string; agentId: string }) {
  if (tab === 'overview') {
    return <AgentOverview agentId={agentId} />
  }

  const placeholders: Record<string, string> = {
    traces: 'View all traces for this agent with filtering by status, duration, and time range.',
    evals: 'Evaluation runs and results for this agent. Track score trends across versions.',
    versions: 'Version history showing deployments, score changes, and configuration diffs.',
    optimization: 'Prompt optimization suggestions and training loop results for this agent.',
    config: 'Agent configuration including MCP servers, associated suites, and metadata.',
  }

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-8 text-center">
      <Bot className="w-10 h-10 text-dark-600 mx-auto mb-3" />
      <h3 className="text-white font-medium mb-2 capitalize">{tab}</h3>
      <p className="text-dark-400 text-sm max-w-md mx-auto">{placeholders[tab]}</p>
    </div>
  )
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState('overview')

  const agent = { ...mockAgent, id, name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }

  return (
    <div className="p-8 space-y-6">
      {/* Back Link */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Registry
      </Link>

      {/* Agent Header */}
      <AgentHeader agent={agent} />

      {/* Tabs */}
      <div className="border-b border-dark-700/50">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary-400 border-primary-400'
                  : 'text-dark-400 border-transparent hover:text-white hover:border-dark-600',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <TabContent tab={activeTab} agentId={id} />
    </div>
  )
}
