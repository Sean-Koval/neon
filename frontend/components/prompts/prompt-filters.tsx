'use client'

import { Search, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

interface PromptFiltersProps {
  allTags: string[]
}

function PromptFiltersComponent({ allTags }: PromptFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentSearch = searchParams.get('search') || ''
  const currentType = searchParams.get('type') || ''
  const currentStatus = searchParams.get('status') || ''
  const currentSort = searchParams.get('sort') || 'newest'
  const currentTags = searchParams.get('tags')?.split(',').filter(Boolean) || []

  const [searchValue, setSearchValue] = useState(currentSearch)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const tagRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateParams({ search: searchValue || null })
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchValue, currentSearch, updateParams])

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!tagDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [tagDropdownOpen])

  const toggleTag = useCallback(
    (tag: string) => {
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag]
      updateParams({ tags: newTags.length > 0 ? newTags.join(',') : null })
    },
    [currentTags, updateParams],
  )

  const hasActiveFilters = currentSearch || currentType || currentStatus !== '' || currentTags.length > 0 || currentSort !== 'newest'

  const clearAll = useCallback(() => {
    setSearchValue('')
    router.replace('/prompts', { scroll: false })
  }, [router])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Type filter */}
        <select
          value={currentType}
          onChange={(e) => updateParams({ type: e.target.value || null })}
          className="h-9 bg-surface-card border border-border rounded-md text-sm text-content-secondary px-3 focus:outline-none focus:border-primary-500/50"
        >
          <option value="">All Types</option>
          <option value="text">Text</option>
          <option value="chat">Chat</option>
        </select>

        {/* Tag multi-select */}
        <div className="relative" ref={tagRef}>
          <button
            type="button"
            onClick={() => setTagDropdownOpen((prev) => !prev)}
            className="h-9 bg-surface-card border border-border rounded-md text-sm text-content-secondary px-3 flex items-center gap-1.5 focus:outline-none focus:border-primary-500/50"
          >
            Tag
            {currentTags.length > 0 && (
              <span className="badge badge-primary text-[10px] px-1.5">{currentTags.length}</span>
            )}
            <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tagDropdownOpen && allTags.length > 0 && (
            <div className="absolute left-0 top-10 z-50 bg-surface-card border border-border rounded-md shadow-lg py-1 min-w-[180px] max-h-[240px] overflow-y-auto">
              {allTags.map((tag) => (
                <label
                  key={tag}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={currentTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                    className="rounded border-border text-primary-500 focus:ring-primary-500"
                  />
                  {tag}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Sort */}
        <select
          value={currentSort}
          onChange={(e) => updateParams({ sort: e.target.value === 'newest' ? null : e.target.value })}
          className="h-9 bg-surface-card border border-border rounded-md text-sm text-content-secondary px-3 focus:outline-none focus:border-primary-500/50"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A-Z</option>
          <option value="versions">Most Versions</option>
        </select>

        {/* Status */}
        <select
          value={currentStatus}
          onChange={(e) => updateParams({ status: e.target.value || null })}
          className="h-9 bg-surface-card border border-border rounded-md text-sm text-content-secondary px-3 focus:outline-none focus:border-primary-500/50"
        >
          <option value="">All Status</option>
          <option value="production">Production</option>
          <option value="draft">Draft</option>
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="h-9 text-sm text-content-muted hover:text-content-secondary flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Selected tag chips */}
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {currentTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className="badge badge-primary text-[10px] flex items-center gap-1"
            >
              {tag}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const PromptFilters = memo(PromptFiltersComponent)
