'use client'

import { GitCompare, Tag, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

interface BulkActionsBarProps {
  selectedCount: number
  selectedIds: string[]
  onClearSelection: () => void
}

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  onClearSelection,
}: BulkActionsBarProps) {
  const router = useRouter()
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [newTag, setNewTag] = useState('')

  const handleCompare = useCallback(() => {
    router.push(`/compare?agents=${selectedIds.join(',')}`)
  }, [router, selectedIds])

  const handleAddTag = useCallback(() => {
    if (!newTag.trim()) return
    // In a real implementation, this would call a bulk tag mutation
    // For now, log the intent
    console.log(`Adding tag "${newTag.trim()}" to agents:`, selectedIds)
    setNewTag('')
    setTagPopoverOpen(false)
  }, [newTag, selectedIds])

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface-card/95 backdrop-blur-sm shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-content-primary">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs text-content-muted hover:text-content-secondary transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompare}
            disabled={selectedCount < 2}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface-card text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare Selected
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setTagPopoverOpen(!tagPopoverOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface-card text-content-secondary hover:bg-surface-hover transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
              Add Tags
            </button>

            {tagPopoverOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border bg-surface-card shadow-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-content-primary">
                    Add tag to {selectedCount} agents
                  </span>
                  <button
                    type="button"
                    onClick={() => setTagPopoverOpen(false)}
                    className="text-content-muted hover:text-content-secondary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    placeholder="Tag name..."
                    className="flex-1 h-8 px-2.5 bg-surface-card border border-border rounded-md text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!newTag.trim()}
                    className="px-3 h-8 text-xs font-medium rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
