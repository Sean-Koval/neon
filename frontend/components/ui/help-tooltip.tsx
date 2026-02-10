'use client'

import { HelpCircle } from 'lucide-react'
import { useState } from 'react'

interface HelpTooltipProps {
  /** Tooltip content text */
  content: string
  /** Optional size override */
  size?: 'sm' | 'md'
}

/**
 * Inline help tooltip with (?) icon.
 * Hover or click to show explanation text.
 */
export function HelpTooltip({ content, size = 'sm' }: HelpTooltipProps) {
  const [show, setShow] = useState(false)

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        aria-label="Help"
      >
        <HelpCircle className={iconSize} />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
          <span className="block bg-gray-900 text-white text-xs rounded px-3 py-2 shadow-lg max-w-[220px] whitespace-normal leading-relaxed">
            {content}
          </span>
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 rotate-45" />
        </span>
      )}
    </span>
  )
}
