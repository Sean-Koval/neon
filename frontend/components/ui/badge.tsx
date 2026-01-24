import { CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

type Status = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

const statusConfig: Record<Status, {
  icon: typeof CheckCircle
  label: string
  className: string
}> = {
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    className: 'bg-green-100 text-green-800',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    className: 'bg-yellow-100 text-yellow-800',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-gray-100 text-gray-800',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-red-100 text-red-800',
  },
  cancelled: {
    icon: AlertCircle,
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-600',
  },
}

interface StatusBadgeProps {
  status: Status | string
  showIcon?: boolean
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, showIcon = true, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status as Status] || statusConfig.pending
  const Icon = config.icon

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        config.className,
        size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-0.5 text-xs gap-1.5'
      )}
    >
      {showIcon && (
        <Icon
          className={clsx(
            size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5',
            status === 'running' && 'animate-spin'
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
    if (score >= thresholds.good) return 'text-green-600'
    if (score >= thresholds.warning) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBg = (score: number) => {
    if (score >= thresholds.good) return 'bg-green-50'
    if (score >= thresholds.warning) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium text-sm',
        getScoreColor(score),
        getScoreBg(score)
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
  const color = ratio >= 0.8 ? 'text-green-600' : ratio >= 0.6 ? 'text-yellow-600' : 'text-red-600'

  return (
    <span className="text-sm">
      <span className={color}>{passed}</span>
      <span className="text-gray-400">/</span>
      <span className="text-gray-600">{total}</span>
    </span>
  )
}
