'use client'

import { clsx } from 'clsx'
import { ArrowLeft, FlaskConical, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import { ABTestDetail } from '@/components/experiments/ab-test-detail'
import { ExperimentActions } from '@/components/experiments/experiment-actions'
import { RolloutDetail } from '@/components/experiments/rollout-detail'
import { useExperiment } from '@/hooks/use-experiments'
import type { ExperimentStatus } from '@/hooks/use-experiments'

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

const typeLabels: Record<string, string> = {
  ab_test: 'A/B Test',
  progressive_rollout: 'Progressive Rollout',
}

export default function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const {
    data: experiment,
    isLoading,
    error,
  } = useExperiment(id, {
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'RUNNING' ? 3000 : false
    },
  })

  if (isLoading) {
    return <DetailSkeleton />
  }

  if (error || !experiment) {
    return (
      <div className="p-8 space-y-6">
        <Link
          href="/experiments"
          className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Experiments
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FlaskConical className="w-12 h-12 text-content-muted mb-4" />
          <h3 className="text-lg font-medium text-content-secondary mb-2">
            Experiment not found
          </h3>
          <p className="text-content-muted text-sm max-w-md">
            {error
              ? 'Failed to load experiment. Please try again.'
              : 'The experiment you are looking for does not exist or has been removed.'}
          </p>
        </div>
      </div>
    )
  }

  const status = statusConfig[experiment.status] ?? statusConfig.RUNNING
  const createdDate = experiment.createdAt
    ? new Date(experiment.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined

  return (
    <div className="p-8 space-y-6">
      {/* Back Link */}
      <Link
        href="/experiments"
        className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Experiments
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="w-6 h-6 text-primary-500 dark:text-primary-400" />
            <h1 className="text-2xl font-bold text-content-primary">
              {experiment.name}
            </h1>
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
          </div>
          <p className="text-content-secondary text-sm">
            {typeLabels[experiment.type] ?? experiment.type}
            {experiment.agentId && (
              <>
                {' '}&middot; {experiment.agentId}
              </>
            )}
            {createdDate && (
              <>
                {' '}&middot; Started {createdDate}
              </>
            )}
          </p>
        </div>
        <ExperimentActions experiment={experiment} />
      </div>

      {/* Type-specific detail layout */}
      {experiment.type === 'ab_test' ? (
        <ABTestDetail experiment={experiment} />
      ) : (
        <RolloutDetail experiment={experiment} />
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <div className="h-5 w-40 bg-surface-raised rounded animate-pulse" />

      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 bg-surface-raised rounded animate-pulse" />
            <div className="h-7 w-48 bg-surface-raised rounded animate-pulse" />
            <div className="h-6 w-16 bg-surface-raised rounded-full animate-pulse" />
          </div>
          <div className="h-4 w-64 bg-surface-raised rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 bg-surface-raised rounded animate-pulse" />
          <div className="h-9 w-20 bg-surface-raised rounded animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-6">
        <div className="card p-6 animate-pulse space-y-4">
          <div className="h-6 w-40 bg-surface-raised rounded" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-20 bg-surface-raised rounded" />
                <div className="h-7 w-14 bg-surface-raised rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5 animate-pulse space-y-3">
            <div className="h-5 w-24 bg-surface-raised rounded" />
            <div className="h-4 w-48 bg-surface-raised rounded" />
            <div className="h-16 bg-surface-raised rounded" />
          </div>
          <div className="card p-5 animate-pulse space-y-3">
            <div className="h-5 w-24 bg-surface-raised rounded" />
            <div className="h-4 w-48 bg-surface-raised rounded" />
            <div className="h-16 bg-surface-raised rounded" />
          </div>
        </div>
        <div className="card p-5 animate-pulse">
          <div className="h-6 w-32 bg-surface-raised rounded mb-4" />
          <div className="h-64 bg-surface-raised rounded" />
        </div>
      </div>
    </div>
  )
}
