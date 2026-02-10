'use client'

/**
 * Trace Debug Page
 *
 * Interactive debugger view for a single trace. Features:
 * - Span tree + timeline with search filtering
 * - RCA Analysis button (error traces only) with root cause highlighting
 * - Export dropdown (JSON, OTLP, CSV)
 * - Deep link support via ?span=[spanId]
 */

import { clsx } from 'clsx'
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  Microscope,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RcaOverlay } from '@/components/traces/rca-overlay'
import type { SpanSummary } from '@/components/traces/span-detail'
import { TraceDebugger } from '@/components/traces/debugger/trace-debugger'
import { TraceLoadingSkeleton } from '@/components/traces/trace-loading-skeleton'
import { useTrace } from '@/hooks/use-traces'

/** Find deepest error spans (root causes) in the span tree */
function findRootCauseSpans(spans: SpanSummary[]): Set<string> {
  const rootCauses = new Set<string>()

  function walk(list: SpanSummary[]) {
    for (const span of list) {
      if (span.status === 'error') {
        const hasErrorChild = span.children?.some((c) => c.status === 'error')
        if (!hasErrorChild) {
          // This is a leaf error span — root cause
          rootCauses.add(span.span_id)
        }
      }
      if (span.children) walk(span.children)
    }
  }
  walk(spans)
  return rootCauses
}

/** Convert trace data to OTLP JSON format */
function toOtlpJson(trace: { trace_id: string; name: string }, spans: SpanSummary[]): object {
  function flattenSpans(list: SpanSummary[]): SpanSummary[] {
    const result: SpanSummary[] = []
    for (const s of list) {
      result.push(s)
      if (s.children) result.push(...flattenSpans(s.children))
    }
    return result
  }

  const flat = flattenSpans(spans)
  return {
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: trace.name } }] },
      scopeSpans: [{
        scope: { name: 'neon-agent-eval' },
        spans: flat.map((s) => ({
          traceId: trace.trace_id,
          spanId: s.span_id,
          parentSpanId: s.parent_span_id || undefined,
          name: s.name,
          kind: s.span_type === 'generation' ? 3 : s.span_type === 'tool' ? 2 : 1,
          startTimeUnixNano: String(new Date(s.timestamp).getTime() * 1_000_000),
          endTimeUnixNano: s.end_time
            ? String(new Date(s.end_time).getTime() * 1_000_000)
            : String((new Date(s.timestamp).getTime() + s.duration_ms) * 1_000_000),
          status: { code: s.status === 'error' ? 2 : s.status === 'ok' ? 1 : 0 },
          attributes: [
            ...(s.model ? [{ key: 'gen_ai.model', value: { stringValue: s.model } }] : []),
            ...(s.tool_name ? [{ key: 'tool.name', value: { stringValue: s.tool_name } }] : []),
            ...(s.total_tokens != null ? [{ key: 'gen_ai.usage.total_tokens', value: { intValue: String(s.total_tokens) } }] : []),
          ],
        })),
      }],
    }],
  }
}

/** Convert trace spans to CSV */
function toCsv(spans: SpanSummary[]): string {
  const headers = ['spanId', 'parentSpanId', 'name', 'kind', 'status', 'startTime', 'endTime', 'durationMs', 'model', 'toolName', 'totalTokens']
  const rows = [headers.join(',')]

  function flattenSpans(list: SpanSummary[]) {
    for (const s of list) {
      const escape = (v: string | null | undefined) => {
        if (v == null) return ''
        const str = String(v)
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
      }
      rows.push([
        s.span_id,
        s.parent_span_id || '',
        escape(s.name),
        s.span_type,
        s.status,
        s.timestamp,
        s.end_time || '',
        String(s.duration_ms),
        s.model || '',
        s.tool_name || '',
        s.total_tokens != null ? String(s.total_tokens) : '',
      ].join(','))
      if (s.children) flattenSpans(s.children)
    }
  }
  flattenSpans(spans)
  return rows.join('\n')
}

/** Trigger a file download via Blob URL */
function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function TraceDebugPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const traceId = params.id as string
  const initialSpanId = searchParams.get('span')

  const { data, isLoading, error, refetch } = useTrace(traceId)

  // RCA state
  const [rcaActive, setRcaActive] = useState(false)

  // Export dropdown state
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Update URL when span selection changes
  const handleSpanChange = useCallback((spanId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (spanId) {
      params.set('span', spanId)
    } else {
      params.delete('span')
    }
    router.replace(`/traces/${traceId}/debug?${params.toString()}`, { scroll: false })
  }, [router, traceId, searchParams])

  // Compute root cause span IDs when RCA is active
  const highlightIds = useMemo(() => {
    if (!rcaActive || !data) return undefined
    return findRootCauseSpans(data.spans)
  }, [rcaActive, data])

  // Check if trace has errors (for RCA button enabled state)
  const hasErrors = useMemo(() => {
    if (!data) return false
    function check(spans: SpanSummary[]): boolean {
      for (const s of spans) {
        if (s.status === 'error') return true
        if (s.children && check(s.children)) return true
      }
      return false
    }
    return data.trace.status === 'error' || check(data.spans)
  }, [data])

  // Export handlers
  const handleExportJson = useCallback(() => {
    if (!data) return
    const json = JSON.stringify(data, null, 2)
    downloadBlob(json, `trace-${traceId}.json`, 'application/json')
    setExportOpen(false)
  }, [data, traceId])

  const handleExportOtlp = useCallback(() => {
    if (!data) return
    const otlp = toOtlpJson(data.trace, data.spans)
    const json = JSON.stringify(otlp, null, 2)
    downloadBlob(json, `trace-${traceId}.otlp.json`, 'application/json')
    setExportOpen(false)
  }, [data, traceId])

  const handleExportCsv = useCallback(() => {
    if (!data) return
    const csv = toCsv(data.spans)
    downloadBlob(csv, `trace-${traceId}-spans.csv`, 'text/csv')
    setExportOpen(false)
  }, [data, traceId])

  if (isLoading) {
    return <TraceLoadingSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Bug className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Failed to load trace
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-4 max-w-md">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href={`/traces/${traceId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
          >
            Back to trace
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Trace not found
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-4">{traceId}</p>
        <Link
          href="/traces"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to traces
        </Link>
      </div>
    )
  }

  const { trace, spans } = data

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <header className="bg-white dark:bg-dark-800 border-b dark:border-dark-700 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link
          href={`/traces/${traceId}`}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          title="Back to trace detail"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            {trace.name}
          </h1>
        </div>

        <code className="text-xs text-gray-500 dark:text-gray-400 font-mono hidden sm:block">
          {trace.trace_id}
        </code>

        <div className="flex-1" />

        {/* RCA Analysis button */}
        <button
          type="button"
          onClick={() => setRcaActive(!rcaActive)}
          disabled={!hasErrors}
          title={hasErrors ? (rcaActive ? 'Disable RCA overlay' : 'Analyze Root Cause') : 'Only available for error traces'}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
            rcaActive
              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30'
              : hasErrors
                ? 'border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700'
                : 'border border-gray-200 dark:border-dark-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50',
          )}
        >
          <Microscope className="w-3.5 h-3.5" />
          {rcaActive ? 'RCA Active' : 'Analyze Root Cause'}
        </button>

        {/* RCA Overlay (slide-out panel) */}
        {rcaActive && (
          <RcaOverlay traceId={traceId} />
        )}

        {/* Export dropdown */}
        <div ref={exportRef} className="relative">
          <button
            type="button"
            onClick={() => setExportOpen(!exportOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className={clsx('w-3 h-3 transition-transform', exportOpen && 'rotate-180')} />
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg shadow-lg z-20 py-1">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                <FileJson className="w-4 h-4 text-blue-500" />
                JSON
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">.json</span>
              </button>
              <button
                type="button"
                onClick={handleExportOtlp}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                <FileJson className="w-4 h-4 text-purple-500" />
                OTLP
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">.otlp.json</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                CSV
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">.csv</span>
              </button>
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => refetch()}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      {/* Debugger */}
      <div className="flex-1 overflow-hidden">
        <TraceDebugger
          spans={spans}
          highlightIds={highlightIds}
          initialSpanId={initialSpanId}
          onSpanChange={handleSpanChange}
        />
      </div>
    </div>
  )
}
