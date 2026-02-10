'use client'

import { clsx } from 'clsx'
import { FlaskConical, Loader2, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { ABTestCard } from '@/components/experiments/ab-test-card'
import { CreateExperimentDialog } from '@/components/experiments/create-experiment-dialog'
import { ExperimentCardMenu } from '@/components/experiments/experiment-card-menu'
import { RolloutCard } from '@/components/experiments/rollout-card'
import type {
  Experiment,
  ExperimentStatus,
  ExperimentType,
} from '@/hooks/use-experiments'
import {
  computeExperimentStats,
  useExperimentsInfinite,
} from '@/hooks/use-experiments'

const statusConfig: Record<
  ExperimentStatus,
  { label: string; className: string }
> = {
  RUNNING: { label: 'Running', className: 'badge-blue' },
  COMPLETED: { label: 'Completed', className: 'badge-green' },
  FAILED: { label: 'Failed', className: 'badge-red' },
  PAUSED: { label: 'Paused', className: 'badge-yellow' },
  CANCELLED: { label: 'Cancelled', className: 'badge-default' },
}

const typeLabels: Record<ExperimentType, string> = {
  ab_test: 'A/B Test',
  progressive_rollout: 'Progressive Rollout',
}

function ExperimentsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL-synced filter state
  const typeFilter =
    (searchParams.get('type') as ExperimentType | null) ?? undefined
  const agentFilter = searchParams.get('agent') ?? undefined
  const sortOrder = searchParams.get('sort') ?? 'newest'
  const [search, setSearch] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Fetch experiments with infinite scroll
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useExperimentsInfinite({
      type: typeFilter,
      agentId: agentFilter,
      sort: sortOrder as
        | 'newest'
        | 'oldest'
        | 'best_improvement'
        | 'most_samples',
    })

  // Flatten pages
  const allExperiments = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  )

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allExperiments
    const q = search.toLowerCase()
    return allExperiments.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.agentId?.toLowerCase().includes(q),
    )
  }, [allExperiments, search])

  // Stats
  const stats = useMemo(
    () => computeExperimentStats(allExperiments),
    [allExperiments],
  )

  // URL update helper
  const updateUrl = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      const query = params.toString()
      router.replace(`/experiments${query ? `?${query}` : ''}`, {
        scroll: false,
      })
    },
    [router, searchParams],
  )

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <FlaskConical className="h-7 w-7 text-primary-500 dark:text-primary-400" />
              <h1 className="text-2xl font-bold text-content-primary">
                Experiments
              </h1>
            </div>
            <p className="text-content-secondary">
              A/B tests and progressive rollouts
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="btn btn-primary"
          >
            + New Experiment
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-3 w-16 bg-surface-raised rounded mb-2" />
              <div className="h-7 w-10 bg-surface-raised rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="text-xs text-content-muted mb-1">Total Experiments</p>
            <p className="text-2xl font-bold text-content-primary">
              {stats.total}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-content-muted mb-1">Running</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-content-primary">
                {stats.running}
              </p>
              {stats.running > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <p className="text-xs text-content-muted mb-1">Success Rate</p>
            <p className="text-2xl font-bold text-content-primary">
              {stats.successRate}%
            </p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-content-muted mb-1">Avg Improvement</p>
            <p
              className={clsx(
                'text-2xl font-bold',
                stats.avgImprovement >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {stats.avgImprovement >= 0 ? '+' : ''}
              {stats.avgImprovement.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-surface-card/95 p-3 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Search experiments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-card py-2 pl-9 pr-4 text-sm text-content-primary placeholder:text-content-muted focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter ?? ''}
            onChange={(e) => updateUrl('type', e.target.value || undefined)}
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Types</option>
            <option value="ab_test">A/B Test</option>
            <option value="progressive_rollout">Progressive Rollout</option>
          </select>

          {/* Agent filter */}
          <input
            type="text"
            value={agentFilter ?? ''}
            onChange={(e) => updateUrl('agent', e.target.value || undefined)}
            placeholder="Filter by agent..."
            className="w-44 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          {/* Sort dropdown */}
          <select
            value={sortOrder}
            onChange={(e) => updateUrl('sort', e.target.value)}
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="best_improvement">Best Improvement</option>
            <option value="most_samples">Most Samples</option>
          </select>
        </div>
      </div>

      {/* Experiment Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-32 bg-surface-raised rounded" />
                  <div className="h-5 w-16 bg-surface-raised rounded" />
                </div>
                <div className="h-5 w-16 bg-surface-raised rounded-full" />
              </div>
              <div className="h-2 w-full bg-surface-raised rounded-full" />
              <div className="grid grid-cols-3 gap-3">
                <div className="h-16 bg-surface-raised rounded-lg" />
                <div className="h-16 bg-surface-raised rounded-lg" />
                <div className="h-16 bg-surface-raised rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}

          {/* Load More */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="btn btn-secondary"
              >
                {isFetchingNextPage && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FlaskConical className="w-12 h-12 text-content-muted mb-4" />
          <h3 className="text-lg font-medium text-content-secondary mb-2">
            No experiments yet
          </h3>
          <p className="text-content-muted text-sm max-w-md">
            {search || typeFilter || agentFilter
              ? 'No experiments match your filters. Try adjusting your search criteria.'
              : 'Create an A/B test or progressive rollout to start optimizing your agents.'}
          </p>
        </div>
      )}

      {/* Create Dialog */}
      <CreateExperimentDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </div>
  )
}

/**
 * Individual experiment card — dispatches to type-specific layout.
 */
function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const status = statusConfig[experiment.status] ?? statusConfig.RUNNING

  return (
    <Link href={`/experiments/${experiment.id}`} className="block">
      <div className="card p-5 hover:border-primary-500/30 transition-colors cursor-pointer space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-content-primary font-semibold truncate">
              {experiment.name}
            </h3>
            <span className="badge-default text-xs flex-shrink-0">
              {typeLabels[experiment.type]}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={clsx(
                'text-xs px-2.5 py-1 rounded-full font-medium',
                status.className,
              )}
            >
              {experiment.status === 'RUNNING' && (
                <span className="relative inline-flex mr-1.5">
                  <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
                </span>
              )}
              {status.label}
            </span>
            <ExperimentCardMenu
              experimentId={experiment.id}
              status={experiment.status}
            />
          </div>
        </div>

        {/* Agent & date info */}
        {experiment.agentId && (
          <p className="text-xs text-content-muted">
            {experiment.agentId}
            {experiment.createdAt && (
              <>
                {' '}
                &middot;{' '}
                {new Date(experiment.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </>
            )}
          </p>
        )}

        {/* Type-specific content */}
        {experiment.type === 'ab_test' ? (
          <ABTestCard experiment={experiment} />
        ) : (
          <RolloutCard experiment={experiment} />
        )}
      </div>
    </Link>
  )
}

function ExperimentsPageLoading() {
  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="h-7 w-7 text-primary-500 dark:text-primary-400" />
          <h1 className="text-2xl font-bold text-content-primary">
            Experiments
          </h1>
        </div>
        <p className="text-content-secondary">
          A/B tests and progressive rollouts
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="h-3 w-16 bg-surface-raised rounded mb-2" />
            <div className="h-7 w-10 bg-surface-raised rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<ExperimentsPageLoading />}>
      <ExperimentsPageContent />
    </Suspense>
  )
}
