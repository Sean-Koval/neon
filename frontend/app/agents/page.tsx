'use client'

import { Bot, Filter, Search } from 'lucide-react'
import { useState } from 'react'
import { AgentCard, type AgentCardData } from '@/components/agents/agent-card'

// Mock data for initial render (replaced by API data when available)
const mockAgents: AgentCardData[] = [
  {
    id: 'research-agent',
    name: 'Research Agent',
    version: '2.1.0',
    environments: ['dev', 'staging', 'prod'],
    health: 'healthy',
    avgScore: 0.87,
    scoreTrend: 'up',
    tracesPerDay: 1240,
    errorRate: 1.2,
    p50Latency: 3200,
  },
  {
    id: 'code-review-agent',
    name: 'Code Review Agent',
    version: '1.5.3',
    environments: ['dev', 'staging'],
    health: 'degraded',
    avgScore: 0.73,
    scoreTrend: 'down',
    tracesPerDay: 890,
    errorRate: 6.1,
    p50Latency: 5400,
  },
  {
    id: 'data-analysis-agent',
    name: 'Data Analysis Agent',
    version: '3.0.0',
    environments: ['dev', 'prod'],
    health: 'healthy',
    avgScore: 0.91,
    scoreTrend: 'up',
    tracesPerDay: 560,
    errorRate: 0.5,
    p50Latency: 8100,
  },
  {
    id: 'customer-support-agent',
    name: 'Customer Support Agent',
    version: '1.2.0',
    environments: ['prod'],
    health: 'failing',
    avgScore: 0.58,
    scoreTrend: 'down',
    tracesPerDay: 2100,
    errorRate: 12.3,
    p50Latency: 2100,
  },
  {
    id: 'doc-gen-agent',
    name: 'Document Generator',
    version: '2.0.1',
    environments: ['dev', 'staging', 'prod'],
    health: 'healthy',
    avgScore: 0.82,
    scoreTrend: 'flat',
    tracesPerDay: 430,
    errorRate: 2.1,
    p50Latency: 4500,
  },
  {
    id: 'api-integration-agent',
    name: 'API Integration Agent',
    version: '1.8.0',
    environments: ['dev'],
    health: 'healthy',
    avgScore: 0.79,
    scoreTrend: 'up',
    tracesPerDay: 310,
    errorRate: 3.2,
    p50Latency: 1800,
  },
]

export default function AgentsPage() {
  const [search, setSearch] = useState('')
  const [envFilter, setEnvFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const activeFilterCount = [search, envFilter, statusFilter].filter(
    Boolean,
  ).length

  const filteredAgents = mockAgents.filter((agent) => {
    if (
      search &&
      !agent.name.toLowerCase().includes(search.toLowerCase()) &&
      !agent.id.toLowerCase().includes(search.toLowerCase())
    ) {
      return false
    }
    if (envFilter && !agent.environments.includes(envFilter)) {
      return false
    }
    if (statusFilter && agent.health !== statusFilter) {
      return false
    }
    return true
  })

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />

      {/* Page Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 dark:from-surface-card dark:via-surface-card dark:to-surface-raised p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Bot className="w-7 h-7 text-primary-500 dark:text-primary-400" />
              <h1 className="text-2xl font-bold text-content-primary">
                Agent Registry
              </h1>
            </div>
            <p className="text-content-secondary max-w-2xl">
              Agents are auto-discovered from incoming traces. Enrich them with
              metadata for better organization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border bg-surface-card px-3 py-1 text-xs font-medium text-content-secondary">
              {mockAgents.length} total
            </span>
            <span className="inline-flex items-center rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              {filteredAgents.length} visible
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative rounded-xl border border-border bg-surface-card/95 backdrop-blur-sm p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input
              type="text"
              placeholder="Search agents by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full pl-9 pr-4 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-content-muted px-2">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </span>
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="h-10 bg-surface-card border border-border rounded-lg text-sm text-content-secondary px-3 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50"
            >
              <option value="">All Environments</option>
              <option value="dev">Dev</option>
              <option value="staging">Staging</option>
              <option value="prod">Prod</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 bg-surface-card border border-border rounded-lg text-sm text-content-secondary px-3 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50"
            >
              <option value="">All Status</option>
              <option value="healthy">Healthy</option>
              <option value="degraded">Degraded</option>
              <option value="failing">Failing</option>
            </select>
          </div>
        </div>
        <div className="mt-2 px-1 text-xs text-content-muted">
          {activeFilterCount > 0
            ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`
            : 'No filters active'}
        </div>
      </div>

      {/* Agent Grid */}
      {filteredAgents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-card p-12 flex flex-col items-center justify-center text-center">
          <Bot className="w-12 h-12 text-content-muted mb-4" />
          <h3 className="text-lg font-medium text-content-secondary mb-2">
            No agents found
          </h3>
          <p className="text-content-muted text-sm max-w-md">
            {search || envFilter || statusFilter
              ? 'No agents match your current filters. Try adjusting your search criteria.'
              : 'No agents discovered yet. Agents appear automatically when they send traces.'}
          </p>
        </div>
      )}
    </div>
  )
}
