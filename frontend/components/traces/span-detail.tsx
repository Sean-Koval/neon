'use client'

/**
 * Span Detail Component
 *
 * Shows detailed information about a selected span with enhanced
 * support for LLM reasoning steps and tool calls.
 */

import { clsx } from 'clsx'
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  DollarSign,
  Hash,
  Timer,
  X,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from './copy-button'
import {
  getSpanTypeConfig,
  type SpanType,
  SpanTypeBadge,
} from './span-type-badge'

/**
 * Span data structure
 */
export interface Span {
  span_id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  span_type: SpanType | string
  timestamp: string
  end_time: string | null
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  status_message?: string
  // LLM fields
  model?: string
  input?: string
  output?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_usd?: number
  // Tool fields
  tool_name?: string
  tool_input?: string
  tool_output?: string
  // Attributes
  attributes?: Record<string, string>
  // Children (for hierarchical display)
  children?: Span[]
}

interface SpanDetailProps {
  span: Span
  onClose?: () => void
}

/**
 * Get status icon and color
 */
function getStatusInfo(status: Span['status']) {
  switch (status) {
    case 'ok':
      return {
        Icon: CheckCircle,
        color: 'text-green-500',
        bgColor: 'bg-green-50',
        label: 'Success',
      }
    case 'error':
      return {
        Icon: XCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-50',
        label: 'Error',
      }
    default:
      return {
        Icon: AlertCircle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        label: 'Unset',
      }
  }
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

/**
 * Collapsible section
 */
function Section({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <span className="font-medium text-sm flex-1">{title}</span>
        {badge}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/**
 * Copyable code block with formatting
 */
function CodeBlock({
  content,
  language = 'json',
  maxHeight = 300,
}: {
  content: string
  language?: string
  maxHeight?: number
}) {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Try to format JSON
  let formatted = content
  let isJson = false
  if (language === 'json') {
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
      isJson = true
    } catch {
      // Keep original if not valid JSON
    }
  }

  const isLong = formatted.split('\n').length > 15

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 bg-white/90 hover:bg-white rounded border shadow-sm"
          title="Copy"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-gray-500" />
          )}
        </button>
      </div>
      <pre
        className={clsx(
          'bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto font-mono',
          !isExpanded && 'overflow-y-hidden',
        )}
        style={{ maxHeight: isExpanded ? 'none' : maxHeight }}
      >
        <code className={isJson ? 'language-json' : undefined}>
          {formatted}
        </code>
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-b-lg border-t bg-gray-50 transition-colors"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/**
 * Key-value pair row
 */
function KVRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string
  value: string | number | null | undefined
  mono?: boolean
  copyable?: boolean
}) {
  if (value === null || value === undefined) return null

  const displayValue = String(value)

  return (
    <div className="flex py-1.5 text-sm gap-2">
      <div className="w-28 sm:w-32 text-gray-500 flex-shrink-0">{label}</div>
      <div
        className={clsx(
          'text-gray-900 flex-1 min-w-0',
          mono && 'font-mono text-xs',
        )}
      >
        <span className="break-all">{displayValue}</span>
      </div>
      {copyable && <CopyButton value={displayValue} size="sm" />}
    </div>
  )
}

/**
 * Token usage display
 */
function TokenUsage({
  input,
  output,
  total,
}: {
  input?: number
  output?: number
  total?: number
}) {
  if (!input && !output && !total) return null

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {input !== undefined && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded text-blue-700">
          <span className="text-blue-500 text-xs">IN</span>
          <span className="font-medium">{input.toLocaleString()}</span>
        </div>
      )}
      {output !== undefined && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded text-green-700">
          <span className="text-green-500 text-xs">OUT</span>
          <span className="font-medium">{output.toLocaleString()}</span>
        </div>
      )}
      {total !== undefined && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-gray-700">
          <Hash className="w-3 h-3" />
          <span className="font-medium">{total.toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Span Detail Component
 */
export function SpanDetail({ span, onClose }: SpanDetailProps) {
  const statusInfo = getStatusInfo(span.status)
  const typeConfig = getSpanTypeConfig(span.span_type)
  const TypeIcon = typeConfig.icon

  return (
    <div className="h-full flex flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TypeIcon
            className={clsx('w-5 h-5 flex-shrink-0', typeConfig.textColor)}
          />
          <h3 className="font-medium truncate" title={span.name}>
            {span.name}
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-500 ml-2 flex-shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Status banner */}
        <div
          className={clsx(
            'flex items-center gap-2 px-4 py-2 border-b',
            statusInfo.bgColor,
          )}
        >
          <statusInfo.Icon className={clsx('w-4 h-4', statusInfo.color)} />
          <span className={clsx('text-sm font-medium', statusInfo.color)}>
            {statusInfo.label}
          </span>
          {span.status_message && (
            <span className="text-sm text-gray-600 truncate flex-1">
              — {span.status_message}
            </span>
          )}
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b bg-white">
          <SpanTypeBadge type={span.span_type} size="sm" />
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Timer className="w-3.5 h-3.5" />
            <span className="font-medium">
              {formatDuration(span.duration_ms)}
            </span>
          </div>
          {span.total_tokens && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Hash className="w-3.5 h-3.5" />
              <span>{span.total_tokens.toLocaleString()} tokens</span>
            </div>
          )}
          {span.cost_usd && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <DollarSign className="w-3.5 h-3.5" />
              <span>${span.cost_usd.toFixed(4)}</span>
            </div>
          )}
        </div>

        {/* Overview */}
        <Section title="Overview">
          <div className="space-y-1">
            <KVRow label="Span ID" value={span.span_id} mono copyable />
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
          </div>
        </Section>

        {/* LLM Generation Details */}
        {span.span_type === 'generation' && (
          <>
            <Section
              title="Model"
              badge={
                span.model && (
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                    {span.model}
                  </span>
                )
              }
            >
              <div className="space-y-3">
                <KVRow label="Model" value={span.model} />
                <div>
                  <div className="text-sm text-gray-500 mb-2">Token Usage</div>
                  <TokenUsage
                    input={span.input_tokens}
                    output={span.output_tokens}
                    total={span.total_tokens}
                  />
                </div>
                {span.cost_usd && (
                  <KVRow label="Cost" value={`$${span.cost_usd.toFixed(4)}`} />
                )}
              </div>
            </Section>

            {span.input && (
              <Section title="Input (Prompt)" defaultOpen={false}>
                <CodeBlock content={span.input} />
              </Section>
            )}

            {span.output && (
              <Section title="Output (Response)">
                <CodeBlock content={span.output} />
              </Section>
            )}
          </>
        )}

        {/* Tool Call Details */}
        {span.span_type === 'tool' && (
          <>
            <Section
              title="Tool"
              badge={
                span.tool_name && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">
                    {span.tool_name}
                  </span>
                )
              }
            >
              <KVRow label="Tool Name" value={span.tool_name} mono />
            </Section>

            {span.tool_input && (
              <Section title="Tool Input">
                <CodeBlock content={span.tool_input} />
              </Section>
            )}

            {span.tool_output && (
              <Section title="Tool Output">
                <CodeBlock content={span.tool_output} />
              </Section>
            )}
          </>
        )}

        {/* Agent Span Details */}
        {span.span_type === 'agent' && (
          <>
            {span.input && (
              <Section title="Agent Input">
                <CodeBlock content={span.input} />
              </Section>
            )}

            {span.output && (
              <Section title="Agent Output">
                <CodeBlock content={span.output} />
              </Section>
            )}
          </>
        )}

        {/* Generic Input/Output for other span types */}
        {!['generation', 'tool', 'agent'].includes(span.span_type) && (
          <>
            {span.input && (
              <Section title="Input" defaultOpen={false}>
                <CodeBlock content={span.input} />
              </Section>
            )}

            {span.output && (
              <Section title="Output" defaultOpen={false}>
                <CodeBlock content={span.output} />
              </Section>
            )}
          </>
        )}

        {/* Attributes */}
        {span.attributes && Object.keys(span.attributes).length > 0 && (
          <Section title="Attributes" defaultOpen={false}>
            <div className="space-y-1">
              {Object.entries(span.attributes).map(([key, value]) => (
                <KVRow key={key} label={key} value={value} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

export default SpanDetail
