'use client'

/**
 * Dependency Graph Visualization
 *
 * Displays component dependencies as a force-directed graph.
 */

import { RefreshCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComponentMetrics,
  DependencyEdge,
  DependencyGraph,
} from '@/hooks/use-component-correlation'

// =============================================================================
// Types
// =============================================================================

export interface DependencyGraphProps {
  /** Graph data */
  graph: DependencyGraph
  /** Height of the visualization */
  height?: number
  /** Called when a node is clicked */
  onNodeClick?: (node: ComponentMetrics) => void
  /** Custom className */
  className?: string
}

interface NodePosition {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  fx?: number
  fy?: number
}

// =============================================================================
// Force Simulation
// =============================================================================

function forceSimulation(
  nodes: NodePosition[],
  edges: DependencyEdge[],
  width: number,
  height: number,
  iterations = 100,
): NodePosition[] {
  const positions = nodes.map((n) => ({ ...n }))
  const centerX = width / 2
  const centerY = height / 2

  // Initialize random positions if not set
  for (const node of positions) {
    if (node.x === 0 && node.y === 0) {
      node.x = centerX + (Math.random() - 0.5) * width * 0.5
      node.y = centerY + (Math.random() - 0.5) * height * 0.5
    }
  }

  const nodeMap = new Map(positions.map((n) => [n.id, n]))

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations

    // Apply forces
    for (const node of positions) {
      // Center gravity
      node.vx += (centerX - node.x) * 0.01 * alpha
      node.vy += (centerY - node.y) * 0.01 * alpha

      // Repulsion from other nodes
      for (const other of positions) {
        if (node.id === other.id) continue
        const dx = node.x - other.x
        const dy = node.y - other.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (300 * alpha) / (dist * dist)
        node.vx += (dx / dist) * force
        node.vy += (dy / dist) * force
      }
    }

    // Apply edge constraints (spring force)
    for (const edge of edges) {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const targetDist = 150
      const force = (dist - targetDist) * edge.weight * 0.1 * alpha

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }

    // Update positions
    for (const node of positions) {
      if (node.fx !== undefined) {
        node.x = node.fx
        node.vx = 0
      } else {
        node.vx *= 0.9 // Friction
        node.x += node.vx
        node.x = Math.max(50, Math.min(width - 50, node.x))
      }

      if (node.fy !== undefined) {
        node.y = node.fy
        node.vy = 0
      } else {
        node.vy *= 0.9
        node.y += node.vy
        node.y = Math.max(50, Math.min(height - 50, node.y))
      }
    }
  }

  return positions
}

// =============================================================================
// Utility Functions
// =============================================================================

function getNodeColor(component: ComponentMetrics): string {
  if (component.healthStatus === 'critical') return '#f87171'
  if (component.healthStatus === 'warning') return '#fbbf24'
  return '#34d399'
}

function getNodeStroke(component: ComponentMetrics): string {
  return component.type === 'suite' ? '#1e3a5f' : '#4c1d95'
}

function getEdgeColor(edge: DependencyEdge): string {
  if (edge.type === 'positive') return '#34d399'
  if (edge.type === 'negative') return '#f87171'
  return '#9ca3af'
}

// =============================================================================
// Main Component
// =============================================================================

export function DependencyGraphVisualization({
  graph,
  height = 500,
  onNodeClick,
  className = '',
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [height])

  // Calculate node positions
  const positions = useMemo(() => {
    const initialPositions: NodePosition[] = graph.nodes.map((node) => ({
      id: node.id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }))

    return forceSimulation(
      initialPositions,
      graph.edges,
      dimensions.width,
      dimensions.height,
    )
  }, [graph, dimensions])

  // Position lookup
  const positionMap = useMemo(
    () => new Map(positions.map((p) => [p.id, p])),
    [positions],
  )

  // Handle zoom
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 3))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.5))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Handle pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
        setDragStart({ x: e.clientX, y: e.clientY })
      }
    },
    [isDragging, dragStart],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle node click
  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId === selectedNode ? null : nodeId)
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (node) onNodeClick?.(node)
  }

  if (graph.nodes.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ height }}
      >
        <p className="text-gray-500">No component dependencies to visualize</p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-2 bg-white rounded-lg shadow hover:bg-gray-50 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-2 bg-white rounded-lg shadow hover:bg-gray-50 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="p-2 bg-white rounded-lg shadow hover:bg-gray-50 transition-colors"
          title="Reset view"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow text-xs">
        <div className="font-medium mb-2">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-[#1e3a5f] bg-gray-200" />
            <span>Test Suite</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-[#4c1d95] bg-gray-200" />
            <span>Scorer</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-6 h-0.5 bg-emerald-400" />
            <span>Positive correlation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-rose-400" />
            <span>Negative correlation</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        width="100%"
        height={height}
        className="bg-gray-50 rounded-lg cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        role="img"
        aria-label="Component dependency graph visualization"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          style={{ transformOrigin: 'center center' }}
        >
          {/* Edges */}
          {graph.edges.map((edge) => {
            const source = positionMap.get(edge.source)
            const target = positionMap.get(edge.target)
            if (!source || !target) return null

            const isHighlighted =
              hoveredNode === edge.source ||
              hoveredNode === edge.target ||
              selectedNode === edge.source ||
              selectedNode === edge.target

            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={getEdgeColor(edge)}
                strokeWidth={isHighlighted ? 3 : Math.max(1, edge.weight * 4)}
                strokeOpacity={isHighlighted ? 1 : 0.5}
                strokeDasharray={edge.type === 'negative' ? '4 2' : undefined}
              />
            )
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const pos = positionMap.get(node.id)
            if (!pos) return null

            const isHovered = hoveredNode === node.id
            const isSelected = selectedNode === node.id
            const nodeRadius = node.type === 'suite' ? 24 : 18

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow effect for selected/hovered */}
                {(isHovered || isSelected) && (
                  <circle
                    r={nodeRadius + 8}
                    fill={getNodeColor(node)}
                    fillOpacity={0.3}
                  />
                )}

                {/* Main circle */}
                <circle
                  r={nodeRadius}
                  fill={getNodeColor(node)}
                  stroke={getNodeStroke(node)}
                  strokeWidth={isSelected ? 4 : 2}
                />

                {/* Score indicator */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  className="text-xs font-bold fill-white pointer-events-none"
                >
                  {(node.avgScore * 100).toFixed(0)}
                </text>

                {/* Label */}
                <text
                  textAnchor="middle"
                  dy={nodeRadius + 14}
                  className="text-xs fill-gray-600 pointer-events-none"
                  style={{ fontSize: '10px' }}
                >
                  {node.name.length > 15
                    ? `${node.name.slice(0, 15)}...`
                    : node.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="absolute bottom-2 left-2 right-2 z-10 bg-white rounded-lg p-4 shadow-lg border">
          {(() => {
            const node = graph.nodes.find((n) => n.id === selectedNode)
            if (!node) return null

            const connectedEdges = graph.edges.filter(
              (e) => e.source === selectedNode || e.target === selectedNode,
            )

            return (
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{node.name}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {node.type} &bull; {node.healthStatus}
                  </p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-gray-500">Score</p>
                    <p className="font-semibold">
                      {(node.avgScore * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pass Rate</p>
                    <p className="font-semibold">
                      {(node.passRate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Connections</p>
                    <p className="font-semibold">{connectedEdges.length}</p>
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
// Loading Skeleton
// =============================================================================

export function DependencyGraphSkeleton({ height = 500 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-gray-100 rounded-lg flex items-center justify-center"
      style={{ height }}
    >
      <div className="text-gray-400">Loading graph...</div>
    </div>
  )
}

export default DependencyGraphVisualization
