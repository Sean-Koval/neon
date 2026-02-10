import { clsx } from 'clsx'
import { AlertCircle, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react'

type Status = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

const statusConfig: Record<
  Status,
  {
    icon: typeof CheckCircle
    label: string
    className: string
  }
> = {
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    className: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    className: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-gray-50 dark:bg-dark-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-dark-700',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/25',
  },
  cancelled: {
    icon: AlertCircle,
    label: 'Cancelled',
    className: 'bg-gray-50 dark:bg-dark-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-700',
  },
}

interface StatusBadgeProps {
  status: Status | string
  showIcon?: boolean
  size?: 'sm' | 'md'
}

export function StatusBadge({
  status,
  showIcon = true,
  size = 'md',
}: StatusBadgeProps) {
  const config = statusConfig[status as Status] || statusConfig.pending
  const Icon = config.icon

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        config.className,
        size === 'sm'
          ? 'px-2 py-0.5 text-xs gap-1'
          : 'px-2.5 py-0.5 text-xs gap-1.5',
      )}
    >
      {showIcon && (
        <Icon
          className={clsx(
            size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5',
            status === 'running' && 'animate-spin',
          )}
        />
      )}
      <span className="capitalize">{config.label}</span>
    </span>
  )
}

interface ScoreBadgeProps {
  score: number
  thresholds?: {
    good: number
    warning: number
  }
  showLabel?: boolean
}

export function ScoreBadge({
  score,
  thresholds = { good: 0.8, warning: 0.6 },
  showLabel = false,
}: ScoreBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= thresholds.good) return 'text-emerald-700 dark:text-emerald-400'
    if (score >= thresholds.warning) return 'text-amber-700 dark:text-amber-400'
    return 'text-rose-700 dark:text-rose-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= thresholds.good)
      return 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25'
    if (score >= thresholds.warning)
      return 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25'
    return 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25'
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-sm',
        getScoreColor(score),
        getScoreBg(score),
      )}
    >
      {showLabel && <span className="text-gray-500 dark:text-gray-400 font-normal">Score:</span>}
      {score.toFixed(2)}
    </span>
  )
}

interface PassRatioBadgeProps {
  passed: number
  total: number
}

export function PassRatioBadge({ passed, total }: PassRatioBadgeProps) {
  const ratio = total > 0 ? passed / total : 0
  const color =
    ratio >= 0.8
      ? 'text-emerald-600 dark:text-emerald-400'
      : ratio >= 0.6
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400'

  return (
    <span className="text-sm font-medium">
      <span className={color}>{passed}</span>
      <span className="text-gray-400 dark:text-gray-500">/</span>
      <span className="text-gray-600 dark:text-gray-300">{total}</span>
    </span>
  )
}
