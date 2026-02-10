'use client'

/**
 * MCP Server Topology
 *
 * Visualizes the network topology of MCP servers and their connections.
 */

import { clsx } from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MCPServerStatus,
  MCPTopology,
  MCPTopologyEdge,
  MCPTopologyNode,
} from '@/hooks/use-mcp-health'

// =============================================================================
// Types
// =============================================================================

interface Point {
  x: number
  y: number
}

interface PositionedNode extends MCPTopologyNode {
  x: number
  y: number
  vx: number
  vy: number
}

// =============================================================================
// Helpers
// =============================================================================

function getNodeColor(
  status: MCPServerStatus,
  type: 'fill' | 'stroke',
): string {
  const colors: Record<MCPServerStatus, { fill: string; stroke: string }> = {
    healthy: { fill: '#10b981', stroke: '#059669' },
    degraded: { fill: '#f59e0b', stroke: '#d97706' },
    unhealthy: { fill: '#ef4444', stroke: '#dc2626' },
    unknown: { fill: '#6b7280', stroke: '#4b5563' },
  }
  return colors[status][type]
}

function getNodeSize(type: MCPTopologyNode['type']): number {
  const sizes: Record<MCPTopologyNode['type'], number> = {
    agent: 28,
    server: 22,
    tool: 14,
  }
  return sizes[type]
}

// Simple force-directed layout
function calculateLayout(
  nodes: MCPTopologyNode[],
  edges: MCPTopologyEdge[],
  width: number,
  height: number,
  iterations: number = 100,
): PositionedNode[] {
  // Initialize positions randomly
  const positioned: PositionedNode[] = nodes.map((node, _i) => ({
    ...node,
    x: width / 2 + (Math.random() - 0.5) * width * 0.5,
    y: height / 2 + (Math.random() - 0.5) * height * 0.5,
    vx: 0,
    vy: 0,
  }))

  // Build adjacency map
  const nodeMap = new Map(positioned.map((n) => [n.id, n]))

  // Force simulation parameters
  const repulsion = 5000
  const attraction = 0.05
  const damping = 0.8
  const centerForce = 0.01

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const n1 = positioned[i]
        const n2 = positioned[j]
        const dx = n2.x - n1.x
        const dy = n2.y - n1.y
        const dist = Math.sqrt(dx * dx + dy * dy) + 1
        const force = repulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        n1.vx -= fx
        n1.vy -= fy
        n2.vx += fx
        n2.vy += fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const n1 = nodeMap.get(edge.source)
      const n2 = nodeMap.get(edge.target)
      if (!n1 || !n2) continue

      const dx = n2.x - n1.x
      const dy = n2.y - n1.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const force = attraction * dist
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      n1.vx += fx
      n1.vy += fy
      n2.vx -= fx
      n2.vy -= fy
    }

    // Center force
    for (const node of positioned) {
      node.vx += (width / 2 - node.x) * centerForce
      node.vy += (height / 2 - node.y) * centerForce
    }

    // Apply velocities with damping
    for (const node of positioned) {
      node.vx *= damping
      node.vy *= damping
      node.x += node.vx
      node.y += node.vy

      // Keep within bounds
      const r = getNodeSize(node.type)
      node.x = Math.max(r + 10, Math.min(width - r - 10, node.x))
      node.y = Math.max(r + 10, Math.min(height - r - 10, node.y))
    }
  }

  return positioned
}

// =============================================================================
// Component
// =============================================================================

interface MCPServerTopologyProps {
  topology: MCPTopology
  height?: number
  onNodeClick?: (node: MCPTopologyNode) => void
}

export function MCPServerTopology({
  topology,
  height = 400,
  onNodeClick,
}: MCPServerTopologyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      setDimensions({ width, height })
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [height])

  // Calculate layout
  const positionedNodes = useMemo(() => {
    if (topology.nodes.length === 0) return []
    return calculateLayout(
      topology.nodes,
      topology.edges,
      dimensions.width,
      dimensions.height,
      150,
    )
  }, [topology, dimensions])

  // Build node map for edge rendering
  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes],
  )

  // Handle node click
  const handleNodeClick = useCallback(
    (node: PositionedNode) => {
      setSelectedNode(node.id === selectedNode ? null : node.id)
      if (onNodeClick) {
        onNodeClick(node)
      }
    },
    [selectedNode, onNodeClick],
  )

  if (topology.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-dark-900 rounded-lg border dark:border-dark-700"
        style={{ height }}
      >
        <p className="text-gray-500 dark:text-gray-400">No MCP topology data available</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="bg-gray-50 dark:bg-dark-900 rounded-lg border dark:border-dark-700"
      >
        {/* Edges */}
        <g className="edges">
          {topology.edges.map((edge) => {
            const source = nodeMap.get(edge.source)
            const target = nodeMap.get(edge.target)
            if (!source || !target) return null

            const isHighlighted =
              hoveredNode === edge.source ||
              hoveredNode === edge.target ||
              selectedNode === edge.source ||
              selectedNode === edge.target

            // Calculate curve control point
            const midX = (source.x + target.x) / 2
            const midY = (source.y + target.y) / 2
            const dx = target.x - source.x
            const dy = target.y - source.y
            const perpX = -dy * 0.1
            const perpY = dx * 0.1
            const ctrlX = midX + perpX
            const ctrlY = midY + perpY

            return (
              <g key={`${edge.source}-${edge.target}`}>
                {/* Edge path */}
                <path
                  d={`M ${source.x} ${source.y} Q ${ctrlX} ${ctrlY} ${target.x} ${target.y}`}
                  fill="none"
                  stroke={isHighlighted ? '#6366f1' : '#d1d5db'}
                  strokeWidth={isHighlighted ? 2 : 1}
                  className="transition-all duration-200"
                />
                {/* Edge label */}
                {edge.label && isHighlighted && (
                  <text
                    x={ctrlX}
                    y={ctrlY}
                    textAnchor="middle"
                    className="text-xs fill-gray-600 pointer-events-none"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {positionedNodes.map((node) => {
            const size = getNodeSize(node.type)
            const isHovered = hoveredNode === node.id
            const isSelected = selectedNode === node.id

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node)}
              >
                {/* Node circle */}
                <circle
                  r={size + (isHovered || isSelected ? 4 : 0)}
                  fill={getNodeColor(node.status, 'fill')}
                  stroke={getNodeColor(node.status, 'stroke')}
                  strokeWidth={isSelected ? 3 : 2}
                  className="transition-all duration-200"
                />

                {/* Node icon/text */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  className="text-white font-bold pointer-events-none"
                  style={{ fontSize: size * 0.5 }}
                >
                  {node.type === 'agent'
                    ? 'A'
                    : node.type === 'server'
                      ? 'S'
                      : 'T'}
                </text>

                {/* Label */}
                <text
                  y={size + 14}
                  textAnchor="middle"
                  className={clsx(
                    'text-xs pointer-events-none',
                    isHovered || isSelected
                      ? 'fill-gray-900 font-medium'
                      : 'fill-gray-600',
                  )}
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm rounded-lg px-3 py-2 border dark:border-dark-700 shadow-sm">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-gray-600 dark:text-gray-300">Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-gray-600 dark:text-gray-300">Degraded</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="text-gray-600 dark:text-gray-300">Unhealthy</span>
          </div>
        </div>
      </div>

      {/* Tooltip for selected node */}
      {selectedNode && (
        <div className="absolute top-3 right-3 bg-white dark:bg-dark-800 rounded-lg shadow-lg border dark:border-dark-700 p-3 max-w-xs">
          {(() => {
            const node = nodeMap.get(selectedNode)
            if (!node) return null
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">{node.label}</h4>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded',
                      node.status === 'healthy'
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : node.status === 'degraded'
                          ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400',
                    )}
                  >
                    {node.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Calls</p>
                    <p className="font-medium">{node.metrics.callCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Error Rate</p>
                    <p className="font-medium">
                      {(node.metrics.errorRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Latency</p>
                    <p className="font-medium">{node.metrics.avgLatencyMs}ms</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function MCPServerTopologySkeleton({
  height = 400,
}: {
  height?: number
}) {
  return (
    <div
      className="bg-gray-50 dark:bg-dark-900 rounded-lg border dark:border-dark-700 animate-pulse flex items-center justify-center"
      style={{ height }}
    >
      <div className="text-gray-400 dark:text-gray-500">Loading topology...</div>
    </div>
  )
}
