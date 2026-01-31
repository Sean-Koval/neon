'use client'

/**
 * Span Detail Component
 *
 * Shows detailed information about a selected span with enhanced
 * support for LLM reasoning steps and tool calls.
 * Supports lazy loading of large payload fields for performance.
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
  Loader2,
  Timer,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  TRUNCATION_THRESHOLD,
  truncatePayload,
  useLazySpan,
  usePrefetchSpanDetails,
} from '@/hooks/use-lazy-span'
import { CopyButton } from './copy-button'
import {
  getSpanTypeConfig,
  type SpanType,
  SpanTypeBadge,
} from './span-type-badge'

/**
 * Span summary data structure (minimal fields for list)
 */
export interface SpanSummary {
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
  model?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_usd?: number
  tool_name?: string
  children?: SpanSummary[]
}

/**
 * Full span data structure (with lazy-loaded fields)
 */
export interface Span extends SpanSummary {
  input?: string
  output?: string
  tool_input?: string
  tool_output?: string
  attributes?: Record<string, string>
}

interface SpanDetailProps {
  span: SpanSummary | Span
  onClose?: () => void
  projectId?: string
}

/**
 * Get status icon and color
 */
function getStatusInfo(status: SpanSummary['status']) {
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
  isLoading = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: React.ReactNode
  isLoading?: boolean
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
        {isLoading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        )}
        {badge}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/**
 * Skeleton loader for code blocks
 */
function CodeBlockSkeleton() {
  return (
    <div className="bg-gray-50 rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-5/6 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

/**
 * Copyable code block with formatting and truncation support
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
  const [showFullContent, setShowFullContent] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Check for large payload
  const { truncated, isTruncated, originalLength } = truncatePayload(
    content,
    showFullContent ? Number.POSITIVE_INFINITY : TRUNCATION_THRESHOLD,
  )

  // Try to format JSON
  let formatted = showFullContent ? content : truncated
  let isJson = false
  if (language === 'json') {
    try {
      formatted = JSON.stringify(JSON.parse(formatted), null, 2)
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

      {/* Truncation indicator */}
      {isTruncated && !showFullContent && (
        <button
          type="button"
          onClick={() => setShowFullContent(true)}
          className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-b-lg border-t bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <span>
            Showing {(TRUNCATION_THRESHOLD / 1024).toFixed(0)}KB of{' '}
            {(originalLength / 1024).toFixed(1)}KB
          </span>
          <span className="font-medium">Show full content</span>
        </button>
      )}

      {/* Collapse/expand for long content */}
      {!isTruncated && isLong && (
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
 * Lazy loaded content section
 */
function LazyContentSection({
  title,
  content,
  isLoading,
  defaultOpen = true,
}: {
  title: string
  content: string | undefined
  isLoading: boolean
  defaultOpen?: boolean
}) {
  if (!isLoading && !content) return null

  return (
    <Section title={title} defaultOpen={defaultOpen} isLoading={isLoading}>
      {isLoading ? (
        <CodeBlockSkeleton />
      ) : (
        <CodeBlock content={content || ''} />
      )}
    </Section>
  )
}

/**
 * Span Detail Component
 */
export function SpanDetail({
  span,
  onClose,
  projectId = '00000000-0000-0000-0000-000000000001',
}: SpanDetailProps) {
  const statusInfo = getStatusInfo(span.status)
  const typeConfig = getSpanTypeConfig(span.span_type)
  const TypeIcon = typeConfig.icon

  // Check if span already has details (from full trace load)
  const hasInlineDetails =
    'input' in span || 'output' in span || 'attributes' in span
  const fullSpan = span as Span

  // Lazy load details if not already present
  const { data: details, isLoading } = useLazySpan(span.span_id, {
    projectId,
    enabled: !hasInlineDetails,
  })

  // Get the actual content - prefer inline, fallback to lazy-loaded
  const input = hasInlineDetails ? fullSpan.input : details?.input
  const output = hasInlineDetails ? fullSpan.output : details?.output
  const toolInput = hasInlineDetails ? fullSpan.tool_input : details?.tool_input
  const toolOutput = hasInlineDetails
    ? fullSpan.tool_output
    : details?.tool_output
  const attributes = hasInlineDetails
    ? fullSpan.attributes
    : details?.attributes

  // Prefetch nearby spans for smoother UX
  const prefetchSpan = usePrefetchSpanDetails()
  useEffect(() => {
    if (span.children) {
      span.children.slice(0, 3).forEach((child) => {
        prefetchSpan(child.span_id, projectId)
      })
    }
  }, [span, prefetchSpan, projectId])

  const showLoading = !hasInlineDetails && isLoading

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

            <LazyContentSection
              title="Input (Prompt)"
              content={input}
              isLoading={showLoading}
              defaultOpen={false}
            />

            <LazyContentSection
              title="Output (Response)"
              content={output}
              isLoading={showLoading}
            />
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

            <LazyContentSection
              title="Tool Input"
              content={toolInput}
              isLoading={showLoading}
            />

            <LazyContentSection
              title="Tool Output"
              content={toolOutput}
              isLoading={showLoading}
            />
          </>
        )}

        {/* Agent Span Details */}
        {span.span_type === 'agent' && (
          <>
            <LazyContentSection
              title="Agent Input"
              content={input}
              isLoading={showLoading}
            />

            <LazyContentSection
              title="Agent Output"
              content={output}
              isLoading={showLoading}
            />
          </>
        )}

        {/* Generic Input/Output for other span types */}
        {!['generation', 'tool', 'agent'].includes(span.span_type) && (
          <>
            <LazyContentSection
              title="Input"
              content={input}
              isLoading={showLoading}
              defaultOpen={false}
            />

            <LazyContentSection
              title="Output"
              content={output}
              isLoading={showLoading}
              defaultOpen={false}
            />
          </>
        )}

        {/* Attributes */}
        {(showLoading ||
          (attributes && Object.keys(attributes).length > 0)) && (
          <Section
            title="Attributes"
            defaultOpen={false}
            isLoading={showLoading}
          >
            {showLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ) : (
              <div className="space-y-1">
                {Object.entries(attributes || {}).map(([key, value]) => (
                  <KVRow key={key} label={key} value={value} />
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

export default SpanDetail
