/**
 * Skeleton Component
 *
 * Reusable skeleton loading placeholders with CSS animations.
 * Designed to prevent layout shift (CLS) by matching actual content dimensions.
 */

import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  /** Width - can be Tailwind class or CSS value */
  width?: string
  /** Height - can be Tailwind class or CSS value */
  height?: string
  /** Shape variant */
  variant?: 'rectangular' | 'circular' | 'rounded' | 'text'
  /** Animation style */
  animation?: 'pulse' | 'shimmer' | 'none'
  /** Custom inline styles */
  style?: React.CSSProperties
}

export function Skeleton({
  className,
  width,
  height,
  variant = 'rectangular',
  animation = 'pulse',
  style: customStyle,
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200 dark:bg-dark-700'

  const variantClasses = {
    rectangular: 'rounded',
    circular: 'rounded-full',
    rounded: 'rounded-lg',
    text: 'rounded',
  }

  const animationClasses = {
    pulse: 'animate-pulse',
    shimmer:
      'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-dark-700 dark:via-dark-600 dark:to-dark-700 bg-[length:200%_100%]',
    none: '',
  }

  const inlineStyle: React.CSSProperties = { ...customStyle }
  if (width && !width.startsWith('w-')) inlineStyle.width = width
  if (height && !height.startsWith('h-')) inlineStyle.height = height

  return (
    <div
      className={clsx(
        baseClasses,
        variantClasses[variant],
        animationClasses[animation],
        width?.startsWith('w-') && width,
        height?.startsWith('h-') && height,
        className,
      )}
      style={Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined}
      aria-hidden="true"
    />
  )
}

/**
 * Pre-configured skeleton variants for common use cases
 */

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={clsx(
            'h-4',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full',
          )}
        />
      ))}
    </div>
  )
}

export function SkeletonAvatar({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }

  return (
    <Skeleton
      variant="circular"
      className={clsx(sizeClasses[size], className)}
    />
  )
}

export function SkeletonButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClasses = {
    sm: 'h-8 w-20',
    md: 'h-10 w-24',
    lg: 'h-12 w-32',
  }

  return (
    <Skeleton
      variant="rounded"
      className={clsx(sizeClasses[size], className)}
    />
  )
}

export function SkeletonCard({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={clsx('card p-5 animate-pulse', className)}>
      {children || (
        <>
          <div className="flex items-center justify-between mb-4">
            <Skeleton
              className="h-10 w-10"
              variant="rounded"
              animation="none"
            />
            <Skeleton className="h-5 w-16" variant="rounded" animation="none" />
          </div>
          <Skeleton className="h-8 w-20 mb-2" animation="none" />
          <Skeleton className="h-4 w-32" animation="none" />
        </>
      )}
    </div>
  )
}

export function SkeletonTableRow({
  columns = 5,
  className,
}: {
  columns?: number
  className?: string
}) {
  return (
    <div className={clsx('flex gap-4 px-4 py-4 animate-pulse', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx(
            'h-5',
            i === 0 ? 'flex-1' : i === 1 ? 'w-20' : 'w-16',
          )}
          animation="none"
        />
      ))}
    </div>
  )
}

export function SkeletonTable({
  rows = 5,
  columns = 5,
  showHeader = true,
  className,
}: {
  rows?: number
  columns?: number
  showHeader?: boolean
  className?: string
}) {
  return (
    <div className={clsx('card overflow-hidden', className)}>
      {showHeader && (
        <div className="border-b bg-gray-50 dark:bg-dark-900 px-4 py-3 flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" animation="pulse" />
          ))}
        </div>
      )}
      <div className="divide-y divide-gray-100 dark:divide-dark-700">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({
  height = 300,
  className,
}: {
  height?: number
  className?: string
}) {
  return (
    <div
      className={clsx(
        'bg-gray-50 dark:bg-dark-900 rounded-lg animate-pulse flex items-end justify-around p-4 gap-2',
        className,
      )}
      style={{ height }}
    >
      {[40, 65, 55, 80, 70, 85, 75, 60, 72, 68, 78, 62].map((h, i) => (
        <div
          key={i}
          className="bg-gray-200 dark:bg-dark-700 rounded-t flex-1 max-w-8"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}
