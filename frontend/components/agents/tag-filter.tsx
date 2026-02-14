'use client'

import { ChevronDown, Search, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { AgentCardData } from './agent-card'

export function TagFilter({ agents }: { agents: AgentCardData[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedTags =
    searchParams.get('tags')?.split(',').filter(Boolean) || []

  const allTags = Array.from(
    new Set(agents.flatMap((a) => a.tags || []).filter(Boolean)),
  ).sort()

  const filteredTags = allTags.filter((tag) =>
    tag.toLowerCase().includes(tagSearch.toLowerCase()),
  )

  const updateTags = (tags: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tags.length > 0) {
      params.set('tags', tags.join(','))
    } else {
      params.delete('tags')
    }
    router.push(`/agents?${params.toString()}`, { scroll: false })
  }

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      updateTags(selectedTags.filter((t) => t !== tag))
    } else {
      updateTags([...selectedTags, tag])
    }
  }

  const removeTag = (tag: string) => {
    updateTags(selectedTags.filter((t) => t !== tag))
  }

  const clearAll = () => {
    updateTags([])
    setOpen(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (allTags.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-10 inline-flex items-center gap-2 bg-surface-card border border-border rounded-lg text-sm text-content-secondary px-3 hover:border-primary-500/30 transition-colors"
        >
          Tags
          {selectedTags.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white text-xs font-medium">
              {selectedTags.length}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-lg border border-border bg-surface-card shadow-lg">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 bg-surface-raised border border-border rounded-md text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredTags.length === 0 ? (
                <p className="px-3 py-2 text-xs text-content-muted">
                  No tags found
                </p>
              ) : (
                filteredTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-surface-raised cursor-pointer text-sm text-content-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-3.5 h-3.5 rounded border-border text-primary-500 focus:ring-primary-500/30"
                    />
                    {tag}
                  </label>
                ))
              )}
            </div>
            {selectedTags.length > 0 && (
              <div className="p-2 border-t border-border">
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-full text-xs text-content-muted hover:text-content-secondary transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active tag pills */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-primary-900 dark:hover:text-primary-100 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
