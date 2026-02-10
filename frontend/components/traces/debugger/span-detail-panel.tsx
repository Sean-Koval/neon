'use client'

/**
 * Span Detail Panel Component
 *
 * Side panel showing full details for a selected span including
 * name, type, status, duration, input/output, metadata, and token counts.
 */

import { clsx } from 'clsx'
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Hash,
  X,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/components/traces/copy-button'
import type { SpanSummary } from '@/components/traces/span-detail'
import {
  getSpanTypeConfig,
  SpanTypeBadge,
} from '@/components/traces/span-type-badge'

interface SpanDetailPanelProps {
  span: SpanSummary
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-dark-700 last:border-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

function CodeBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > 500

  let formatted = content
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    // keep original
  }

  const display =
    !expanded && isLong ? formatted.slice(0, 500) + '...' : formatted

  return (
    <div className="relative">
      <pre className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
        {display}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-gray-50 dark:bg-dark-900 rounded-b-lg border-t"
        >
          {expanded ? 'Show less' : 'Show full content'}
        </button>
      )}
    </div>
  )
}

function KVRow({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex py-1 text-sm gap-2">
      <span className="w-24 text-gray-500 dark:text-gray-400 flex-shrink-0 text-xs">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 flex-1 min-w-0 break-all text-xs">
        {String(value)}
      </span>
    </div>
  )
}

export function SpanDetailPanel({ span, onClose }: SpanDetailPanelProps) {
  const typeConfig = getSpanTypeConfig(span.span_type)
  const TypeIcon = typeConfig.icon

  // Access extended fields if available (from full data load)
  const fullSpan = span as SpanSummary & {
    input?: string
    output?: string
    tool_input?: string
    tool_output?: string
    attributes?: Record<string, string>
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-dark-800 border-l border-gray-200 dark:border-dark-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-900 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TypeIcon
            className={clsx('w-4 h-4 flex-shrink-0', typeConfig.textColor)}
          />
          <h3 className="font-medium text-sm truncate" title={span.name}>
            {span.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-dark-700 rounded text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status bar */}
      <div
        className={clsx(
          'flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-700 flex-shrink-0',
          span.status === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-500/10'
            : span.status === 'error'
              ? 'bg-red-50 dark:bg-red-500/10'
              : 'bg-gray-50 dark:bg-dark-900',
        )}
      >
        {span.status === 'ok' ? (
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        ) : span.status === 'error' ? (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
        ) : (
          <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        )}
        <span
          className={clsx(
            'text-sm font-medium',
            span.status === 'ok'
              ? 'text-green-700 dark:text-emerald-400'
              : span.status === 'error'
                ? 'text-red-700 dark:text-red-400'
                : 'text-gray-600 dark:text-gray-300',
          )}
        >
          {span.status === 'ok'
            ? 'Success'
            : span.status === 'error'
              ? 'Error'
              : 'Unset'}
        </span>
        {span.status_message && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
            — {span.status_message}
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex-shrink-0">
        <SpanTypeBadge type={span.span_type} size="sm" />
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <Clock className="w-3 h-3" />
          <span className="font-medium">
            {formatDuration(span.duration_ms)}
          </span>
        </div>
        {span.total_tokens != null && span.total_tokens > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <Hash className="w-3 h-3" />
            <span>{span.total_tokens.toLocaleString()} tokens</span>
          </div>
        )}
        {span.cost_usd != null && span.cost_usd > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <DollarSign className="w-3 h-3" />
            <span>${span.cost_usd.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview */}
        <Section title="Overview">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <KVRow label="Span ID" value={span.span_id} />
              <CopyButton value={span.span_id} size="sm" />
            </div>
            <KVRow label="Type" value={span.span_type} />
            <KVRow label="Duration" value={formatDuration(span.duration_ms)} />
            <KVRow
              label="Started"
              value={new Date(span.timestamp).toLocaleString()}
            />
            {span.end_time && (
              <KVRow
                label="Ended"
                value={new Date(span.end_time).toLocaleString()}
              />
            )}
            {span.model && <KVRow label="Model" value={span.model} />}
            {span.tool_name && <KVRow label="Tool" value={span.tool_name} />}
          </div>
        </Section>

        {/* Token usage */}
        {(span.input_tokens || span.output_tokens) && (
          <Section title="Token Usage">
            <div className="flex gap-3 text-xs">
              {span.input_tokens != null && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-500/10 rounded text-blue-700 dark:text-blue-400">
                  <span className="text-blue-500">IN</span>
                  <span className="font-medium">
                    {span.input_tokens.toLocaleString()}
                  </span>
                </div>
              )}
              {span.output_tokens != null && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-emerald-500/10 rounded text-green-700 dark:text-emerald-400">
                  <span className="text-green-500">OUT</span>
                  <span className="font-medium">
                    {span.output_tokens.toLocaleString()}
                  </span>
                </div>
              )}
              {span.total_tokens != null && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-dark-800 rounded text-gray-700 dark:text-gray-300">
                  <Hash className="w-3 h-3" />
                  <span className="font-medium">
                    {span.total_tokens.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Input */}
        {fullSpan.input && (
          <Section
            title={span.span_type === 'generation' ? 'Input (Prompt)' : 'Input'}
            defaultOpen={false}
          >
            <CodeBlock content={fullSpan.input} />
          </Section>
        )}

        {/* Output */}
        {fullSpan.output && (
          <Section
            title={
              span.span_type === 'generation' ? 'Output (Response)' : 'Output'
            }
          >
            <CodeBlock content={fullSpan.output} />
          </Section>
        )}

        {/* Tool Input */}
        {fullSpan.tool_input && (
          <Section title="Tool Input">
            <CodeBlock content={fullSpan.tool_input} />
          </Section>
        )}

        {/* Tool Output */}
        {fullSpan.tool_output && (
          <Section title="Tool Output">
            <CodeBlock content={fullSpan.tool_output} />
          </Section>
        )}

        {/* Attributes */}
        {fullSpan.attributes && Object.keys(fullSpan.attributes).length > 0 && (
          <Section title="Attributes" defaultOpen={false}>
            <div className="divide-y divide-gray-100 dark:divide-dark-700">
              {Object.entries(fullSpan.attributes).map(([key, value]) => {
                const strValue = String(value ?? '')
                const isLong = strValue.length > 80
                return (
                  <div key={key} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                        {key}
                      </span>
                      <CopyButton value={strValue} size="sm" />
                    </div>
                    {isLong ? (
                      <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-dark-900 rounded-md px-3 py-2 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-40 overflow-y-auto">
                        {strValue}
                      </pre>
                    ) : (
                      <span className={clsx(
                        'text-xs text-gray-900 dark:text-gray-100 break-all',
                        /^\d+$/.test(strValue) && 'font-mono tabular-nums',
                      )}>
                        {strValue || <span className="text-gray-400 dark:text-gray-500 italic">empty</span>}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

export default SpanDetailPanel
