'use client'

import { Bot, Filter, Plus, Search } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { AgentCard, type AgentCardData } from '@/components/agents/agent-card'
import { AgentStatCards } from '@/components/agents/agent-stat-cards'
import { AgentTableView } from '@/components/agents/agent-table-view'
import { BulkActionsBar } from '@/components/agents/bulk-actions-bar'
import { RegisterAgentModal } from '@/components/agents/register-agent-modal'
import { TagFilter } from '@/components/agents/tag-filter'
import { ViewToggle } from '@/components/agents/view-toggle'
import { trpc } from '@/lib/trpc'

function AgentsPageContent() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [envFilter, setEnvFilter] = useState<string>('')
  const [registerOpen, setRegisterOpen] = useState(false)
  // Read status and tags from URL params (driven by stat cards and tag filter)
  const statusFilter = searchParams.get('status') || ''
  const selectedTags =
    searchParams.get('tags')?.split(',').filter(Boolean) || []

  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      return (
        (localStorage.getItem('agents-view-mode') as 'grid' | 'table') || 'grid'
      )
    }
    return 'grid'
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleViewChange = useCallback((view: 'grid' | 'table') => {
    setViewMode(view)
    setSelectedIds(new Set())
    if (typeof window !== 'undefined') {
      localStorage.setItem('agents-view-mode', view)
    }
  }, [])

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [search, envFilter, statusFilter, selectedTags.length])

  const activeFilterCount = [
    search,
    envFilter,
    statusFilter,
    selectedTags.length > 0 ? 'tags' : '',
  ].filter(Boolean).length

  const { data: agents, isLoading } = trpc.agents.list.useQuery()

  const agentCards: AgentCardData[] = (agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    version: a.version,
    environments: a.environments,
    health: a.health as 'healthy' | 'degraded' | 'failing',
    traceCount: a.traceCount,
    errorRate: a.errorRate,
    avgDuration: a.avgDuration,
    p50Latency: a.p50Latency,
    description: a.description ?? undefined,
    team: a.team ?? undefined,
    tags: a.tags ?? [],
  }))

  const filteredAgents = agentCards.filter((agent) => {
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
    if (statusFilter === 'stale') {
      if (agent.traceCount !== 0) return false
    } else if (statusFilter && agent.health !== statusFilter) {
      return false
    }
    if (selectedTags.length > 0) {
      const agentTags = agent.tags || []
      if (!selectedTags.every((t) => agentTags.includes(t))) return false
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
              {agentCards.length} total
            </span>
            <span className="inline-flex items-center rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              {filteredAgents.length} visible
            </span>
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="btn btn-primary text-sm"
            >
              <Plus className="w-4 h-4" />
              Register Agent
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <AgentStatCards agents={agentCards} />

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
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="prod">Prod</option>
              <option value="production">Production</option>
            </select>
            <TagFilter agents={agentCards} />
            <ViewToggle view={viewMode} onViewChange={handleViewChange} />
          </div>
        </div>
        <div className="mt-2 px-1 text-xs text-content-muted">
          {activeFilterCount > 0
            ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`
            : 'No filters active'}
        </div>
      </div>

      {/* Agent List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="rounded-2xl border border-border bg-surface-card p-6 shadow-sm animate-pulse"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-2">
                  <div className="h-5 w-36 bg-surface-raised rounded" />
                  <div className="h-4 w-16 bg-surface-raised rounded" />
                </div>
                <div className="h-6 w-20 bg-surface-raised rounded-full" />
              </div>
              <div className="flex gap-2 mb-4">
                <div className="h-6 w-12 bg-surface-raised rounded" />
                <div className="h-6 w-16 bg-surface-raised rounded" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={`stat-${j}`}
                    className="rounded-lg border border-border bg-surface-raised p-2.5"
                  >
                    <div className="h-3 w-16 bg-surface-card rounded mb-1" />
                    <div className="h-5 w-12 bg-surface-card rounded" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-3 border-t border-border">
                <div className="h-7 w-16 bg-surface-raised rounded" />
                <div className="h-7 w-14 bg-surface-raised rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAgents.length > 0 ? (
        viewMode === 'table' ? (
          <AgentTableView
            agents={filteredAgents}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border bg-surface-card p-12 flex flex-col items-center justify-center text-center">
          <Bot className="w-12 h-12 text-content-muted mb-4" />
          <h3 className="text-lg font-medium text-content-secondary mb-2">
            No agents found
          </h3>
          <p className="text-content-muted text-sm max-w-md">
            {search || envFilter || statusFilter || selectedTags.length > 0
              ? 'No agents match your current filters. Try adjusting your search criteria.'
              : 'No agents discovered yet. Agents appear automatically when they send traces.'}
          </p>
        </div>
      )}

      {/* Bulk Actions Bar (table view only) */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      <RegisterAgentModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />
    </div>
  )
}

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageContent />
    </Suspense>
  )
}
