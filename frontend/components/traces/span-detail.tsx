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
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  DollarSign,
  FileCode,
  Globe,
  Hash,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Timer,
  User,
  Wrench,
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
 * Skill category type
 */
export type SkillCategory =
  | 'code'
  | 'search'
  | 'file'
  | 'data'
  | 'communication'
  | 'browser'
  | 'system'
  | 'custom'

/**
 * MCP transport type
 */
export type MCPTransport = 'stdio' | 'http' | 'websocket'

/**
 * Skill selection context
 */
export interface SkillSelectionContext {
  selectedSkill: string
  skillCategory?: SkillCategory
  selectionConfidence?: number
  selectionReason?: string
  alternativesConsidered?: string[]
  alternativeScores?: number[]
}

/**
 * MCP execution context
 */
export interface MCPContext {
  serverId: string
  serverUrl?: string
  toolId: string
  protocolVersion?: string
  transport?: MCPTransport
  capabilities?: string[]
  errorCode?: string
}

/**
 * Decision metadata
 */
export interface DecisionMetadata {
  wasUserInitiated?: boolean
  isFallback?: boolean
  retryCount?: number
  originalSpanId?: string
  requiredApproval?: boolean
  approvalGranted?: boolean
}

interface SessionContext {
  sessionId: string
  conversationId?: string
  userId?: string
  threadId?: string
}

interface MessageToolCall {
  id?: string
  name?: string
  arguments?: string
}

interface MessageContentPart {
  type?: string
  text?: string
  data?: string
}

interface TraceMessage {
  role?: string
  content?: string
  name?: string
  toolCallId?: string
  toolCalls?: MessageToolCall[]
  parts?: MessageContentPart[]
  metadata?: Record<string, string>
}

interface HandoffMetadata {
  handoffType: 'handoff' | 'delegation' | 'routing'
  fromAgentId?: string
  toAgentId: string
  fromSpanId?: string
  toSpanId?: string
  reason?: string
  taskDescription?: string
  contextSummary?: string
  messageId?: string
  metadata?: Record<string, string>
}

interface StateSnapshotReference {
  snapshotId: string
  name?: string
  stateType?: string
  uri?: string
  contentHash?: string
  artifactIds?: string[]
  metadata?: Record<string, string>
}

interface ArtifactReference {
  artifactId?: string
  name: string
  kind: 'file' | 'document' | 'image' | 'audio' | 'json' | 'url' | 'other'
  uri?: string
  mimeType?: string
  contentHash?: string
  sizeBytes?: number
  metadata?: Record<string, string>
}

interface EvalAnnotation {
  annotationId?: string
  name: string
  evaluatorType?: 'human' | 'llm_judge' | 'rule' | 'dataset' | 'system'
  status?: 'expected' | 'observed' | 'pass' | 'fail' | 'note'
  value?: string
  score?: number
  comment?: string
  referenceSpanId?: string
  metadata?: Record<string, string>
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
  skillSelection?: SkillSelectionContext
  mcpContext?: MCPContext
  decisionMetadata?: DecisionMetadata
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
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
        label: 'Success',
      }
    case 'error':
      return {
        Icon: XCircle,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        label: 'Error',
      }
    default:
      return {
        Icon: AlertCircle,
        color: 'text-gray-400 dark:text-gray-500',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
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

function formatBytes(value?: number): string | undefined {
  if (value == null || Number.isNaN(value)) return undefined
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function parseJSONAttribute<T>(
  attributes: Record<string, string> | undefined,
  key: string,
): T | undefined {
  const value = attributes?.[key]
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function compactJSON(value: unknown): string | undefined {
  if (value == null) return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
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
    <div className="border-b border-gray-100 dark:border-dark-700 last:border-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        )}
        <span className="font-medium text-sm flex-1">{title}</span>
        {isLoading && (
          <Loader2 className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin" />
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
    <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-1/2 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-5/6 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-2/3" />
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
          className="p-1.5 bg-white/90 hover:bg-white dark:bg-dark-800 rounded border shadow-sm"
          title="Copy"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          )}
        </button>
      </div>
      <pre
        className={clsx(
          'bg-gray-50 dark:bg-dark-900 rounded-lg p-4 text-sm overflow-x-auto font-mono',
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
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-b-lg border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-900 transition-colors flex items-center justify-center gap-2"
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
          className="w-full py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-b-lg border-t bg-gray-50 dark:bg-dark-900 transition-colors"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function MetadataList({
  metadata,
}: {
  metadata?: Record<string, string>
}) {
  if (!metadata || Object.keys(metadata).length === 0) return null

  return (
    <div className="mt-3 space-y-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-dark-900">
      {Object.entries(metadata).map(([key, value]) => (
        <KVRow key={key} label={key} value={value} mono />
      ))}
    </div>
  )
}

function StructuredSectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-dark-700">
      <div className="mb-2">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function SessionContextSection({
  session,
}: {
  session: SessionContext
}) {
  return (
    <Section title="Session Context" defaultOpen={false}>
      <div className="space-y-1">
        <KVRow label="Session ID" value={session.sessionId} mono copyable />
        <KVRow label="Conversation" value={session.conversationId} mono />
        <KVRow label="User" value={session.userId} mono />
        <KVRow label="Thread" value={session.threadId} mono />
      </div>
    </Section>
  )
}

function MessagesSection({
  title,
  messages,
}: {
  title: string
  messages: TraceMessage[]
}) {
  if (messages.length === 0) return null

  return (
    <Section
      title={title}
      defaultOpen={false}
      badge={
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-900 dark:text-gray-300">
          {messages.length}
        </span>
      }
    >
      <div className="space-y-3">
        {messages.map((message, index) => {
          const content =
            message.content ||
            compactJSON(message.parts) ||
            compactJSON(message.toolCalls) ||
            ''

          return (
            <StructuredSectionCard
              key={`${message.role || 'message'}-${index}`}
              title={message.role || 'message'}
              subtitle={message.name || message.toolCallId}
            >
              {content ? (
                <CodeBlock content={content} language="json" maxHeight={220} />
              ) : (
                <div className="text-sm italic text-gray-400 dark:text-gray-500">
                  No message content
                </div>
              )}
              <MetadataList metadata={message.metadata} />
            </StructuredSectionCard>
          )
        })}
      </div>
    </Section>
  )
}

function HandoffSection({
  handoff,
}: {
  handoff: HandoffMetadata
}) {
  return (
    <Section
      title="Handoff"
      defaultOpen
      badge={
        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
          {handoff.handoffType}
        </span>
      }
    >
      <div className="space-y-1">
        <KVRow label="To Agent" value={handoff.toAgentId} mono />
        <KVRow label="From Agent" value={handoff.fromAgentId} mono />
        <KVRow label="Reason" value={handoff.reason} />
        <KVRow label="Task" value={handoff.taskDescription} />
        <KVRow label="Context" value={handoff.contextSummary} />
        <KVRow label="Message ID" value={handoff.messageId} mono />
        <KVRow label="From Span" value={handoff.fromSpanId} mono />
        <KVRow label="To Span" value={handoff.toSpanId} mono />
      </div>
      <MetadataList metadata={handoff.metadata} />
    </Section>
  )
}

function StateSnapshotsSection({
  snapshots,
}: {
  snapshots: StateSnapshotReference[]
}) {
  if (snapshots.length === 0) return null

  return (
    <Section
      title="State Snapshots"
      defaultOpen={false}
      badge={
        <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          {snapshots.length}
        </span>
      }
    >
      <div className="space-y-3">
        {snapshots.map((snapshot) => (
          <StructuredSectionCard
            key={snapshot.snapshotId}
            title={snapshot.name || snapshot.snapshotId}
            subtitle={snapshot.stateType}
          >
            <div className="space-y-1">
              <KVRow label="Snapshot ID" value={snapshot.snapshotId} mono copyable />
              <KVRow label="URI" value={snapshot.uri} mono />
              <KVRow label="Content Hash" value={snapshot.contentHash} mono />
              {snapshot.artifactIds?.length ? (
                <KVRow
                  label="Artifacts"
                  value={snapshot.artifactIds.join(', ')}
                  mono
                />
              ) : null}
            </div>
            <MetadataList metadata={snapshot.metadata} />
          </StructuredSectionCard>
        ))}
      </div>
    </Section>
  )
}

function ArtifactsSection({
  artifacts,
}: {
  artifacts: ArtifactReference[]
}) {
  if (artifacts.length === 0) return null

  return (
    <Section
      title="Artifacts"
      defaultOpen={false}
      badge={
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          {artifacts.length}
        </span>
      }
    >
      <div className="space-y-3">
        {artifacts.map((artifact, index) => (
          <StructuredSectionCard
            key={artifact.artifactId || `${artifact.name}-${index}`}
            title={artifact.name}
            subtitle={artifact.kind}
          >
            <div className="space-y-1">
              <KVRow label="Artifact ID" value={artifact.artifactId} mono copyable />
              <KVRow label="URI" value={artifact.uri} mono />
              <KVRow label="MIME Type" value={artifact.mimeType} mono />
              <KVRow label="Size" value={formatBytes(artifact.sizeBytes)} />
              <KVRow label="Content Hash" value={artifact.contentHash} mono />
            </div>
            <MetadataList metadata={artifact.metadata} />
          </StructuredSectionCard>
        ))}
      </div>
    </Section>
  )
}

function EvalAnnotationsSection({
  annotations,
}: {
  annotations: EvalAnnotation[]
}) {
  if (annotations.length === 0) return null

  return (
    <Section
      title="Eval Annotations"
      defaultOpen={false}
      badge={
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          {annotations.length}
        </span>
      }
    >
      <div className="space-y-3">
        {annotations.map((annotation, index) => (
          <StructuredSectionCard
            key={annotation.annotationId || `${annotation.name}-${index}`}
            title={annotation.name}
            subtitle={annotation.status || annotation.evaluatorType}
          >
            <div className="space-y-1">
              <KVRow label="Annotation ID" value={annotation.annotationId} mono copyable />
              <KVRow label="Evaluator" value={annotation.evaluatorType} />
              <KVRow label="Status" value={annotation.status} />
              <KVRow label="Value" value={annotation.value} />
              {annotation.score != null ? (
                <KVRow label="Score" value={annotation.score.toString()} mono />
              ) : null}
              <KVRow label="Comment" value={annotation.comment} />
              <KVRow label="Reference Span" value={annotation.referenceSpanId} mono />
            </div>
            <MetadataList metadata={annotation.metadata} />
          </StructuredSectionCard>
        ))}
      </div>
    </Section>
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
      <div className="w-28 sm:w-32 text-gray-500 dark:text-gray-400 flex-shrink-0">
        {label}
      </div>
      <div
        className={clsx(
          'text-gray-900 dark:text-gray-100 flex-1 min-w-0',
          mono && 'font-mono text-xs',
        )}
      >
        <span className="break-all">{displayValue}</span>
      </div>
      {copyable && <CopyButton value={displayValue} size="sm" />}
    </div>
  )
}

// =============================================================================
// Skill Category Helpers
// =============================================================================

/**
 * Get icon and color for a skill category
 */
function getSkillCategoryConfig(category?: SkillCategory) {
  const configs: Record<
    SkillCategory,
    { icon: typeof Code; label: string; color: string; bgColor: string }
  > = {
    code: {
      icon: Code,
      label: 'Code',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    },
    search: {
      icon: Search,
      label: 'Search',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    },
    file: {
      icon: FileCode,
      label: 'File',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-500/10',
    },
    data: {
      icon: Settings,
      label: 'Data',
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-500/10',
    },
    communication: {
      icon: MessageSquare,
      label: 'Communication',
      color: 'text-green-600 dark:text-emerald-400',
      bgColor: 'bg-green-50 dark:bg-emerald-500/10',
    },
    browser: {
      icon: Globe,
      label: 'Browser',
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',
    },
    system: {
      icon: Terminal,
      label: 'System',
      color: 'text-gray-600 dark:text-gray-300',
      bgColor: 'bg-gray-100 dark:bg-dark-800',
    },
    custom: {
      icon: Sparkles,
      label: 'Custom',
      color: 'text-pink-600 dark:text-pink-400',
      bgColor: 'bg-pink-50 dark:bg-pink-500/10',
    },
  }

  return (
    configs[category || 'custom'] || {
      icon: Wrench,
      label: 'Unknown',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-dark-900',
    }
  )
}

/**
 * Get color class based on confidence level
 */
function getConfidenceColor(confidence: number): {
  text: string
  bg: string
  bar: string
} {
  if (confidence >= 0.8) {
    return {
      text: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      bar: 'bg-emerald-500',
    }
  }
  if (confidence >= 0.5) {
    return {
      text: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      bar: 'bg-amber-500',
    }
  }
  return {
    text: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    bar: 'bg-rose-500',
  }
}

/**
 * Confidence bar indicator
 */
function ConfidenceBar({ confidence }: { confidence: number }) {
  const colors = getConfidenceColor(confidence)
  const percentage = Math.round(confidence * 100)

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 dark:bg-dark-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', colors.bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={clsx('text-sm font-medium w-12 text-right', colors.text)}
      >
        {percentage}%
      </span>
    </div>
  )
}

// =============================================================================
// Skill Selection Section
// =============================================================================

/**
 * Skill selection context section
 */
function SkillSelectionSection({
  context,
  defaultOpen = true,
}: {
  context: SkillSelectionContext
  defaultOpen?: boolean
}) {
  const categoryConfig = getSkillCategoryConfig(context.skillCategory)
  const CategoryIcon = categoryConfig.icon

  return (
    <Section
      title="Skill Selection"
      defaultOpen={defaultOpen}
      badge={
        <div
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
            categoryConfig.bgColor,
            categoryConfig.color,
          )}
        >
          <CategoryIcon className="w-3 h-3" />
          <span>{context.selectedSkill}</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Selected skill info */}
        <div className="space-y-1">
          <KVRow label="Selected" value={context.selectedSkill} mono />
          {context.skillCategory && (
            <KVRow label="Category" value={categoryConfig.label} />
          )}
        </div>

        {/* Confidence */}
        {context.selectionConfidence !== undefined && (
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Confidence
            </div>
            <ConfidenceBar confidence={context.selectionConfidence} />
          </div>
        )}

        {/* Reason */}
        {context.selectionReason && (
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Selection Reason
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-dark-900 rounded-lg p-3">
              {context.selectionReason}
            </div>
          </div>
        )}

        {/* Alternatives considered */}
        {context.alternativesConsidered &&
          context.alternativesConsidered.length > 0 && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Alternatives Considered ({context.alternativesConsidered.length}
                )
              </div>
              <div className="space-y-1.5">
                {context.alternativesConsidered.map((alt, idx) => {
                  const score = context.alternativeScores?.[idx]
                  return (
                    <div
                      key={alt}
                      className="flex items-center justify-between text-sm bg-gray-50 dark:bg-dark-900 rounded px-3 py-1.5"
                    >
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {alt}
                      </span>
                      {score !== undefined && (
                        <span
                          className={clsx(
                            'text-xs font-medium px-1.5 py-0.5 rounded',
                            getConfidenceColor(score).bg,
                            getConfidenceColor(score).text,
                          )}
                        >
                          {Math.round(score * 100)}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
      </div>
    </Section>
  )
}

// =============================================================================
// MCP Context Section
// =============================================================================

/**
 * MCP transport badge
 */
function MCPTransportBadge({ transport }: { transport?: MCPTransport }) {
  const config: Record<
    MCPTransport,
    { label: string; color: string; bgColor: string }
  > = {
    stdio: {
      label: 'stdio',
      color: 'text-gray-700 dark:text-gray-300',
      bgColor: 'bg-gray-100 dark:bg-dark-800',
    },
    http: {
      label: 'HTTP',
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    },
    websocket: {
      label: 'WebSocket',
      color: 'text-purple-700 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    },
  }

  const cfg = config[transport || 'stdio']

  return (
    <span
      className={clsx(
        'text-xs font-medium px-2 py-0.5 rounded',
        cfg.bgColor,
        cfg.color,
      )}
    >
      {cfg.label}
    </span>
  )
}

/**
 * MCP context section
 */
function MCPContextSection({
  context,
  defaultOpen = true,
}: {
  context: MCPContext
  defaultOpen?: boolean
}) {
  return (
    <Section
      title="MCP Context"
      defaultOpen={defaultOpen}
      badge={
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
            {context.serverId}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Server info */}
        <div className="space-y-1">
          <KVRow label="Server ID" value={context.serverId} mono copyable />
          {context.serverUrl && (
            <KVRow label="Server URL" value={context.serverUrl} mono />
          )}
          <KVRow label="Tool ID" value={context.toolId} mono />
        </div>

        {/* Protocol details */}
        <div className="flex flex-wrap gap-2">
          {context.transport && (
            <MCPTransportBadge transport={context.transport} />
          )}
          {context.protocolVersion && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-gray-300">
              v{context.protocolVersion}
            </span>
          )}
        </div>

        {/* Capabilities */}
        {context.capabilities && context.capabilities.length > 0 && (
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1.5">
              Capabilities
            </div>
            <div className="flex flex-wrap gap-1">
              {context.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {context.errorCode && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4" />
            <span>Error: {context.errorCode}</span>
          </div>
        )}
      </div>
    </Section>
  )
}

// =============================================================================
// Decision Metadata Section
// =============================================================================

/**
 * Decision metadata section
 */
function DecisionMetadataSection({
  metadata,
  defaultOpen = false,
}: {
  metadata: DecisionMetadata
  defaultOpen?: boolean
}) {
  const flags: Array<{
    key: string
    label: string
    icon: typeof User
    active: boolean
    color: string
    bgColor: string
  }> = [
    {
      key: 'user',
      label: 'User Initiated',
      icon: User,
      active: !!metadata.wasUserInitiated,
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    },
    {
      key: 'fallback',
      label: 'Fallback',
      icon: AlertTriangle,
      active: !!metadata.isFallback,
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
    },
    {
      key: 'approval',
      label: metadata.approvalGranted ? 'Approved' : 'Approval Required',
      icon: Shield,
      active: !!metadata.requiredApproval,
      color: metadata.approvalGranted
        ? 'text-green-700 dark:text-emerald-400'
        : 'text-orange-700 dark:text-orange-400',
      bgColor: metadata.approvalGranted
        ? 'bg-green-50 dark:bg-emerald-500/10'
        : 'bg-orange-50 dark:bg-orange-500/10',
    },
  ]

  const activeFlags = flags.filter((f) => f.active)

  return (
    <Section
      title="Decision Context"
      defaultOpen={defaultOpen}
      badge={
        activeFlags.length > 0 ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {activeFlags.length} flag{activeFlags.length !== 1 ? 's' : ''}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* Flags */}
        {activeFlags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFlags.map((flag) => {
              const Icon = flag.icon
              return (
                <div
                  key={flag.key}
                  className={clsx(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
                    flag.bgColor,
                    flag.color,
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{flag.label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Retry info */}
        {metadata.retryCount !== undefined && metadata.retryCount > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-gray-700 dark:text-gray-300">
              Retry attempt #{metadata.retryCount}
            </span>
          </div>
        )}

        {/* Original span reference */}
        {metadata.originalSpanId && (
          <KVRow
            label="Original Span"
            value={metadata.originalSpanId}
            mono
            copyable
          />
        )}

        {/* Empty state */}
        {activeFlags.length === 0 &&
          !metadata.retryCount &&
          !metadata.originalSpanId && (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              No special decision context
            </div>
          )}
      </div>
    </Section>
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
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-500/10 rounded text-blue-700 dark:text-blue-400">
          <span className="text-blue-500 dark:text-blue-400 text-xs">IN</span>
          <span className="font-medium">{input.toLocaleString()}</span>
        </div>
      )}
      {output !== undefined && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-emerald-500/10 rounded text-green-700 dark:text-emerald-400">
          <span className="text-green-500 text-xs">OUT</span>
          <span className="font-medium">{output.toLocaleString()}</span>
        </div>
      )}
      {total !== undefined && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-dark-800 rounded text-gray-700 dark:text-gray-300">
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

  // Get skill/MCP/decision context (only available inline, not lazy-loaded yet)
  const skillSelection = hasInlineDetails ? fullSpan.skillSelection : undefined
  const mcpContext = hasInlineDetails ? fullSpan.mcpContext : undefined
  const decisionMetadata = hasInlineDetails
    ? fullSpan.decisionMetadata
    : undefined
  const session =
    parseJSONAttribute<SessionContext>(attributes, 'neon.session') ||
    (attributes?.['session.id']
      ? {
          sessionId: attributes['session.id'],
          conversationId: attributes['gen_ai.conversation.id'],
          userId: attributes['enduser.id'],
          threadId: attributes['neon.thread.id'],
        }
      : undefined)
  const inputMessages =
    parseJSONAttribute<TraceMessage[]>(attributes, 'gen_ai.input.messages') || []
  const outputMessages =
    parseJSONAttribute<TraceMessage[]>(attributes, 'gen_ai.output.messages') || []
  const handoff = parseJSONAttribute<HandoffMetadata>(attributes, 'neon.handoff')
  const stateSnapshots =
    parseJSONAttribute<StateSnapshotReference[]>(attributes, 'neon.state_snapshots') || []
  const artifacts =
    parseJSONAttribute<ArtifactReference[]>(attributes, 'neon.artifacts') || []
  const evalAnnotations =
    parseJSONAttribute<EvalAnnotation[]>(attributes, 'neon.eval.annotations') || []
  const structuredAttributeKeys = new Set([
    'session.id',
    'gen_ai.conversation.id',
    'enduser.id',
    'neon.thread.id',
    'neon.session',
    'gen_ai.input.messages',
    'gen_ai.output.messages',
    'neon.handoff',
    'neon.handoff.type',
    'neon.handoff.to_agent',
    'neon.handoff.from_agent',
    'neon.handoff.reason',
    'neon.handoff.task_description',
    'neon.state_snapshots',
    'neon.artifacts',
    'neon.eval.annotations',
  ])
  const visibleAttributes = attributes
    ? Object.fromEntries(
        Object.entries(attributes).filter(([key]) => !structuredAttributeKeys.has(key)),
      )
    : undefined

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
    <div className="h-full flex flex-col border-l border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-900">
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
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0"
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
            'flex items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-dark-700',
            statusInfo.bgColor,
          )}
        >
          <statusInfo.Icon className={clsx('w-4 h-4', statusInfo.color)} />
          <span className={clsx('text-sm font-medium', statusInfo.color)}>
            {statusInfo.label}
          </span>
          {span.status_message && (
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1">
              — {span.status_message}
            </span>
          )}
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-dark-700 dark:bg-dark-800">
          <SpanTypeBadge type={span.span_type} size="sm" />
          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
            <Timer className="w-3.5 h-3.5" />
            <span className="font-medium">
              {formatDuration(span.duration_ms)}
            </span>
          </div>
          {span.total_tokens && (
            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
              <Hash className="w-3.5 h-3.5" />
              <span>{span.total_tokens.toLocaleString()} tokens</span>
            </div>
          )}
          {span.cost_usd && (
            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
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
                  <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded">
                    {span.model}
                  </span>
                )
              }
            >
              <div className="space-y-3">
                <KVRow label="Model" value={span.model} />
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Token Usage
                  </div>
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
                  <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
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

        {/* Skill Selection Context */}
        {skillSelection && (
          <SkillSelectionSection
            context={skillSelection}
            defaultOpen={span.span_type === 'tool'}
          />
        )}

        {/* MCP Context */}
        {mcpContext && (
          <MCPContextSection context={mcpContext} defaultOpen={true} />
        )}

        {/* Decision Metadata */}
        {decisionMetadata && (
          <DecisionMetadataSection
            metadata={decisionMetadata}
            defaultOpen={false}
          />
        )}

        {session && <SessionContextSection session={session} />}

        {inputMessages.length > 0 && (
          <MessagesSection title="Input Messages" messages={inputMessages} />
        )}

        {outputMessages.length > 0 && (
          <MessagesSection title="Output Messages" messages={outputMessages} />
        )}

        {handoff && <HandoffSection handoff={handoff} />}

        {stateSnapshots.length > 0 && (
          <StateSnapshotsSection snapshots={stateSnapshots} />
        )}

        {artifacts.length > 0 && <ArtifactsSection artifacts={artifacts} />}

        {evalAnnotations.length > 0 && (
          <EvalAnnotationsSection annotations={evalAnnotations} />
        )}

        {/* Attributes */}
        {(showLoading ||
          (visibleAttributes && Object.keys(visibleAttributes).length > 0)) && (
          <Section
            title="Attributes"
            defaultOpen={false}
            isLoading={showLoading}
          >
            {showLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-2/3" />
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-1/2" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-700">
                {Object.entries(visibleAttributes || {}).map(([key, value]) => {
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
                        <pre className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-dark-900 rounded-md px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words overflow-x-auto max-h-40 overflow-y-auto">
                          {strValue}
                        </pre>
                      ) : (
                        <span
                          className={clsx(
                            'text-sm text-gray-900 dark:text-gray-100 break-all',
                            /^\d+$/.test(strValue) && 'font-mono tabular-nums',
                          )}
                        >
                          {strValue || (
                            <span className="text-gray-400 dark:text-gray-500 italic">
                              empty
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

export default SpanDetail
