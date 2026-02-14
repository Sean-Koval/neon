'use client'

import { clsx } from 'clsx'
import { ArrowUpRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PromoteDialog } from './promote-dialog'

interface VersionData {
  version: string
  firstSeen: string
  lastSeen: string
  traceCount: number
  avgScore: number | null
  avgDuration: number
}

interface DeploymentCardsProps {
  agentId: string
  versions: VersionData[]
}

interface Deployment {
  env: string
  label: string
  version: VersionData | null
  color: string
  borderColor: string
  badgeClass: string
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function DeploymentCards({ agentId, versions }: DeploymentCardsProps) {
  const [promoteTarget, setPromoteTarget] = useState<{
    version: VersionData
    targetEnv: string
    currentVersion: VersionData | null
  } | null>(null)

  // Map versions to environments: latest=dev, second=staging, third=prod
  const deployments: Deployment[] = [
    {
      env: 'prod',
      label: 'Production',
      version: versions[2] ?? null,
      color: 'border-l-emerald-500',
      borderColor: 'border-emerald-500/20',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      env: 'staging',
      label: 'Staging',
      version: versions[1] ?? null,
      color: 'border-l-amber-500',
      borderColor: 'border-amber-500/20',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      env: 'dev',
      label: 'Development',
      version: versions[0] ?? null,
      color: 'border-l-blue-500',
      borderColor: 'border-blue-500/20',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
  ]

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {deployments.map((dep) => (
          <div
            key={dep.env}
            className={clsx(
              'bg-surface-card border border-border rounded-xl p-6 border-l-4',
              dep.color,
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  dep.badgeClass,
                )}
              >
                {dep.label}
              </span>
              <CheckCircle2
                className={clsx(
                  'w-4 h-4',
                  dep.version ? 'text-emerald-500' : 'text-content-muted',
                )}
              />
            </div>

            {dep.version ? (
              <>
                <p className="text-content-primary font-mono font-semibold text-lg mb-1">
                  {dep.version.version}
                </p>
                <p className="text-content-muted text-xs mb-3">
                  Deployed {formatRelativeTime(dep.version.lastSeen)}
                </p>
                <div className="flex items-center gap-4 text-sm mb-4">
                  {dep.version.avgScore !== null && (
                    <div>
                      <span className="text-content-muted text-xs">Score </span>
                      <span
                        className={clsx(
                          'font-semibold',
                          getScoreColor(dep.version.avgScore),
                        )}
                      >
                        {(dep.version.avgScore * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-content-muted text-xs">Traces </span>
                    <span className="text-content-secondary font-semibold">
                      {dep.version.traceCount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {dep.env === 'staging' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (dep.version) {
                          setPromoteTarget({
                            version: dep.version,
                            targetEnv: 'prod',
                            currentVersion: deployments[0].version,
                          })
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      Promote to Prod
                    </button>
                  )}
                  {dep.env === 'prod' && versions.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPromoteTarget({
                          version: versions[3],
                          targetEnv: 'prod',
                          currentVersion: dep.version,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rollback
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-content-muted text-sm">No version deployed</p>
            )}
          </div>
        ))}
      </div>

      {promoteTarget && (
        <PromoteDialog
          agentId={agentId}
          version={promoteTarget.version}
          targetEnv={promoteTarget.targetEnv}
          currentVersion={promoteTarget.currentVersion}
          onClose={() => setPromoteTarget(null)}
        />
      )}
    </>
  )
}
