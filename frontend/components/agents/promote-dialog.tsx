'use client'

import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface VersionData {
  version: string
  firstSeen: string
  lastSeen: string
  traceCount: number
  avgScore: number | null
  avgDuration: number
}

interface PromoteDialogProps {
  agentId: string
  version: VersionData
  targetEnv: string
  currentVersion: VersionData | null
  onClose: () => void
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function PromoteDialog({
  agentId,
  version,
  targetEnv,
  currentVersion,
  onClose,
}: PromoteDialogProps) {
  const utils = trpc.useUtils()
  const upsertMutation = trpc.agents.upsert.useMutation({
    onSuccess: () => {
      utils.agents.getVersions.invalidate({ agentId })
      onClose()
    },
  })

  const handlePromote = () => {
    upsertMutation.mutate({
      id: agentId,
      metadata: {
        deployments: {
          [targetEnv]: {
            version: version.version,
            promotedAt: new Date().toISOString(),
          },
        },
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        role="presentation"
      />
      <div className="relative bg-surface-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-content-primary font-semibold text-lg mb-2">
          Promote {version.version} to {targetEnv}?
        </h3>
        <p className="text-content-secondary text-sm mb-5">
          This will set{' '}
          <span className="font-mono font-medium text-content-primary">
            {version.version}
          </span>{' '}
          as the {targetEnv} version.
        </p>

        {/* Score comparison */}
        <div className="flex items-center justify-center gap-4 mb-6 p-4 bg-gray-50 dark:bg-dark-800 rounded-lg">
          {currentVersion ? (
            <>
              <div className="text-center">
                <p className="text-xs text-content-muted mb-1">
                  Current ({targetEnv})
                </p>
                <p className="font-mono text-sm text-content-secondary">
                  {currentVersion.version}
                </p>
                {currentVersion.avgScore !== null && (
                  <p
                    className={clsx(
                      'text-lg font-bold',
                      getScoreColor(currentVersion.avgScore),
                    )}
                  >
                    {(currentVersion.avgScore * 100).toFixed(1)}%
                  </p>
                )}
              </div>
              <ArrowRight className="w-5 h-5 text-content-muted" />
              <div className="text-center">
                <p className="text-xs text-content-muted mb-1">Candidate</p>
                <p className="font-mono text-sm text-content-secondary">
                  {version.version}
                </p>
                {version.avgScore !== null && (
                  <p
                    className={clsx(
                      'text-lg font-bold',
                      getScoreColor(version.avgScore),
                    )}
                  >
                    {(version.avgScore * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-xs text-content-muted mb-1">Deploying</p>
              <p className="font-mono text-sm text-content-primary">
                {version.version}
              </p>
              {version.avgScore !== null && (
                <p
                  className={clsx(
                    'text-lg font-bold',
                    getScoreColor(version.avgScore),
                  )}
                >
                  {(version.avgScore * 100).toFixed(1)}%
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-content-secondary hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePromote}
            disabled={upsertMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {upsertMutation.isPending ? 'Promoting...' : 'Promote'}
          </button>
        </div>
      </div>
    </div>
  )
}
