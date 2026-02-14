'use client'

import { LayoutGrid, List } from 'lucide-react'

interface ViewToggleProps {
  view: 'grid' | 'table'
  onViewChange: (view: 'grid' | 'table') => void
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface-card">
      <button
        type="button"
        onClick={() => onViewChange('grid')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-l-lg transition-colors ${
          view === 'grid'
            ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
            : 'text-content-muted hover:text-content-secondary'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        Grid
      </button>
      <button
        type="button"
        onClick={() => onViewChange('table')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-r-lg transition-colors ${
          view === 'table'
            ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
            : 'text-content-muted hover:text-content-secondary'
        }`}
      >
        <List className="w-4 h-4" />
        Table
      </button>
    </div>
  )
}
