'use client'

/**
 * Span Tree Component
 *
 * Recursive tree view of span hierarchy with expand/collapse,
 * color-coding by span type, inline duration/status display,
 * and search filtering with match highlighting.
 */

import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SpanSummary } from '@/components/traces/span-detail'
import {
  getSpanTypeConfig,
  SpanTypeBadge,
} from '@/components/traces/span-type-badge'

interface SpanTreeProps {
  spans: SpanSummary[]
  selectedSpanId: string | null
  onSpanSelect: (span: SpanSummary) => void
  /** Set of span IDs to highlight with rose background (e.g. RCA root causes) */
  highlightIds?: Set<string>
  /** Initial span to expand to and select */
  initialSpanId?: string | null
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function getSpanLabel(span: SpanSummary): string {
  if (span.span_type === 'tool' && span.tool_name) return span.tool_name
  if (span.span_type === 'generation' && span.model) return span.model
  return span.name
}

function collectAllIds(spans: SpanSummary[]): Set<string> {
  const ids = new Set<string>()
  function walk(list: SpanSummary[]) {
    for (const s of list) {
      ids.add(s.span_id)
      if (s.children) walk(s.children)
    }
  }
  walk(spans)
  return ids
}

/** Collect ancestor IDs for a given span */
function collectAncestorIds(spans: SpanSummary[], targetId: string): Set<string> {
  const ancestors = new Set<string>()
  function walk(list: SpanSummary[], path: string[]): boolean {
    for (const s of list) {
      if (s.span_id === targetId) {
        for (const id of path) ancestors.add(id)
        return true
      }
      if (s.children && walk(s.children, [...path, s.span_id])) return true
    }
    return false
  }
  walk(spans, [])
  return ancestors
}

/** Check if a span or its descendants match the search query */
function spanMatchesSearch(span: SpanSummary, query: string): boolean {
  const label = getSpanLabel(span).toLowerCase()
  const type = span.span_type.toLowerCase()
  const name = span.name.toLowerCase()
  if (label.includes(query) || type.includes(query) || name.includes(query)) return true
  if (span.children) {
    for (const child of span.children) {
      if (spanMatchesSearch(child, query)) return true
    }
  }
  return false
}

/** Check if a span itself (not children) matches */
function spanDirectlyMatches(span: SpanSummary, query: string): boolean {
  const label = getSpanLabel(span).toLowerCase()
  const type = span.span_type.toLowerCase()
  const name = span.name.toLowerCase()
  return label.includes(query) || type.includes(query) || name.includes(query)
}

/** Count directly matching spans */
function countMatches(spans: SpanSummary[], query: string): number {
  let count = 0
  function walk(list: SpanSummary[]) {
    for (const s of list) {
      if (spanDirectlyMatches(s, query)) count++
      if (s.children) walk(s.children)
    }
  }
  walk(spans)
  return count
}

/** Highlight matching text in a string */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-violet-200 dark:bg-violet-800 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function SpanNode({
  span,
  depth,
  selectedSpanId,
  onSpanSelect,
  expandedIds,
  onToggle,
  highlightIds,
  searchQuery,
}: {
  span: SpanSummary
  depth: number
  selectedSpanId: string | null
  onSpanSelect: (span: SpanSummary) => void
  expandedIds: Set<string>
  onToggle: (id: string) => void
  highlightIds?: Set<string>
  searchQuery: string
}) {
  const hasChildren = span.children && span.children.length > 0
  const isExpanded = expandedIds.has(span.span_id)
  const isSelected = span.span_id === selectedSpanId
  const isHighlighted = highlightIds?.has(span.span_id)
  const typeConfig = getSpanTypeConfig(span.span_type)
  const directMatch = searchQuery ? spanDirectlyMatches(span, searchQuery) : true
  const nodeRef = useRef<HTMLDivElement>(null)

  // Scroll into view when selected via deep link
  useEffect(() => {
    if (isSelected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isSelected])

  return (
    <>
      <div
        ref={nodeRef}
        role="button"
        tabIndex={0}
        onClick={() => onSpanSelect(span)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSpanSelect(span)
          }
        }}
        className={clsx(
          'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors group',
          isSelected
            ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-200 dark:ring-blue-500/25'
            : isHighlighted
              ? 'bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/25'
              : 'hover:bg-gray-50 dark:hover:bg-dark-700',
          searchQuery && !directMatch && 'opacity-40',
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(span.span_id)
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        ) : (
          <div className="w-4.5 flex-shrink-0" />
        )}

        {/* Status dot */}
        <div
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            span.status === 'error' ? 'bg-red-500' : typeConfig.barColor,
          )}
        />

        {/* Span type badge */}
        <SpanTypeBadge type={span.span_type} size="sm" showLabel={false} />

        {/* Span name with search highlight */}
        <span
          className={clsx(
            'text-sm truncate flex-1',
            isSelected ? 'font-medium text-blue-900 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100',
          )}
          title={span.name}
        >
          <HighlightedText text={getSpanLabel(span)} query={searchQuery} />
        </span>

        {/* RCA label */}
        {isHighlighted && (
          <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded flex-shrink-0 font-medium">
            Root Cause
          </span>
        )}

        {/* Duration */}
        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
          {formatDuration(span.duration_ms)}
        </span>

        {/* Status indicator for errors */}
        {span.status === 'error' && !isHighlighted && (
          <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded flex-shrink-0">
            error
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {(span.children ?? []).map((child) => (
            <SpanNode
              key={child.span_id}
              span={child}
              depth={depth + 1}
              selectedSpanId={selectedSpanId}
              onSpanSelect={onSpanSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
              highlightIds={highlightIds}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function SpanTree({
  spans,
  selectedSpanId,
  onSpanSelect,
  highlightIds,
  initialSpanId,
}: SpanTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = collectAllIds(spans)
    // If there's an initial span, ensure its ancestors are expanded
    if (initialSpanId) {
      const ancestors = collectAncestorIds(spans, initialSpanId)
      for (const id of ancestors) ids.add(id)
    }
    return ids
  })

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value.toLowerCase().trim())
    }, 200)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchInput('')
    setSearchQuery('')
  }, [])

  // Auto-expand to initial span
  useEffect(() => {
    if (initialSpanId) {
      const ancestors = collectAncestorIds(spans, initialSpanId)
      setExpandedIds((prev) => {
        const next = new Set(prev)
        for (const id of ancestors) next.add(id)
        return next
      })
    }
  }, [initialSpanId, spans])

  const matchCount = useMemo(() => {
    if (!searchQuery) return 0
    return countMatches(spans, searchQuery)
  }, [spans, searchQuery])

  // When searching, expand all to make matches visible
  useEffect(() => {
    if (searchQuery) {
      setExpandedIds(collectAllIds(spans))
    }
  }, [searchQuery, spans])

  const onToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedIds(collectAllIds(spans))
  }, [spans])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Filter spans when searching
  const visibleSpans = useMemo(() => {
    if (!searchQuery) return spans
    function filterTree(list: SpanSummary[]): SpanSummary[] {
      return list
        .filter((s) => spanMatchesSearch(s, searchQuery))
        .map((s) => ({
          ...s,
          children: s.children ? filterTree(s.children) : undefined,
        }))
    }
    return filterTree(spans)
  }, [spans, searchQuery])

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
        No spans in this trace
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-dark-700 rounded-lg overflow-hidden">
      {/* Search input */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search spans..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs border rounded-md dark:bg-dark-900 dark:border-dark-700 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded"
            >
              <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {matchCount} span{matchCount !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-dark-700">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Span Hierarchy
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div className="max-h-[500px] overflow-y-auto p-1">
        {visibleSpans.length === 0 && searchQuery ? (
          <div className="flex items-center justify-center h-20 text-gray-500 dark:text-gray-400 text-xs">
            No spans match &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          visibleSpans.map((span) => (
            <SpanNode
              key={span.span_id}
              span={span}
              depth={0}
              selectedSpanId={selectedSpanId}
              onSpanSelect={onSpanSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
              highlightIds={highlightIds}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default SpanTree
