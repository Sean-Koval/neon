'use client'

import { clsx } from 'clsx'
import { Bot, Maximize2, Sparkles, Wrench } from 'lucide-react'
import type { PointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SpanSummary } from '@/components/traces/span-detail'

interface AgentGraphProps {
  spans: SpanSummary[]
  selectedSpanId?: string | null
  onSpanSelect?: (spanId: string) => void
}

type NodeType = 'agent' | 'llm' | 'tool' | 'other'
type EdgeKind = 'parent' | 'temporal'
type LayoutMode = 'flow' | 'timeline'
type FilterMode = 'all' | 'critical' | 'errors' | 'llm' | 'tool'

interface FlatSpan {
  span: SpanSummary
  id: string
  parentId: string | null
  startMs: number
  endMs: number
  durationMs: number
  type: NodeType
}

interface GraphNode {
  id: string
  label: string
  type: NodeType
  status: string
  duration: number
  startMs: number
  startOffset: number
  depth: number
  sequence: number
  x: number
  y: number
  width: number
  height: number
  critical: boolean
}

interface GraphEdge {
  from: string
  to: string
  critical: boolean
  kind: EdgeKind
}

interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  canvasWidth: number
  canvasHeight: number
  minStartMs: number
  maxEndMs: number
  maxDepth: number
}

interface GraphMetrics {
  nodeCount: number
  edgeCount: number
  maxDepth: number
  maxFanOut: number
  avgOutDegree: number
  criticalDurationMs: number
}

interface PreparedGraph {
  items: FlatSpan[]
  edges: GraphEdge[]
  hasStructuredParents: boolean
  criticalPath: Set<string>
  criticalDurationMs: number
  depthById: Map<string, number>
  sequenceById: Map<string, number>
  metrics: GraphMetrics
}

const NODE_STYLES: Record<
  NodeType,
  {
    bg: string
    border: string
    accent: string
    icon: typeof Bot
    iconColor: string
    badgeBg: string
    badgeText: string
  }
> = {
  agent: {
    bg: 'bg-sky-50/70 dark:bg-sky-950/28',
    border: 'border-sky-200/85 dark:border-sky-800/70',
    accent: 'bg-sky-500/85 dark:bg-sky-400/80',
    icon: Bot,
    iconColor: 'text-sky-700 dark:text-sky-300',
    badgeBg: 'bg-sky-500/12 dark:bg-sky-400/16',
    badgeText: 'text-sky-700 dark:text-sky-200',
  },
  llm: {
    bg: 'bg-violet-50/70 dark:bg-violet-950/25',
    border: 'border-violet-200/85 dark:border-violet-800/70',
    accent: 'bg-violet-500/85 dark:bg-violet-400/80',
    icon: Sparkles,
    iconColor: 'text-violet-700 dark:text-violet-300',
    badgeBg: 'bg-violet-500/12 dark:bg-violet-400/16',
    badgeText: 'text-violet-700 dark:text-violet-200',
  },
  tool: {
    bg: 'bg-amber-50/75 dark:bg-amber-950/30',
    border: 'border-amber-200/85 dark:border-amber-700/65',
    accent: 'bg-amber-500/85 dark:bg-amber-500/68',
    icon: Wrench,
    iconColor: 'text-amber-700 dark:text-amber-300',
    badgeBg: 'bg-amber-500/12 dark:bg-amber-500/20',
    badgeText: 'text-amber-700 dark:text-amber-200',
  },
  other: {
    bg: 'bg-slate-100/80 dark:bg-slate-800/40',
    border: 'border-slate-300/80 dark:border-slate-700/80',
    accent: 'bg-slate-500/80 dark:bg-slate-400/75',
    icon: Bot,
    iconColor: 'text-slate-700 dark:text-slate-300',
    badgeBg: 'bg-slate-500/12 dark:bg-slate-400/16',
    badgeText: 'text-slate-700 dark:text-slate-200',
  },
}

function parseDurationMs(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseTimestampMs(value: string): number {
  const fromDateCtor = new Date(value).getTime()
  if (Number.isFinite(fromDateCtor)) return fromDateCtor
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const withTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`
  const parsed = Date.parse(withTimezone)
  return Number.isFinite(parsed) ? parsed : 0
}

function getNodeType(spanType: string): NodeType {
  if (spanType === 'generation') return 'llm'
  if (spanType === 'tool') return 'tool'
  if (spanType === 'agent') return 'agent'
  return 'other'
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function getStatusBorder(status: string): string {
  if (status === 'error') return 'border-rose-400/80 dark:border-rose-400/55'
  return ''
}

function flattenSpans(spans: SpanSummary[]): FlatSpan[] {
  const flattened: FlatSpan[] = []

  function walk(list: SpanSummary[], parentId: string | null) {
    for (const span of list) {
      const startMs = parseTimestampMs(span.timestamp)
      const durationMs = parseDurationMs(span.duration_ms)
      const endFromDuration = startMs + durationMs
      const endMs = span.end_time
        ? Math.max(parseTimestampMs(span.end_time), endFromDuration)
        : endFromDuration

      flattened.push({
        span,
        id: span.span_id,
        parentId: parentId ?? span.parent_span_id ?? null,
        startMs,
        endMs,
        durationMs,
        type: getNodeType(span.span_type),
      })

      if (span.children?.length) walk(span.children, span.span_id)
    }
  }

  walk(spans, null)
  return flattened.slice(0, 300)
}

function buildEdges(items: FlatSpan[]): {
  edges: GraphEdge[]
  hasStructuredParents: boolean
} {
  const ids = new Set(items.map((item) => item.id))
  const hasStructuredParents = items.some(
    (item) =>
      !!item.parentId && ids.has(item.parentId) && item.parentId !== item.id,
  )

  if (hasStructuredParents) {
    const seen = new Set<string>()
    const edges: GraphEdge[] = []

    for (const item of items) {
      if (
        !item.parentId ||
        !ids.has(item.parentId) ||
        item.parentId === item.id
      ) {
        continue
      }
      const key = `${item.parentId}->${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({
        from: item.parentId,
        to: item.id,
        critical: false,
        kind: 'parent',
      })
    }

    return { edges, hasStructuredParents: true }
  }

  const ordered = [...items].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    if (a.endMs !== b.endMs) return a.endMs - b.endMs
    return a.id.localeCompare(b.id)
  })

  const edges: GraphEdge[] = []
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1]?.id
    const to = ordered[i]?.id
    if (!from || !to || from === to) continue
    edges.push({ from, to, critical: true, kind: 'temporal' })
  }

  return { edges, hasStructuredParents: false }
}

function computeCriticalPath(
  items: FlatSpan[],
  edges: GraphEdge[],
): { nodes: Set<string>; durationMs: number } {
  if (items.length === 0) return { nodes: new Set(), durationMs: 0 }

  const byId = new Map(items.map((item) => [item.id, item]))
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()

  for (const item of items) indegree.set(item.id, 0)
  for (const edge of edges) {
    const next = outgoing.get(edge.from) ?? []
    next.push(edge.to)
    outgoing.set(edge.from, next)
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }

  const roots = items
    .filter((item) => (indegree.get(item.id) ?? 0) === 0)
    .map((item) => item.id)
  const startIds = roots.length > 0 ? roots : items.map((item) => item.id)
  const memo = new Map<string, { total: number; path: string[] }>()

  function dfs(
    id: string,
    visiting: Set<string>,
  ): { total: number; path: string[] } {
    const cached = memo.get(id)
    if (cached) return cached
    if (visiting.has(id)) return { total: 0, path: [] }

    visiting.add(id)
    const selfDuration = byId.get(id)?.durationMs ?? 0
    const children = outgoing.get(id) ?? []
    let bestChild: { total: number; path: string[] } = { total: 0, path: [] }

    for (const childId of children) {
      const candidate = dfs(childId, visiting)
      if (candidate.total > bestChild.total) bestChild = candidate
    }

    visiting.delete(id)
    const result = {
      total: selfDuration + bestChild.total,
      path: [id, ...bestChild.path],
    }
    memo.set(id, result)
    return result
  }

  let best: { total: number; path: string[] } = { total: 0, path: [] }
  for (const id of startIds) {
    const candidate = dfs(id, new Set())
    if (candidate.total > best.total) best = candidate
  }

  return { nodes: new Set(best.path), durationMs: best.total }
}

function computeDepths(
  items: FlatSpan[],
  edges: GraphEdge[],
): Map<string, number> {
  const depth = new Map<string, number>()
  const incoming = new Map<string, string[]>()

  for (const item of items) {
    depth.set(item.id, 0)
    incoming.set(item.id, [])
  }

  for (const edge of edges) {
    const parents = incoming.get(edge.to) ?? []
    parents.push(edge.from)
    incoming.set(edge.to, parents)
  }

  const sorted = [...items].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    return a.id.localeCompare(b.id)
  })

  for (const item of sorted) {
    const parents = incoming.get(item.id) ?? []
    if (parents.length === 0) {
      depth.set(item.id, 0)
      continue
    }
    let bestParentDepth = 0
    for (const parent of parents) {
      bestParentDepth = Math.max(bestParentDepth, depth.get(parent) ?? 0)
    }
    depth.set(item.id, bestParentDepth + 1)
  }

  return depth
}

function prepareGraph(spans: SpanSummary[]): PreparedGraph {
  const items = flattenSpans(spans)
  const { edges, hasStructuredParents } = buildEdges(items)
  const criticalInfo = computeCriticalPath(items, edges)
  const depthById = computeDepths(items, edges)

  const ordered = [...items].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    return a.id.localeCompare(b.id)
  })
  const sequenceById = new Map<string, number>()
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i]
    if (!item) continue
    sequenceById.set(item.id, i + 1)
  }

  const outDegree = new Map<string, number>()
  for (const item of items) outDegree.set(item.id, 0)
  for (const edge of edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1)
  }
  const maxDepth = Math.max(...Array.from(depthById.values()), 0)
  const maxFanOut = Math.max(...Array.from(outDegree.values()), 0)

  return {
    items,
    edges: edges.map((edge) => ({
      ...edge,
      critical:
        criticalInfo.nodes.has(edge.from) && criticalInfo.nodes.has(edge.to),
    })),
    hasStructuredParents,
    criticalPath: criticalInfo.nodes,
    criticalDurationMs: criticalInfo.durationMs,
    depthById,
    sequenceById,
    metrics: {
      nodeCount: items.length,
      edgeCount: edges.length,
      maxDepth,
      maxFanOut,
      avgOutDegree:
        items.length > 0 ? Number((edges.length / items.length).toFixed(2)) : 0,
      criticalDurationMs: criticalInfo.durationMs,
    },
  }
}

function applyFilter(
  prepared: PreparedGraph,
  filterMode: FilterMode,
): { items: FlatSpan[]; edges: GraphEdge[] } {
  let includeIds: Set<string>

  if (filterMode === 'critical') {
    includeIds = new Set(prepared.criticalPath)
  } else if (filterMode === 'errors') {
    includeIds = new Set(
      prepared.items
        .filter((item) => item.span.status === 'error')
        .map((item) => item.id),
    )
  } else if (filterMode === 'llm') {
    includeIds = new Set(
      prepared.items
        .filter((item) => item.type === 'llm')
        .map((item) => item.id),
    )
  } else if (filterMode === 'tool') {
    includeIds = new Set(
      prepared.items
        .filter((item) => item.type === 'tool')
        .map((item) => item.id),
    )
  } else {
    includeIds = new Set(prepared.items.map((item) => item.id))
  }

  if (includeIds.size === 0) {
    return { items: [], edges: [] }
  }

  const filteredItems = prepared.items.filter((item) => includeIds.has(item.id))
  const filteredEdges = prepared.edges.filter(
    (edge) => includeIds.has(edge.from) && includeIds.has(edge.to),
  )

  return { items: filteredItems, edges: filteredEdges }
}

function layoutFlow(
  items: FlatSpan[],
  edges: GraphEdge[],
  prepared: PreparedGraph,
): GraphLayout {
  if (items.length === 0) {
    return {
      nodes: [],
      edges: [],
      canvasWidth: 0,
      canvasHeight: 0,
      minStartMs: 0,
      maxEndMs: 0,
      maxDepth: 0,
    }
  }

  const itemIds = new Set(items.map((item) => item.id))
  const depthById = new Map<string, number>()
  for (const item of items) {
    depthById.set(item.id, prepared.depthById.get(item.id) ?? 0)
  }

  const incoming = new Map<string, string[]>()
  for (const item of items) incoming.set(item.id, [])
  for (const edge of edges) {
    const arr = incoming.get(edge.to) ?? []
    arr.push(edge.from)
    incoming.set(edge.to, arr)
  }

  const layers = new Map<number, FlatSpan[]>()
  let maxDepth = 0
  for (const item of items) {
    const depth = depthById.get(item.id) ?? 0
    maxDepth = Math.max(maxDepth, depth)
    const arr = layers.get(depth) ?? []
    arr.push(item)
    layers.set(depth, arr)
  }

  const nodeWidth = 236
  const nodeHeight = 76
  const rowGap = 46
  const colGap = 28
  const leftPadding = 56
  const rightPadding = 48
  const topPadding = 54
  const bottomPadding = 48

  const byIdPosition = new Map<string, { x: number; y: number }>()

  for (let depth = 0; depth <= maxDepth; depth++) {
    const layer = [...(layers.get(depth) ?? [])]
    layer.sort((a, b) => {
      const parentsA = incoming.get(a.id) ?? []
      const parentsB = incoming.get(b.id) ?? []

      const avgA =
        parentsA.length > 0
          ? parentsA.reduce((sum, parentId) => {
              const parent = byIdPosition.get(parentId)
              return sum + (parent ? parent.x : leftPadding)
            }, 0) / parentsA.length
          : a.startMs
      const avgB =
        parentsB.length > 0
          ? parentsB.reduce((sum, parentId) => {
              const parent = byIdPosition.get(parentId)
              return sum + (parent ? parent.x : leftPadding)
            }, 0) / parentsB.length
          : b.startMs

      if (avgA !== avgB) return avgA - avgB
      if (a.startMs !== b.startMs) return a.startMs - b.startMs
      return a.id.localeCompare(b.id)
    })

    const layerWidth =
      layer.length > 0
        ? layer.length * nodeWidth + (layer.length - 1) * colGap
        : nodeWidth
    let cursorX = Math.max(
      leftPadding,
      leftPadding + (nodeWidth - layerWidth) / 2,
    )
    const y = topPadding + depth * (nodeHeight + rowGap)

    for (const item of layer) {
      byIdPosition.set(item.id, { x: cursorX, y })
      cursorX += nodeWidth + colGap
    }
  }

  const minStartMs = Math.min(...items.map((item) => item.startMs))
  const maxEndMs = Math.max(...items.map((item) => item.endMs))

  const nodes: GraphNode[] = items.map((item) => {
    const pos = byIdPosition.get(item.id) ?? { x: leftPadding, y: topPadding }
    return {
      id: item.id,
      label: item.span.tool_name || item.span.model || item.span.name,
      type: item.type,
      status: item.span.status,
      duration: item.durationMs,
      startMs: item.startMs,
      startOffset: Math.max(item.startMs - minStartMs, 0),
      depth: depthById.get(item.id) ?? 0,
      sequence: prepared.sequenceById.get(item.id) ?? 0,
      x: pos.x,
      y: pos.y,
      width: nodeWidth,
      height: nodeHeight,
      critical: prepared.criticalPath.has(item.id),
    }
  })

  const maxX = Math.max(
    ...nodes.map((node) => node.x + node.width),
    leftPadding,
  )
  const maxY = Math.max(
    ...nodes.map((node) => node.y + node.height),
    topPadding,
  )

  return {
    nodes,
    edges: edges.filter(
      (edge) => itemIds.has(edge.from) && itemIds.has(edge.to),
    ),
    canvasWidth: maxX + rightPadding,
    canvasHeight: maxY + bottomPadding,
    minStartMs,
    maxEndMs,
    maxDepth,
  }
}

function layoutTimeline(
  items: FlatSpan[],
  edges: GraphEdge[],
  prepared: PreparedGraph,
): GraphLayout {
  if (items.length === 0) {
    return {
      nodes: [],
      edges: [],
      canvasWidth: 0,
      canvasHeight: 0,
      minStartMs: 0,
      maxEndMs: 0,
      maxDepth: 0,
    }
  }

  const minStartMs = Math.min(...items.map((item) => item.startMs))
  const maxEndMs = Math.max(...items.map((item) => item.endMs))
  const totalDuration = Math.max(maxEndMs - minStartMs, 1)

  const leftPadding = 62
  const topPadding = 56
  const rightPadding = 120
  const bottomPadding = 52
  const timelineWidth = Math.max(Math.round(totalDuration * 0.22), 1300)

  const depthBuckets = new Map<number, FlatSpan[]>()
  let maxDepth = 0
  for (const item of items) {
    const depth = prepared.depthById.get(item.id) ?? 0
    maxDepth = Math.max(maxDepth, depth)
    const arr = depthBuckets.get(depth) ?? []
    arr.push(item)
    depthBuckets.set(depth, arr)
  }

  const nodeWidth = 208
  const nodeHeight = 68
  const rowGap = 22
  const laneGap = 30

  const byIdPosition = new Map<string, { x: number; y: number }>()
  let currentY = topPadding

  for (let depth = 0; depth <= maxDepth; depth++) {
    const bucket = [...(depthBuckets.get(depth) ?? [])].sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs
      return a.id.localeCompare(b.id)
    })

    const tracksLastX: number[] = []
    const placed: Array<{ id: string; x: number; track: number }> = []

    for (const item of bucket) {
      const ratio = (item.startMs - minStartMs) / totalDuration
      const x = leftPadding + ratio * timelineWidth
      let track = 0
      while (track < tracksLastX.length && x < tracksLastX[track] + 16) {
        track++
      }
      if (track >= tracksLastX.length) tracksLastX.push(x + nodeWidth)
      else tracksLastX[track] = x + nodeWidth
      placed.push({ id: item.id, x, track })
    }

    const laneHeight = Math.max(1, tracksLastX.length) * (nodeHeight + rowGap)

    for (const item of placed) {
      byIdPosition.set(item.id, {
        x: item.x,
        y: currentY + item.track * (nodeHeight + rowGap),
      })
    }

    currentY += laneHeight + laneGap
  }

  const nodes: GraphNode[] = items.map((item) => {
    const pos = byIdPosition.get(item.id) ?? { x: leftPadding, y: topPadding }
    return {
      id: item.id,
      label: item.span.tool_name || item.span.model || item.span.name,
      type: item.type,
      status: item.span.status,
      duration: item.durationMs,
      startMs: item.startMs,
      startOffset: Math.max(item.startMs - minStartMs, 0),
      depth: prepared.depthById.get(item.id) ?? 0,
      sequence: prepared.sequenceById.get(item.id) ?? 0,
      x: pos.x,
      y: pos.y,
      width: nodeWidth,
      height: nodeHeight,
      critical: prepared.criticalPath.has(item.id),
    }
  })

  const maxY = Math.max(
    ...nodes.map((node) => node.y + node.height),
    topPadding,
  )

  return {
    nodes,
    edges,
    canvasWidth: leftPadding + timelineWidth + rightPadding,
    canvasHeight: maxY + bottomPadding,
    minStartMs,
    maxEndMs,
    maxDepth,
  }
}

function GraphNodeCard({
  node,
  isSelected,
  highlightCriticalPath,
  onClick,
}: {
  node: GraphNode
  isSelected: boolean
  highlightCriticalPath: boolean
  onClick: () => void
}) {
  const style = NODE_STYLES[node.type]
  const Icon = style.icon
  const statusBorder = getStatusBorder(node.status)
  const emphasizeCritical = highlightCriticalPath && node.critical
  const deemphasize = highlightCriticalPath && !node.critical
  const criticalEmphasis =
    node.status === 'error'
      ? 'shadow-[0_0_0_1px_rgba(251,113,133,0.32),0_10px_20px_-14px_rgba(225,29,72,0.45)]'
      : 'shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_10px_20px_-14px_rgba(6,182,212,0.32)]'
  const selectedEmphasis =
    'border-primary-500/70 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_12px_24px_-14px_rgba(56,189,248,0.45)]'

  return (
    <button
      type="button"
      data-node-id={node.id}
      onClick={onClick}
      title={`${node.label}\nType: ${node.type.toUpperCase()}\nStatus: ${node.status}\nDuration: ${formatDuration(node.duration)}\nStarted: +${formatDuration(node.startOffset)}\nStep: ${node.sequence}`}
      className={clsx(
        'absolute overflow-hidden rounded-xl border px-3 py-2 text-left shadow-sm outline-none transition-all',
        style.bg,
        statusBorder || style.border,
        emphasizeCritical && criticalEmphasis,
        isSelected && selectedEmphasis,
        deemphasize && 'opacity-55',
        'focus-visible:border-primary-500/75',
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
    >
      <div
        className={clsx(
          'pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-xl',
          style.accent,
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-surface-raised px-1 text-[10px] font-semibold text-content-muted">
            {node.sequence}
          </span>
          <Icon className={clsx('h-4 w-4 shrink-0', style.iconColor)} />
          <span className="truncate text-[12px] font-semibold text-content-primary">
            {node.label}
          </span>
        </div>
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            style.badgeBg,
            style.badgeText,
          )}
        >
          {node.type}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-content-muted">
        <span>{formatDuration(node.duration)}</span>
        <span>+{formatDuration(node.startOffset)}</span>
      </div>
    </button>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-card/70 px-2 py-1 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)] dark:border-slate-700/75 dark:bg-slate-900/50 dark:shadow-[inset_0_1px_0_rgba(148,163,184,0.04)]">
      <div className="text-[10px] uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="text-xs font-semibold text-content-secondary">
        {value}
      </div>
    </div>
  )
}

export function AgentGraph({
  spans,
  selectedSpanId,
  onSpanSelect,
}: AgentGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panStateRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(true)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('flow')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [isPanning, setIsPanning] = useState(false)

  const prepared = useMemo(() => prepareGraph(spans), [spans])
  const filtered = useMemo(
    () => applyFilter(prepared, filterMode),
    [prepared, filterMode],
  )

  const layout = useMemo(
    () =>
      layoutMode === 'flow'
        ? layoutFlow(filtered.items, filtered.edges, prepared)
        : layoutTimeline(filtered.items, filtered.edges, prepared),
    [layoutMode, filtered, prepared],
  )

  const {
    nodes,
    edges,
    canvasWidth,
    canvasHeight,
    minStartMs,
    maxEndMs,
    maxDepth,
  } = layout

  const fitToView = useCallback(() => {
    if (!containerRef.current) return
    containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
  }, [])

  const handlePanStart = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, [role="button"]')) {
      return
    }
    if (!containerRef.current) return

    panStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    }
    setIsPanning(true)
    containerRef.current.setPointerCapture(e.pointerId)
  }, [])

  const handlePanMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    if (panStateRef.current.pointerId !== e.pointerId) return

    const dx = e.clientX - panStateRef.current.startX
    const dy = e.clientY - panStateRef.current.startY

    containerRef.current.scrollLeft = panStateRef.current.scrollLeft - dx
    containerRef.current.scrollTop = panStateRef.current.scrollTop - dy
  }, [])

  const handlePanEnd = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    if (panStateRef.current.pointerId !== e.pointerId) return

    panStateRef.current.pointerId = null
    setIsPanning(false)
    if (containerRef.current.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId)
    }
  }, [])

  useEffect(() => {
    if (!selectedSpanId || !containerRef.current) return
    const nodeEl = containerRef.current.querySelector<HTMLElement>(
      `[data-node-id="${selectedSpanId}"]`,
    )
    if (!nodeEl) return
    nodeEl.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    })
  }, [selectedSpanId])

  const counts = {
    all: prepared.items.length,
    critical: prepared.items.filter((item) =>
      prepared.criticalPath.has(item.id),
    ).length,
    errors: prepared.items.filter((item) => item.span.status === 'error')
      .length,
    llm: prepared.items.filter((item) => item.type === 'llm').length,
    tool: prepared.items.filter((item) => item.type === 'tool').length,
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const totalDuration = Math.max(maxEndMs - minStartMs, 1)
  const showLabels = showEdgeLabels && edges.length <= 80

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const x = 62 + ratio * (canvasWidth - 182)
    return { x, label: formatDuration(totalDuration * ratio) }
  })

  return (
    <div className="relative flex h-[680px] flex-col overflow-hidden rounded-xl border border-border bg-surface-card dark:border-slate-700/80 dark:bg-slate-900/55">
      <div className="z-30 space-y-2 border-b border-border bg-surface-card/95 px-3 py-2 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/85">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-600 dark:text-sky-300">
              <Bot className="h-3 w-3" /> Agent
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-600 dark:text-violet-300">
              <Sparkles className="h-3 w-3" /> LLM
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-300">
              <Wrench className="h-3 w-3" /> Tool
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-surface-raised p-0.5 text-xs dark:border-slate-700/75 dark:bg-slate-800/55">
              {(['flow', 'timeline'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayoutMode(mode)}
                  className={clsx(
                    'rounded px-2 py-1 font-medium capitalize transition-colors',
                    layoutMode === mode
                      ? 'bg-primary-500 text-white'
                      : 'text-content-secondary hover:bg-surface-card',
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowEdgeLabels((v) => !v)}
              className={clsx(
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                showEdgeLabels
                  ? 'border-blue-500/45 bg-blue-500/12 text-blue-700 dark:text-blue-300'
                  : 'border-border/80 bg-surface-card text-content-secondary hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:bg-slate-800/65',
              )}
            >
              Edge Labels
            </button>
            <button
              type="button"
              onClick={() => setHighlightCriticalPath((prev) => !prev)}
              className={clsx(
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                highlightCriticalPath
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                  : 'border-border/80 bg-surface-card text-content-secondary hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:bg-slate-800/65',
              )}
            >
              Critical Path
            </button>
            <button
              type="button"
              onClick={fitToView}
              className="rounded-lg border border-border bg-surface-card p-2 text-content-secondary shadow-sm transition-colors hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:bg-slate-800/65"
              title="Back to start"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['all', counts.all],
              ['critical', counts.critical],
              ['errors', counts.errors],
              ['llm', counts.llm],
              ['tool', counts.tool],
            ] as const
          ).map(([mode, count]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                filterMode === mode
                  ? 'border-primary-500/60 bg-primary-500/15 text-primary-700 dark:text-primary-300'
                  : 'border-border/80 bg-surface-card text-content-muted hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:bg-slate-800/65',
              )}
            >
              {mode === 'all'
                ? 'All'
                : mode === 'llm'
                  ? 'LLM'
                  : mode === 'tool'
                    ? 'Tools'
                    : mode[0]?.toUpperCase() + mode.slice(1)}{' '}
              {count}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetricPill label="Nodes" value={String(nodes.length)} />
          <MetricPill label="Edges" value={String(edges.length)} />
          <MetricPill label="Depth" value={String(maxDepth + 1)} />
          <MetricPill
            label="Max Fan-Out"
            value={String(prepared.metrics.maxFanOut)}
          />
          <MetricPill
            label="Avg Out-Degree"
            value={String(prepared.metrics.avgOutDegree)}
          />
          <MetricPill
            label="Critical Path"
            value={formatDuration(prepared.metrics.criticalDurationMs)}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
        className={clsx(
          'relative flex-1 overflow-auto',
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab',
        )}
      >
        {nodes.length > 0 ? (
          <div
            className="relative mx-auto"
            style={{ width: canvasWidth, height: canvasHeight }}
          >
            {layoutMode === 'flow' &&
              Array.from({ length: maxDepth + 1 }, (_, depth) => depth).map(
                (depth) => {
                  const y = 54 + depth * (76 + 46)
                  return (
                    <div key={`stage-${depth}`}>
                      <div
                        className="absolute left-8 right-8 rounded-lg border border-border/70 bg-surface-raised/35 dark:border-slate-700/60 dark:bg-slate-900/35"
                        style={{ top: y - 10, height: 96 }}
                      />
                      <span
                        className="absolute left-10 text-[10px] font-semibold uppercase tracking-wide text-content-muted"
                        style={{ top: y - 18 }}
                      >
                        Stage {depth + 1}
                      </span>
                    </div>
                  )
                },
              )}

            {layoutMode === 'timeline' &&
              timeTicks.map((tick, idx) => (
                <div key={`tick-${tick.label}-${idx}`}>
                  <div
                    className="absolute bottom-0 top-0 border-l border-border/70 border-dashed dark:border-slate-700/70"
                    style={{ left: tick.x }}
                  />
                  <span
                    className="absolute top-3 -translate-x-1/2 text-[10px] text-content-muted"
                    style={{ left: tick.x }}
                  >
                    {tick.label}
                  </span>
                </div>
              ))}

            <svg
              className="absolute inset-0 pointer-events-none"
              role="img"
              aria-label="Execution graph edges"
              width={canvasWidth}
              height={canvasHeight}
            >
              <title>Execution graph edges</title>
              {edges.map((edge, edgeIndex) => {
                const from = nodeMap.get(edge.from)
                const to = nodeMap.get(edge.to)
                if (!from || !to) return null

                const x1 = from.x + from.width / 2
                const y1 = from.y + from.height
                const x2 = to.x + to.width / 2
                const y2 = to.y
                const dy = Math.max((y2 - y1) * 0.5, 26)

                const isCritical = highlightCriticalPath && edge.critical
                const isMuted = highlightCriticalPath && !edge.critical
                const stroke = isCritical
                  ? '#22d3ee'
                  : edge.kind === 'temporal'
                    ? '#60a5fa'
                    : '#94a3b8'
                const deltaStart = Math.max(to.startMs - from.startMs, 0)
                const labelText = `+${formatDuration(deltaStart)}`

                // Place label on the Bezier midpoint and offset it normal to the
                // curve, so it doesn't sit directly on top of the edge.
                const t = 0.5
                const omt = 1 - t
                const cx1 = x1
                const cy1 = y1 + dy
                const cx2 = x2
                const cy2 = y2 - dy
                const curveX =
                  omt * omt * omt * x1 +
                  3 * omt * omt * t * cx1 +
                  3 * omt * t * t * cx2 +
                  t * t * t * x2
                const curveY =
                  omt * omt * omt * y1 +
                  3 * omt * omt * t * cy1 +
                  3 * omt * t * t * cy2 +
                  t * t * t * y2
                const tangentX =
                  3 * omt * omt * (cx1 - x1) +
                  6 * omt * t * (cx2 - cx1) +
                  3 * t * t * (x2 - cx2)
                const tangentY =
                  3 * omt * omt * (cy1 - y1) +
                  6 * omt * t * (cy2 - cy1) +
                  3 * t * t * (y2 - cy2)
                const tangentLen = Math.hypot(tangentX, tangentY) || 1
                const normalX = -tangentY / tangentLen
                const normalY = tangentX / tangentLen
                const side = edgeIndex % 2 === 0 ? 1 : -1
                const labelOffset = 12 + (edgeIndex % 3) * 2
                const labelX = curveX + normalX * labelOffset * side
                const labelY = curveY + normalY * labelOffset * side

                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <path
                      d={`M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isCritical ? 2.8 : 1.7}
                      opacity={isMuted ? 0.24 : 0.9}
                    />
                    {showLabels && (
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                        className="fill-slate-600 dark:fill-slate-400 stroke-white/92 dark:stroke-slate-950/70"
                        strokeWidth="1.6"
                        paintOrder="stroke"
                        opacity={isMuted ? 0.4 : 0.9}
                      >
                        {labelText}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {nodes.map((node) => (
              <GraphNodeCard
                key={node.id}
                node={node}
                isSelected={node.id === selectedSpanId}
                highlightCriticalPath={highlightCriticalPath}
                onClick={() => onSpanSelect?.(node.id)}
              />
            ))}
          </div>
        ) : (
          <div className="m-3 flex h-64 items-center justify-center rounded-lg border border-border bg-surface-raised/45 text-sm text-content-muted dark:border-slate-700/75 dark:bg-slate-900/45">
            No nodes match this filter. Choose another filter to continue
            exploring the graph.
          </div>
        )}

        <div className="pointer-events-none sticky bottom-3 float-right mr-3 rounded border border-border bg-surface-overlay/85 px-2 py-1 text-[10px] text-content-muted dark:border-slate-700/80 dark:bg-slate-900/80">
          {nodes.length} nodes · {edges.length} edges ·{' '}
          {formatDuration(totalDuration)} total
        </div>
      </div>
    </div>
  )
}
