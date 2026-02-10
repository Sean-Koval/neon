'use client'

/**
 * Multi-Agent Execution Flow
 *
 * Visualizes the execution flow across multiple agents in a swimlane view.
 * Shows handoffs, timing, and status for each agent.
 */

import { clsx } from 'clsx'
import { AlertCircle, CheckCircle, Clock, User, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentExecution,
  AgentHandoff,
  MultiAgentAnalysis,
} from '@/lib/multi-agent-analysis'

// =============================================================================
// Helpers
// =============================================================================

function getStatusConfig(status: AgentExecution['status'], isDark: boolean) {
  const configs: Record<
    AgentExecution['status'],
    {
      color: string
      barFill: string
      borderStroke: string
      icon: typeof CheckCircle
    }
  > = {
    success: {
      color: 'text-emerald-600 dark:text-emerald-400',
      barFill: isDark ? '#14532d' : '#bbf7d0',
      borderStroke: isDark ? '#34d399' : '#86efac',
      icon: CheckCircle,
    },
    error: {
      color: 'text-rose-600 dark:text-rose-400',
      barFill: isDark ? '#7f1d1d' : '#fecdd3',
      borderStroke: isDark ? '#fb7185' : '#fda4af',
      icon: XCircle,
    },
    running: {
      color: 'text-blue-600 dark:text-blue-400',
      barFill: isDark ? '#1e3a8a' : '#bfdbfe',
      borderStroke: isDark ? '#60a5fa' : '#93c5fd',
      icon: Clock,
    },
    unknown: {
      color: 'text-content-secondary',
      barFill: isDark ? '#334155' : '#e5e7eb',
      borderStroke: isDark ? '#64748b' : '#d1d5db',
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
  const [isDark, setIsDark] = useState(false)

  const { agents, handoffs } = analysis

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setIsDark(root.classList.contains('dark'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

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

  const palette = isDark
    ? {
        axis: '#334155',
        grid: '#334155',
        laneHover: '#0f172a',
        laneLabelFill: '#1e293b',
        laneLabelFillOrchestrator: '#172554',
        laneLabelStroke: '#475569',
        laneLabelStrokeActive: '#60a5fa',
        statusIconBg: '#0f172a',
      }
    : {
        axis: '#cbd5e1',
        grid: '#dbe3ec',
        laneHover: '#f8fafc',
        laneLabelFill: '#f8fafc',
        laneLabelFillOrchestrator: '#e0ecff',
        laneLabelStroke: '#cbd5e1',
        laneLabelStrokeActive: '#3b82f6',
        statusIconBg: '#ffffff',
      }

  if (agents.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-surface-card rounded-lg border border-border text-content-muted"
        style={{ height }}
      >
        <User className="w-12 h-12 mb-4 text-content-muted/50" />
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
        role="img"
        aria-label="Multi-agent execution timeline"
      >
        <title>Multi-agent execution timeline</title>
        {/* Time axis */}
        <g className="time-axis">
          <line
            x1={labelWidth}
            y1={0}
            x2="100%"
            y2={0}
            stroke={palette.axis}
            strokeWidth={1}
          />
          {/* Time markers */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const time = minTime + (maxTime - minTime) * ratio
            const x = timeToX(time)
            return (
              <g key={`time-${Math.round(time - minTime)}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={agents.length * laneHeight}
                  stroke={palette.grid}
                  strokeWidth={1}
                  strokeDasharray="4"
                />
                <text
                  x={x}
                  y={agents.length * laneHeight + 20}
                  textAnchor="middle"
                  className="text-xs fill-slate-500 dark:fill-slate-300"
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
          const statusConfig = getStatusConfig(agent.status, isDark)
          const startX = timeToX(agent.startTime)
          const endX = timeToX(agent.endTime)
          const width = Math.max(endX - startX, 20)
          const labelCenterX = 5 + (labelWidth - 15) / 2
          const labelCenterY = y + (laneHeight - 20) / 2

          const isHovered = hoveredAgent === agent.agentId
          const isSelected = selectedAgentId === agent.agentId

          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG group elements are used for interactive lanes in the chart.
            <g
              key={agent.agentId}
              className="agent-lane cursor-pointer"
              onMouseEnter={() => setHoveredAgent(agent.agentId)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => onAgentClick?.(agent)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onAgentClick?.(agent)
                }
              }}
            >
              {/* Lane background */}
              <rect
                x={0}
                y={y - 5}
                width="100%"
                height={laneHeight - 10}
                fill={
                  isHovered || isSelected ? palette.laneHover : 'transparent'
                }
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
                  fill={
                    agent.isOrchestrator
                      ? palette.laneLabelFillOrchestrator
                      : palette.laneLabelFill
                  }
                  stroke={
                    isSelected
                      ? palette.laneLabelStrokeActive
                      : palette.laneLabelStroke
                  }
                  strokeWidth={2}
                />
                <text
                  x={labelCenterX}
                  y={labelCenterY - 6}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-medium fill-slate-800 dark:fill-slate-200"
                >
                  {agent.agentName.slice(0, 12)}
                </text>
                <text
                  x={labelCenterX}
                  y={labelCenterY + 7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] fill-slate-500 dark:fill-slate-300"
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
                fill={statusConfig.barFill}
                className={clsx(
                  'transition-all',
                  (isHovered || isSelected) && 'opacity-95',
                )}
                stroke={isSelected ? '#2563eb' : statusConfig.borderStroke}
                strokeWidth={isSelected ? 2 : 1}
              />

              {/* Status icon */}
              {(() => {
                const StatusIcon = statusConfig.icon
                return (
                  <g
                    transform={`translate(${endX + 5}, ${y + laneHeight / 2 - 15})`}
                  >
                    <circle cx={8} cy={8} r={10} fill={palette.statusIconBg} />
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
                y={y + laneHeight / 2 - 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-medium fill-slate-700 dark:fill-slate-200 pointer-events-none"
              >
                {formatDuration(agent.durationMs)}
              </text>
            </g>
          )
        })}

        {/* Handoff arrows */}
        {handoffs.map((handoff) => {
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
            // biome-ignore lint/a11y/useSemanticElements: SVG group elements are used for interactive handoff curves.
            <g
              key={`${handoff.fromAgentId}-${handoff.toAgentId}-${handoff.timestamp.getTime()}`}
              className="handoff cursor-pointer"
              onClick={() => onHandoffClick?.(handoff)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onHandoffClick?.(handoff)
                }
              }}
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
                  className="text-[9px] fill-blue-700 dark:fill-blue-300 font-medium"
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
      className="bg-surface-card rounded-lg border border-border animate-pulse flex flex-col"
      style={{ height }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 border-b border-border last:border-0"
        >
          <div className="w-20 h-8 bg-surface-raised rounded" />
          <div className="flex-1 h-6 bg-surface-raised rounded" />
        </div>
      ))}
    </div>
  )
}
