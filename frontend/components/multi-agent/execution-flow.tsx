'use client'

/**
 * Multi-Agent Execution Flow
 *
 * Visualizes the execution flow across multiple agents in a swimlane view.
 * Shows handoffs, timing, and status for each agent.
 */

import { clsx } from 'clsx'
import { AlertCircle, CheckCircle, Clock, User, XCircle } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type {
  AgentExecution,
  AgentHandoff,
  MultiAgentAnalysis,
} from '@/lib/multi-agent-analysis'

// =============================================================================
// Helpers
// =============================================================================

function getStatusConfig(status: AgentExecution['status']) {
  const configs: Record<
    AgentExecution['status'],
    {
      color: string
      bgColor: string
      borderColor: string
      icon: typeof CheckCircle
    }
  > = {
    success: {
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
      borderColor: 'border-emerald-300',
      icon: CheckCircle,
    },
    error: {
      color: 'text-rose-600',
      bgColor: 'bg-rose-100',
      borderColor: 'border-rose-300',
      icon: XCircle,
    },
    running: {
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-300',
      icon: Clock,
    },
    unknown: {
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      borderColor: 'border-gray-300',
      icon: AlertCircle,
    },
  }
  return configs[status]
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// =============================================================================
// Component
// =============================================================================

interface MultiAgentExecutionFlowProps {
  analysis: MultiAgentAnalysis
  height?: number
  onAgentClick?: (agent: AgentExecution) => void
  onHandoffClick?: (handoff: AgentHandoff) => void
  selectedAgentId?: string
}

export function MultiAgentExecutionFlow({
  analysis,
  height = 400,
  onAgentClick,
  onHandoffClick,
  selectedAgentId,
}: MultiAgentExecutionFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  const { agents, handoffs } = analysis

  // Calculate time range and scale
  const { minTime, maxTime, timeScale, laneHeight, labelWidth } =
    useMemo(() => {
      if (agents.length === 0) {
        return {
          minTime: 0,
          maxTime: 1,
          timeScale: 1,
          laneHeight: 60,
          labelWidth: 120,
        }
      }

      const times = agents.flatMap((a) => [
        a.startTime.getTime(),
        a.endTime.getTime(),
      ])
      const min = Math.min(...times)
      const max = Math.max(...times)
      const duration = max - min || 1

      const labelW = 120
      const availableWidth = 800 - labelW // Approximate width
      const scale = availableWidth / duration

      const laneH = Math.max(50, Math.min(80, height / agents.length))

      return {
        minTime: min,
        maxTime: max,
        timeScale: scale,
        laneHeight: laneH,
        labelWidth: labelW,
      }
    }, [agents, height])

  // Convert time to X position
  const timeToX = (time: Date | number) => {
    const t = typeof time === 'number' ? time : time.getTime()
    return labelWidth + (t - minTime) * timeScale
  }

  if (agents.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-gray-50 rounded-lg border text-gray-500"
        style={{ height }}
      >
        <User className="w-12 h-12 mb-4 text-gray-300" />
        <p className="text-lg font-medium">No agents found</p>
        <p className="text-sm">Multi-agent execution data will appear here</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto"
      style={{ height }}
    >
      <svg
        width="100%"
        height={agents.length * laneHeight + 50}
        className="min-w-[800px]"
      >
        {/* Time axis */}
        <g className="time-axis">
          <line
            x1={labelWidth}
            y1={0}
            x2="100%"
            y2={0}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          {/* Time markers */}
          {Array.from({ length: 5 }).map((_, i) => {
            const time = minTime + (maxTime - minTime) * (i / 4)
            const x = timeToX(time)
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={agents.length * laneHeight}
                  stroke="#f3f4f6"
                  strokeWidth={1}
                  strokeDasharray="4"
                />
                <text
                  x={x}
                  y={agents.length * laneHeight + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-400"
                >
                  {formatDuration(time - minTime)}
                </text>
              </g>
            )
          })}
        </g>

        {/* Lanes */}
        {agents.map((agent, idx) => {
          const y = idx * laneHeight + 10
          const statusConfig = getStatusConfig(agent.status)
          const startX = timeToX(agent.startTime)
          const endX = timeToX(agent.endTime)
          const width = Math.max(endX - startX, 20)

          const isHovered = hoveredAgent === agent.agentId
          const isSelected = selectedAgentId === agent.agentId

          return (
            <g
              key={agent.agentId}
              className="agent-lane cursor-pointer"
              onMouseEnter={() => setHoveredAgent(agent.agentId)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => onAgentClick?.(agent)}
            >
              {/* Lane background */}
              <rect
                x={0}
                y={y - 5}
                width="100%"
                height={laneHeight - 10}
                fill={isHovered || isSelected ? '#f9fafb' : 'transparent'}
                className="transition-all"
              />

              {/* Agent label */}
              <g>
                <rect
                  x={5}
                  y={y}
                  width={labelWidth - 15}
                  height={laneHeight - 20}
                  rx={4}
                  fill={agent.isOrchestrator ? '#e0e7ff' : '#f3f4f6'}
                  stroke={isSelected ? '#6366f1' : 'transparent'}
                  strokeWidth={2}
                />
                <text
                  x={10}
                  y={y + laneHeight / 2 - 4}
                  className="text-xs font-medium fill-gray-900"
                >
                  {agent.agentName.slice(0, 12)}
                </text>
                <text
                  x={10}
                  y={y + laneHeight / 2 + 8}
                  className="text-[10px] fill-gray-500"
                >
                  {agent.spanCount} spans
                </text>
              </g>

              {/* Execution bar */}
              <rect
                x={startX}
                y={y + 5}
                width={width}
                height={laneHeight - 30}
                rx={4}
                fill={statusConfig.bgColor.replace('bg-', '')}
                className={clsx(
                  'transition-all',
                  statusConfig.bgColor === 'bg-emerald-100' &&
                    'fill-emerald-200',
                  statusConfig.bgColor === 'bg-rose-100' && 'fill-rose-200',
                  statusConfig.bgColor === 'bg-blue-100' && 'fill-blue-200',
                  statusConfig.bgColor === 'bg-gray-100' && 'fill-gray-200',
                  (isHovered || isSelected) && 'opacity-90',
                )}
                stroke={
                  isSelected
                    ? '#6366f1'
                    : statusConfig.borderColor.replace('border-', '')
                }
                strokeWidth={isSelected ? 2 : 1}
              />

              {/* Status icon */}
              {(() => {
                const StatusIcon = statusConfig.icon
                return (
                  <g
                    transform={`translate(${endX + 5}, ${y + laneHeight / 2 - 15})`}
                  >
                    <circle cx={8} cy={8} r={10} fill="white" />
                    <foreignObject width={16} height={16} x={0} y={0}>
                      <StatusIcon
                        className={clsx('w-4 h-4', statusConfig.color)}
                      />
                    </foreignObject>
                  </g>
                )
              })()}

              {/* Duration label */}
              <text
                x={startX + width / 2}
                y={y + laneHeight / 2 - 5}
                textAnchor="middle"
                className="text-[10px] font-medium fill-gray-700 pointer-events-none"
              >
                {formatDuration(agent.durationMs)}
              </text>
            </g>
          )
        })}

        {/* Handoff arrows */}
        {handoffs.map((handoff, idx) => {
          const fromAgent = agents.find(
            (a) => a.agentId === handoff.fromAgentId,
          )
          const toAgent = agents.find((a) => a.agentId === handoff.toAgentId)

          if (!fromAgent || !toAgent) return null

          const fromIdx = agents.indexOf(fromAgent)
          const toIdx = agents.indexOf(toAgent)

          const x = timeToX(handoff.timestamp)
          const fromY = fromIdx * laneHeight + laneHeight / 2
          const toY = toIdx * laneHeight + laneHeight / 2

          // Calculate curve for the arrow
          const midY = (fromY + toY) / 2
          const controlX = x + 30 * (toIdx > fromIdx ? 1 : -1)

          return (
            <g
              key={`handoff-${idx}`}
              className="handoff cursor-pointer"
              onClick={() => onHandoffClick?.(handoff)}
            >
              <path
                d={`M ${x} ${fromY} Q ${controlX} ${midY} ${x} ${toY}`}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
                className="hover:stroke-primary-700"
              />
              {/* Latency label */}
              {handoff.handoffDurationMs > 100 && (
                <text
                  x={controlX}
                  y={midY}
                  textAnchor="middle"
                  className="text-[9px] fill-indigo-600 font-medium"
                >
                  {formatDuration(handoff.handoffDurationMs)}
                </text>
              )}
            </g>
          )
        })}

        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth={10}
            markerHeight={7}
            refX={9}
            refY={3.5}
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function MultiAgentExecutionFlowSkeleton({
  height = 400,
}: {
  height?: number
}) {
  return (
    <div
      className="bg-gray-50 rounded-lg border animate-pulse flex flex-col"
      style={{ height }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 border-b last:border-0"
        >
          <div className="w-20 h-8 bg-gray-200 rounded" />
          <div className="flex-1 h-6 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}
