'use client'

/**
 * Span Type Badge Component
 *
 * Visual indicator for span types with consistent colors and icons.
 */

import { clsx } from 'clsx'
import { Bot, Clock, Database, MessageSquare, Wrench, Zap } from 'lucide-react'

export type SpanType =
  | 'span'
  | 'generation'
  | 'tool'
  | 'retrieval'
  | 'event'
  | 'agent'

interface SpanTypeBadgeProps {
  type: SpanType | string
  showLabel?: boolean
  size?: 'sm' | 'md'
}

/**
 * Configuration for each span type
 */
const spanTypeConfig: Record<
  SpanType,
  {
    icon: typeof MessageSquare
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    barColor: string
  }
> = {
  generation: {
    icon: MessageSquare,
    label: 'LLM',
    bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    textColor: 'text-purple-700 dark:text-purple-400',
    borderColor: 'border-purple-200 dark:border-purple-500/35',
    barColor: 'bg-purple-500',
  },
  tool: {
    icon: Wrench,
    label: 'Tool',
    bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    textColor: 'text-blue-700 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-500/35',
    barColor: 'bg-blue-500',
  },
  agent: {
    icon: Bot,
    label: 'Agent',
    bgColor: 'bg-orange-50 dark:bg-orange-500/10',
    textColor: 'text-orange-700 dark:text-orange-400',
    borderColor: 'border-orange-200 dark:border-orange-500/35',
    barColor: 'bg-orange-500',
  },
  retrieval: {
    icon: Database,
    label: 'Retrieval',
    bgColor: 'bg-green-50 dark:bg-emerald-500/10',
    textColor: 'text-green-700 dark:text-emerald-400',
    borderColor: 'border-green-200 dark:border-emerald-500/35',
    barColor: 'bg-green-500',
  },
  event: {
    icon: Zap,
    label: 'Event',
    bgColor: 'bg-yellow-50 dark:bg-amber-500/10',
    textColor: 'text-yellow-700 dark:text-amber-400',
    borderColor: 'border-yellow-200 dark:border-amber-500/35',
    barColor: 'bg-yellow-500',
  },
  span: {
    icon: Clock,
    label: 'Span',
    bgColor: 'bg-gray-50 dark:bg-dark-900',
    textColor: 'text-gray-700 dark:text-gray-300',
    borderColor: 'border-gray-200 dark:border-dark-700',
    barColor: 'bg-gray-50 dark:bg-dark-900',
  },
}

/**
 * Get config for a span type, with fallback for unknown types
 */
export function getSpanTypeConfig(type: SpanType | string) {
  return spanTypeConfig[type as SpanType] || spanTypeConfig.span
}

/**
 * Span Type Badge Component
 */
export function SpanTypeBadge({
  type,
  showLabel = true,
  size = 'md',
}: SpanTypeBadgeProps) {
  const config = getSpanTypeConfig(type)
  const Icon = config.icon

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md font-medium border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        size === 'sm'
          ? 'px-1.5 py-0.5 text-xs gap-1'
          : 'px-2 py-0.5 text-xs gap-1.5',
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}

export default SpanTypeBadge
