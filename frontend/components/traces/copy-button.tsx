'use client'

/**
 * Copy Button Component
 *
 * Reusable copy-to-clipboard button with visual feedback.
 */

import { clsx } from 'clsx'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

interface CopyButtonProps {
  value: string
  label?: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'outline'
  className?: string
}

/**
 * Copy Button with animated feedback
 */
export function CopyButton({
  value,
  label,
  size = 'md',
  variant = 'ghost',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx(
        'inline-flex items-center gap-1 rounded transition-colors',
        variant === 'ghost'
          ? 'hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          : 'border hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300',
        size === 'sm' ? 'p-1 text-xs' : 'p-1.5 text-sm',
        className,
      )}
      title={copied ? 'Copied!' : `Copy ${label || 'to clipboard'}`}
    >
      {copied ? (
        <Check
          className={clsx(
            'text-green-500',
            size === 'sm' ? 'w-3 h-3' : 'w-4 h-4',
          )}
        />
      ) : (
        <Copy className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      )}
      {label && (
        <span className={copied ? 'text-emerald-600 dark:text-emerald-400' : ''}>
          {copied ? 'Copied!' : label}
        </span>
      )}
    </button>
  )
}

export default CopyButton
