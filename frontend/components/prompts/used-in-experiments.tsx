'use client'

import { clsx } from 'clsx'
import { ArrowRight, FlaskConical } from 'lucide-react'
import Link from 'next/link'
import { memo } from 'react'

interface Experiment {
  id: string
  name: string
  type: 'ab' | 'rollout'
  status: 'running' | 'completed' | 'cancelled'
  outcome?: 'winner' | 'loser' | 'inconclusive'
  delta?: number
  description?: string
  created_at: string
}

interface UsedInExperimentsProps {
  experiments: Experiment[]
}

const statusStyles: Record<string, string> = {
  running: 'badge-primary',
  completed: 'badge-green',
  cancelled: 'badge-gray',
}

const typeLabels: Record<string, string> = {
  ab: 'A/B Test',
  rollout: 'Rollout',
}

function UsedInExperimentsComponent({ experiments }: UsedInExperimentsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        Used in Experiments ({experiments.length})
      </h3>

      {experiments.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-content-muted">
            No experiments have used this prompt.
          </p>
          <Link
            href="/experiments"
            className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-400 mt-2"
          >
            Create Experiment <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <Link key={exp.id} href={`/experiments/${exp.id}`} className="block">
              <div className="card p-3 cursor-pointer hover:bg-surface-raised/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-content-muted" />
                    <span className="font-mono text-sm text-content-primary">{exp.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('badge text-[10px]', statusStyles[exp.status] || 'badge-gray')}>
                      {exp.status}
                    </span>
                    <span className="badge badge-gray text-[10px]">{typeLabels[exp.type] || exp.type}</span>
                    {exp.delta !== undefined && (
                      <span
                        className={clsx(
                          'text-xs font-medium',
                          exp.delta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : exp.delta < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-content-muted',
                        )}
                      >
                        {exp.delta > 0 ? '+' : ''}{(exp.delta * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                {exp.description && (
                  <p className="text-xs text-content-muted mt-1">{exp.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export const UsedInExperiments = memo(UsedInExperimentsComponent)
