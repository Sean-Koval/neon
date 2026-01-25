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
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-gray-50 text-gray-700 border border-gray-200',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
  cancelled: {
    icon: AlertCircle,
    label: 'Cancelled',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
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
    if (score >= thresholds.good) return 'text-emerald-700'
    if (score >= thresholds.warning) return 'text-amber-700'
    return 'text-rose-700'
  }

  const getScoreBg = (score: number) => {
    if (score >= thresholds.good)
      return 'bg-emerald-50 border border-emerald-200'
    if (score >= thresholds.warning)
      return 'bg-amber-50 border border-amber-200'
    return 'bg-rose-50 border border-rose-200'
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-sm',
        getScoreColor(score),
        getScoreBg(score),
      )}
    >
      {showLabel && <span className="text-gray-500 font-normal">Score:</span>}
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
      ? 'text-emerald-600'
      : ratio >= 0.6
        ? 'text-amber-600'
        : 'text-rose-600'

  return (
    <span className="text-sm font-medium">
      <span className={color}>{passed}</span>
      <span className="text-gray-400">/</span>
      <span className="text-gray-600">{total}</span>
    </span>
  )
}
