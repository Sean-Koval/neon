'use client'

/**
 * Trace Debugger Component
 *
 * Main container that combines the span tree, timeline, and detail panel
 * into an interactive trace debugging interface.
 */

import { clsx } from 'clsx'
import { BarChart3, Bug, ListTree } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { SpanSummary } from '@/components/traces/span-detail'
import { SpanDetailPanel } from './span-detail-panel'
import { SpanTimeline } from './span-timeline'
import { SpanTree } from './span-tree'

type DebugViewMode = 'tree' | 'timeline'

interface TraceDebuggerProps {
  spans: SpanSummary[]
}

export function TraceDebugger({ spans }: TraceDebuggerProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DebugViewMode>('tree')

  const handleSpanSelect = useCallback((span: SpanSummary) => {
    setSelectedSpanId((prev) => (prev === span.span_id ? null : span.span_id))
  }, [])

  // Find selected span in tree
  const selectedSpan = selectedSpanId ? findSpan(spans, selectedSpanId) : null

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700">Debug View</span>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 ml-4">
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
              viewMode === 'tree'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            <ListTree className="w-3.5 h-3.5" />
            Tree
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
              viewMode === 'timeline'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Timeline
          </button>
        </div>

        <div className="flex-1" />

        {/* Span count */}
        <span className="text-xs text-gray-500">{countSpans(spans)} spans</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: tree or timeline */}
        <div
          className={clsx(
            'flex-1 overflow-auto p-4',
            selectedSpan && 'lg:border-r',
          )}
        >
          {viewMode === 'tree' ? (
            <SpanTree
              spans={spans}
              selectedSpanId={selectedSpanId}
              onSpanSelect={handleSpanSelect}
            />
          ) : (
            <SpanTimeline
              spans={spans}
              selectedSpanId={selectedSpanId}
              onSpanSelect={handleSpanSelect}
            />
          )}
        </div>

        {/* Right panel: span details */}
        {selectedSpan && (
          <>
            {/* Mobile overlay */}
            <button
              type="button"
              className="fixed inset-0 bg-black/20 z-40 lg:hidden appearance-none border-none cursor-default"
              onClick={() => setSelectedSpanId(null)}
              aria-label="Close detail panel"
            />

            {/* Detail panel */}
            <div
              className={clsx(
                'fixed inset-x-0 bottom-0 max-h-[70vh] bg-white shadow-xl z-50 rounded-t-2xl overflow-y-auto',
                'lg:relative lg:inset-auto lg:max-h-none lg:w-[380px] lg:rounded-none lg:shadow-none lg:z-auto',
              )}
            >
              {/* Mobile drag handle */}
              <div className="lg:hidden flex justify-center pt-2 pb-1 sticky top-0 bg-white">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              <SpanDetailPanel
                span={selectedSpan}
                onClose={() => setSelectedSpanId(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function findSpan(spans: SpanSummary[], spanId: string): SpanSummary | null {
  for (const span of spans) {
    if (span.span_id === spanId) return span
    if (span.children) {
      const found = findSpan(span.children, spanId)
      if (found) return found
    }
  }
  return null
}

function countSpans(spans: SpanSummary[]): number {
  let count = 0
  function walk(list: SpanSummary[]) {
    for (const s of list) {
      count++
      if (s.children) walk(s.children)
    }
  }
  walk(spans)
  return count
}

export default TraceDebugger
