/**
 * Multi-Agent Analysis Utilities
 *
 * Provides analysis functions for understanding multi-agent system behavior:
 * - Agent execution flow detection
 * - Cross-agent handoff identification
 * - Cascading failure detection
 * - Agent correlation analysis
 */

import type { SpanWithChildren, Trace } from '@neon/shared'
import {
  detectFailureCascades,
  getAgentCorrelations,
  getHandoffLatencies,
  type CascadeLink,
  type AgentCorrelationRecord,
  type HandoffLatencyRecord,
} from './clickhouse'

// =============================================================================
// Types
// =============================================================================

export type AgentStatus = 'running' | 'success' | 'error' | 'unknown'

export interface AgentExecution {
  /** Agent identifier */
  agentId: string
  /** Agent display name */
  agentName: string
  /** All spans belonging to this agent */
  spans: SpanWithChildren[]
  /** First span timestamp */
  startTime: Date
  /** Last span end time */
  endTime: Date
  /** Total duration in ms */
  durationMs: number
  /** Execution status */
  status: AgentStatus
  /** Number of spans */
  spanCount: number
  /** Number of errors */
  errorCount: number
  /** Whether this is an orchestrator */
  isOrchestrator: boolean
}

export interface AgentHandoff {
  /** Source agent ID */
  fromAgentId: string
  /** Target agent ID */
  toAgentId: string
  /** Timestamp of handoff */
  timestamp: Date
  /** Span ID where handoff occurred */
  spanId: string
  /** Optional payload/message passed */
  payload?: string
  /** Duration of the handoff (time between agents) */
  handoffDurationMs: number
}

export interface AgentMessage {
  /** Message ID */
  id: string
  /** Sending agent ID */
  fromAgentId: string
  /** Receiving agent ID */
  toAgentId: string
  /** Message type */
  type: 'task_assignment' | 'result' | 'error' | 'status' | 'other'
  /** Message content (truncated) */
  content: string
  /** Timestamp */
  timestamp: Date
  /** Associated span ID */
  spanId: string
}

export interface CascadeChain {
  /** The root cause agent/span */
  rootCause: {
    agentId: string
    spanId: string
    errorMessage?: string
  }
  /** Chain of affected agents */
  affectedAgents: Array<{
    agentId: string
    spanId: string
    errorMessage?: string
  }>
  /** Total impact score (number of downstream failures) */
  impactScore: number
}

export interface AgentCorrelation {
  /** First agent */
  agentA: string
  /** Second agent */
  agentB: string
  /** Correlation coefficient (-1 to 1) */
  correlation: number
  /** Sample size */
  sampleSize: number
  /** Relationship type */
  relationship: 'parent-child' | 'peer' | 'sequential' | 'unknown'
}

export interface MultiAgentAnalysis {
  /** All agent executions */
  agents: AgentExecution[]
  /** Handoffs between agents */
  handoffs: AgentHandoff[]
  /** Inter-agent messages */
  messages: AgentMessage[]
  /** Detected cascade chains */
  cascadeChains: CascadeChain[]
  /** Agent correlations */
  correlations: AgentCorrelation[]
  /** Summary stats */
  summary: {
    totalAgents: number
    activeAgents: number
    failedAgents: number
    totalHandoffs: number
    avgHandoffLatency: number
  }
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Extract agent executions from spans
 */
function extractAgentExecutions(
  spans: SpanWithChildren[],
  trace?: Trace,
): AgentExecution[] {
  const agentMap = new Map<string, SpanWithChildren[]>()

  // Group spans by agent
  function groupByAgent(spanList: SpanWithChildren[]) {
    for (const span of spanList) {
      // Get agent ID from trace or span attributes
      const agentId =
        span.attributes?.['agent.id'] ||
        span.attributes?.agent_id ||
        (trace as Trace & { agentId?: string })?.agentId ||
        'default'

      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, [])
      }
      agentMap.get(agentId)?.push(span)

      if (span.children && span.children.length > 0) {
        groupByAgent(span.children)
      }
    }
  }

  groupByAgent(spans)

  // Convert to AgentExecution objects
  const executions: AgentExecution[] = []

  for (const [agentId, agentSpans] of agentMap) {
    const sortedSpans = [...agentSpans].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )

    const firstSpan = sortedSpans[0]
    const lastSpan = sortedSpans[sortedSpans.length - 1]

    const startTime = new Date(firstSpan.timestamp)
    const endTime = lastSpan.endTime ? new Date(lastSpan.endTime) : new Date()

    const errorCount = agentSpans.filter((s) => s.status === 'error').length
    const hasError = errorCount > 0

    // Detect orchestrator (has spans with componentType 'routing' or 'planning')
    const isOrchestrator = agentSpans.some(
      (s) => s.componentType === 'routing' || s.componentType === 'planning',
    )

    // Derive agent name
    const agentName =
      firstSpan.attributes?.['agent.name'] ||
      firstSpan.attributes?.agent_name ||
      agentId

    executions.push({
      agentId,
      agentName,
      spans: agentSpans,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      status: hasError ? 'error' : 'success',
      spanCount: agentSpans.length,
      errorCount,
      isOrchestrator,
    })
  }

  return executions.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  )
}

/**
 * Detect handoffs between agents
 */
function detectHandoffs(agents: AgentExecution[]): AgentHandoff[] {
  const handoffs: AgentHandoff[] = []

  // Sort all spans chronologically with agent info
  const allSpansWithAgent: Array<{ span: SpanWithChildren; agentId: string }> =
    []
  for (const agent of agents) {
    for (const span of agent.spans) {
      allSpansWithAgent.push({ span, agentId: agent.agentId })
    }
  }

  allSpansWithAgent.sort(
    (a, b) =>
      new Date(a.span.timestamp).getTime() -
      new Date(b.span.timestamp).getTime(),
  )

  // Detect sequential agent transitions
  let prevAgentId: string | null = null
  let prevSpanEnd: Date | null = null

  for (const { span, agentId } of allSpansWithAgent) {
    if (prevAgentId && prevAgentId !== agentId && prevSpanEnd) {
      const spanStart = new Date(span.timestamp)
      handoffs.push({
        fromAgentId: prevAgentId,
        toAgentId: agentId,
        timestamp: spanStart,
        spanId: span.spanId,
        handoffDurationMs: spanStart.getTime() - prevSpanEnd.getTime(),
      })
    }

    prevAgentId = agentId
    prevSpanEnd = span.endTime
      ? new Date(span.endTime)
      : new Date(span.timestamp)
  }

  return handoffs
}

/**
 * Extract messages between agents
 */
function extractMessages(spans: SpanWithChildren[]): AgentMessage[] {
  const messages: AgentMessage[] = []

  function processSpan(span: SpanWithChildren) {
    // Look for message-like attributes
    const fromAgent = span.attributes?.['message.from_agent']
    const toAgent = span.attributes?.['message.to_agent']

    if (fromAgent && toAgent) {
      const type =
        (span.attributes?.['message.type'] as AgentMessage['type']) || 'other'
      const content =
        span.output ||
        span.toolOutput ||
        span.attributes?.['message.content'] ||
        ''

      messages.push({
        id: `msg-${span.spanId}`,
        fromAgentId: fromAgent,
        toAgentId: toAgent,
        type,
        content: content.slice(0, 500),
        timestamp: new Date(span.timestamp),
        spanId: span.spanId,
      })
    }

    if (span.children) {
      for (const child of span.children) {
        processSpan(child)
      }
    }
  }

  for (const span of spans) {
    processSpan(span)
  }

  return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

/**
 * Detect cascading failures across agents
 */
function detectCascadingFailures(
  agents: AgentExecution[],
  handoffs: AgentHandoff[],
): CascadeChain[] {
  const chains: CascadeChain[] = []

  // Build a dependency graph from handoffs
  const downstreamAgents = new Map<string, string[]>()
  for (const handoff of handoffs) {
    if (!downstreamAgents.has(handoff.fromAgentId)) {
      downstreamAgents.set(handoff.fromAgentId, [])
    }
    downstreamAgents.get(handoff.fromAgentId)?.push(handoff.toAgentId)
  }

  // Find failed agents
  const failedAgents = agents.filter((a) => a.status === 'error')

  // For each failed agent, find downstream failures
  for (const failedAgent of failedAgents) {
    const affectedAgents: CascadeChain['affectedAgents'] = []
    const visited = new Set<string>()

    function findDownstreamFailures(agentId: string) {
      const downstream = downstreamAgents.get(agentId) || []
      for (const downId of downstream) {
        if (visited.has(downId)) continue
        visited.add(downId)

        const downAgent = agents.find((a) => a.agentId === downId)
        if (downAgent?.status === 'error') {
          const errorSpan = downAgent.spans.find((s) => s.status === 'error')
          affectedAgents.push({
            agentId: downId,
            spanId: errorSpan?.spanId || '',
            errorMessage: errorSpan?.statusMessage,
          })
          findDownstreamFailures(downId)
        }
      }
    }

    findDownstreamFailures(failedAgent.agentId)

    if (affectedAgents.length > 0) {
      const errorSpan = failedAgent.spans.find((s) => s.status === 'error')
      chains.push({
        rootCause: {
          agentId: failedAgent.agentId,
          spanId: errorSpan?.spanId || '',
          errorMessage: errorSpan?.statusMessage,
        },
        affectedAgents,
        impactScore: affectedAgents.length,
      })
    }
  }

  return chains.sort((a, b) => b.impactScore - a.impactScore)
}

/**
 * Calculate correlations between agents
 */
function calculateCorrelations(
  agents: AgentExecution[],
  handoffs: AgentHandoff[],
): AgentCorrelation[] {
  const correlations: AgentCorrelation[] = []

  // Build relationship map
  const relationships = new Map<
    string,
    'parent-child' | 'peer' | 'sequential'
  >()
  for (const handoff of handoffs) {
    const key = [handoff.fromAgentId, handoff.toAgentId].sort().join(':')
    if (!relationships.has(key)) {
      relationships.set(key, 'sequential')
    }
  }

  // Calculate pairwise correlations based on success/failure patterns
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const agentA = agents[i]
      const agentB = agents[j]

      // Simple correlation: both succeed or both fail = positive correlation
      const aSuccess = agentA.status === 'success' ? 1 : 0
      const bSuccess = agentB.status === 'success' ? 1 : 0

      // Very simplified correlation calculation
      const correlation = aSuccess === bSuccess ? 0.5 : -0.5

      const key = [agentA.agentId, agentB.agentId].sort().join(':')
      const relationship = relationships.get(key) || 'unknown'

      correlations.push({
        agentA: agentA.agentId,
        agentB: agentB.agentId,
        correlation,
        sampleSize: 1,
        relationship,
      })
    }
  }

  return correlations
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Analyze multi-agent trace for debugging insights
 *
 * @example
 * ```typescript
 * const analysis = analyzeMultiAgentTrace(trace.spans, trace.trace)
 * console.log(`Found ${analysis.summary.totalAgents} agents`)
 * console.log(`${analysis.cascadeChains.length} cascade chains detected`)
 * ```
 */
export function analyzeMultiAgentTrace(
  spans: SpanWithChildren[],
  trace?: Trace,
): MultiAgentAnalysis {
  const agents = extractAgentExecutions(spans, trace)
  const handoffs = detectHandoffs(agents)
  const messages = extractMessages(spans)
  const cascadeChains = detectCascadingFailures(agents, handoffs)
  const correlations = calculateCorrelations(agents, handoffs)

  const avgHandoffLatency =
    handoffs.length > 0
      ? handoffs.reduce((sum, h) => sum + h.handoffDurationMs, 0) /
        handoffs.length
      : 0

  return {
    agents,
    handoffs,
    messages,
    cascadeChains,
    correlations,
    summary: {
      totalAgents: agents.length,
      activeAgents: agents.filter(
        (a) => a.status === 'success' || a.status === 'running',
      ).length,
      failedAgents: agents.filter((a) => a.status === 'error').length,
      totalHandoffs: handoffs.length,
      avgHandoffLatency: Math.round(avgHandoffLatency),
    },
  }
}

// =============================================================================
// Enhanced DB-backed Analysis
// =============================================================================

export interface MultiAgentAnalysisWithDB extends MultiAgentAnalysis {
  /** ClickHouse-sourced failure cascade links */
  dbCascades: CascadeLink[]
  /** ClickHouse-sourced agent correlations */
  dbCorrelations: AgentCorrelationRecord[]
  /** ClickHouse-sourced handoff latencies */
  dbHandoffLatencies: HandoffLatencyRecord[]
}

/**
 * Enhanced multi-agent analysis that combines client-side span analysis
 * with ClickHouse-backed aggregate queries for correlation data.
 *
 * Use this when you have access to ClickHouse and want richer
 * cross-trace correlation data alongside single-trace analysis.
 */
export async function analyzeMultiAgentTraceWithDB(
  spans: SpanWithChildren[],
  projectId: string,
  traceId: string,
  options?: {
    trace?: Trace
    correlationWindow?: { startDate: string; endDate: string }
  },
): Promise<MultiAgentAnalysisWithDB> {
  // Run client-side analysis first
  const clientAnalysis = analyzeMultiAgentTrace(spans, options?.trace)

  // Run ClickHouse queries in parallel
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const startDate =
    options?.correlationWindow?.startDate ??
    thirtyDaysAgo.toISOString().split('T')[0]
  const endDate =
    options?.correlationWindow?.endDate ?? now.toISOString().split('T')[0]

  const [dbCascades, dbCorrelations, dbHandoffLatencies] = await Promise.all([
    detectFailureCascades(projectId, traceId),
    getAgentCorrelations(projectId, startDate, endDate),
    getHandoffLatencies(projectId, startDate, endDate),
  ])

  return {
    ...clientAnalysis,
    dbCascades,
    dbCorrelations,
    dbHandoffLatencies,
  }
}
