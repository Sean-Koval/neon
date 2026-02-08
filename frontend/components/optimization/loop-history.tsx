'use client'

import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

interface LoopHistoryEntry {
  id: string
  trigger: string
  stagesCompleted: number
  improvement: number
  duration: string
  status: string
  startedAt: string
}

interface LoopHistoryProps {
  history: LoopHistoryEntry[]
}

const STATUS_CONFIG: Record<
  string,
  {
    icon: typeof CheckCircle
    color: string
    bg: string
    border: string
    label: string
  }
> = {
  completed: {
    icon: CheckCircle,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'Completed',
  },
  rolled_back: {
    icon: RotateCcw,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'Rolled Back',
  },
  aborted: {
    icon: XCircle,
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    label: 'Aborted',
  },
  running: {
    icon: Clock,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Running',
  },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.aborted
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

function ImprovementDelta({ improvement }: { improvement: number }) {
  const pct = (improvement * 100).toFixed(1)
  if (improvement > 0) {
    return <span className="text-sm font-medium text-emerald-600">+{pct}%</span>
  }
  if (improvement < 0) {
    return <span className="text-sm font-medium text-rose-600">{pct}%</span>
  }
  return <span className="text-sm font-medium text-gray-500">0%</span>
}

function HistoryRow({ entry }: { entry: LoopHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-5 gap-4 items-center">
            <span className="text-sm font-mono text-gray-600 truncate">
              {entry.id.slice(-3)}
            </span>
            <span className="text-sm text-gray-700 truncate">
              {entry.trigger}
            </span>
            <span className="text-sm text-gray-500 text-center">
              {entry.stagesCompleted}/6
            </span>
            <ImprovementDelta improvement={entry.improvement} />
            <div className="flex items-center justify-end gap-3">
              <span className="text-xs text-gray-400">{entry.duration}</span>
              <StatusBadge status={entry.status} />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-12 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Started:</span>{' '}
              <span className="text-gray-700">
                {new Date(entry.startedAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Stages completed:</span>{' '}
              <span className="text-gray-700">{entry.stagesCompleted} of 6</span>
            </div>
            <div>
              <span className="text-gray-500">Duration:</span>{' '}
              <span className="text-gray-700">{entry.duration}</span>
            </div>
            <div>
              <span className="text-gray-500">Score delta:</span>{' '}
              <ImprovementDelta improvement={entry.improvement} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function LoopHistory({ history }: LoopHistoryProps) {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <h2 className="text-lg font-semibold text-gray-900">Loop History</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Previous optimization iterations
        </p>
      </div>

      <div className="border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4 px-4 py-2">
          <div className="w-4" />
          <div className="flex-1 grid grid-cols-5 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>Loop</span>
            <span>Trigger</span>
            <span className="text-center">Stages</span>
            <span>Improvement</span>
            <span className="text-right">Status</span>
          </div>
        </div>
      </div>

      {history.length > 0 ? (
        <div>
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No optimization history yet</p>
        </div>
      )}
    </div>
  )
}
