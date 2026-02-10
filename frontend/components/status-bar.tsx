'use client'

import { Activity, ChevronUp, FlaskConical, X, Zap } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useWorkflowRuns } from '@/hooks/use-workflow-runs'

interface RunningItem {
  id: string
  type: 'eval' | 'experiment' | 'auto-improve'
  name: string
  progress: number
  detail?: string
  href: string
}

export function StatusBar() {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Fetch running workflow runs
  const { data: runningRuns } = useWorkflowRuns(
    { status: 'RUNNING', limit: 10 },
    { refetchInterval: 5000 },
  )

  // Build items from real workflow data + mock experiments
  const items: RunningItem[] = []

  if (runningRuns) {
    for (const run of runningRuns) {
      const progress = run.progress
        ? Math.round((run.progress.completed / run.progress.total) * 100)
        : 0
      const detail = run.progress
        ? `${run.progress.completed}/${run.progress.total} cases`
        : undefined
      items.push({
        id: run.id,
        type: 'eval',
        name: run.workflowId.replace(/^eval-run-/, '').slice(0, 24),
        progress,
        detail,
        href: `/eval-runs/${run.id}`,
      })
    }
  }

  // Don't render if nothing is running or dismissed
  if (items.length === 0 || dismissed) return null

  const iconFor = (type: RunningItem['type']) => {
    switch (type) {
      case 'eval':
        return <Zap className="w-3.5 h-3.5" />
      case 'experiment':
        return <FlaskConical className="w-3.5 h-3.5" />
      case 'auto-improve':
        return <Activity className="w-3.5 h-3.5" />
    }
  }

  const labelFor = (type: RunningItem['type']) => {
    switch (type) {
      case 'eval':
        return 'Eval'
      case 'experiment':
        return 'Exp'
      case 'auto-improve':
        return 'Opt'
    }
  }

  // Collapsed view
  if (!expanded) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 bg-surface-card/95 backdrop-blur-lg border border-border rounded-full shadow-lg px-4 py-2 text-sm text-content-secondary font-medium hover:border-primary-500/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-content-primary">
              {items.length} running
            </span>
          </span>

          {items.slice(0, 2).map((item) => (
            <span key={item.id} className="flex items-center gap-1.5">
              <span className="text-border">|</span>
              {iconFor(item.type)}
              <span>
                {labelFor(item.type)}: {item.name}
              </span>
              <span className="text-content-muted">{item.progress}%</span>
            </span>
          ))}

          {items.length > 2 && (
            <span className="text-content-muted">
              +{items.length - 2} more
            </span>
          )}

          <ChevronUp className="w-3.5 h-3.5 text-content-muted ml-1" />
        </button>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[600px] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-surface-card/95 backdrop-blur-lg border border-border rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {items.length} active task{items.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1 text-content-muted hover:text-content-primary rounded"
              title="Collapse"
            >
              <ChevronUp className="w-4 h-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="p-1 text-content-muted hover:text-content-primary rounded"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start gap-3 px-4 py-3 hover:bg-surface-overlay/50 transition-colors"
            >
              <span className="mt-0.5 text-primary-400">
                {iconFor(item.type)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-content-primary truncate">
                    {labelFor(item.type)}: {item.name}
                  </span>
                  <span className="text-xs text-content-muted shrink-0">
                    {item.progress}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.detail && (
                  <p className="text-xs text-content-muted mt-1">
                    {item.detail}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
