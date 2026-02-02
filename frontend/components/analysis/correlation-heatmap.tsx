'use client'

/**
 * Correlation Heatmap Component
 *
 * Displays a matrix visualization of correlations between components.
 */

import { useMemo, useState } from 'react'
import type {
  CorrelationMatrix,
  CorrelationPair,
} from '@/hooks/use-component-correlation'

// =============================================================================
// Types
// =============================================================================

export interface CorrelationHeatmapProps {
  /** Correlation matrix data */
  matrix: CorrelationMatrix
  /** Pairwise correlations for details */
  correlations: CorrelationPair[]
  /** Height of the heatmap */
  height?: number
  /** Called when a cell is clicked */
  onCellClick?: (rowIdx: number, colIdx: number) => void
  /** Custom className */
  className?: string
}

// =============================================================================
// Color Scale
// =============================================================================

function getCorrelationColor(value: number): string {
  // Color scale: red (negative) -> white (neutral) -> blue (positive)
  if (value === 1) return '#3b82f6' // Diagonal - blue-500
  if (value >= 0.7) return '#60a5fa' // Strong positive - blue-400
  if (value >= 0.4) return '#93c5fd' // Moderate positive - blue-300
  if (value >= 0.2) return '#bfdbfe' // Weak positive - blue-200
  if (value >= -0.2) return '#f3f4f6' // Neutral - gray-100
  if (value >= -0.4) return '#fecaca' // Weak negative - red-200
  if (value >= -0.7) return '#fca5a5' // Moderate negative - red-300
  return '#f87171' // Strong negative - red-400
}

function getTextColor(value: number): string {
  if (Math.abs(value) >= 0.5) return '#ffffff'
  return '#374151'
}

// =============================================================================
// Component
// =============================================================================

export function CorrelationHeatmap({
  matrix,
  correlations,
  height = 400,
  onCellClick,
  className = '',
}: CorrelationHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    row: number
    col: number
  } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{
    row: number
    col: number
  } | null>(null)

  const { labels, values } = matrix
  const n = labels.length

  // Calculate cell size based on container
  const cellSize = useMemo(() => {
    const maxCells = Math.max(n, 4)
    return Math.min(Math.floor((height - 100) / maxCells), 60)
  }, [n, height])

  if (n === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ height }}
      >
        <p className="text-gray-500">
          No data available for correlation analysis
        </p>
      </div>
    )
  }

  const handleCellClick = (rowIdx: number, colIdx: number) => {
    setSelectedCell({ row: rowIdx, col: colIdx })
    onCellClick?.(rowIdx, colIdx)
  }

  const getTooltipContent = (rowIdx: number, colIdx: number) => {
    const value = values[rowIdx][colIdx]
    const componentA = labels[rowIdx]
    const componentB = labels[colIdx]

    if (rowIdx === colIdx) {
      return `${componentA}: Self correlation (1.00)`
    }

    // Find the correlation pair
    const pair = correlations.find(
      (c) =>
        (c.componentA.includes(componentA) &&
          c.componentB.includes(componentB)) ||
        (c.componentA.includes(componentB) &&
          c.componentB.includes(componentA)),
    )

    const strength =
      Math.abs(value) >= 0.7
        ? 'Strong'
        : Math.abs(value) >= 0.4
          ? 'Moderate'
          : Math.abs(value) >= 0.2
            ? 'Weak'
            : 'None'
    const direction =
      value > 0.1 ? 'positive' : value < -0.1 ? 'negative' : 'neutral'

    return `${componentA} <-> ${componentB}\nCorrelation: ${value.toFixed(3)}\nStrength: ${strength} ${direction}\nSamples: ${pair?.sampleSize ?? 'N/A'}`
  }

  return (
    <div className={`relative ${className}`}>
      {/* Legend */}
      <div className="flex items-center justify-end gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Negative</span>
          <div className="flex h-3">
            <div className="w-4" style={{ backgroundColor: '#f87171' }} />
            <div className="w-4" style={{ backgroundColor: '#fca5a5' }} />
            <div className="w-4" style={{ backgroundColor: '#fecaca' }} />
            <div className="w-4" style={{ backgroundColor: '#f3f4f6' }} />
            <div className="w-4" style={{ backgroundColor: '#bfdbfe' }} />
            <div className="w-4" style={{ backgroundColor: '#93c5fd' }} />
            <div className="w-4" style={{ backgroundColor: '#60a5fa' }} />
          </div>
          <span className="text-xs text-gray-500">Positive</span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-auto" style={{ maxHeight: height }}>
        <div
          className="inline-block"
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(${n}, ${cellSize}px)`,
            gap: '1px',
          }}
        >
          {/* Header row */}
          <div /> {/* Empty corner cell */}
          {labels.map((label, idx) => (
            <div
              key={`header-${idx}`}
              className="text-xs text-gray-600 font-medium truncate px-1 flex items-end justify-center"
              style={{
                height: 60,
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
              }}
              title={label}
            >
              {label.length > 12 ? `${label.slice(0, 12)}...` : label}
            </div>
          ))}
          {/* Data rows */}
          {values.map((row, rowIdx) => (
            <>
              {/* Row label */}
              <div
                key={`label-${rowIdx}`}
                className="text-xs text-gray-600 font-medium truncate px-2 flex items-center"
                style={{ height: cellSize }}
                title={labels[rowIdx]}
              >
                {labels[rowIdx].length > 10
                  ? `${labels[rowIdx].slice(0, 10)}...`
                  : labels[rowIdx]}
              </div>

              {/* Data cells */}
              {row.map((value, colIdx) => {
                const isHovered =
                  hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx
                const isSelected =
                  selectedCell?.row === rowIdx && selectedCell?.col === colIdx

                return (
                  <button
                    key={`cell-${rowIdx}-${colIdx}`}
                    type="button"
                    className={`
                      relative flex items-center justify-center transition-all
                      ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1' : ''}
                      ${isHovered ? 'scale-105 shadow-md z-10' : ''}
                    `}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: getCorrelationColor(value),
                      color: getTextColor(value),
                    }}
                    onMouseEnter={() =>
                      setHoveredCell({ row: rowIdx, col: colIdx })
                    }
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => handleCellClick(rowIdx, colIdx)}
                    title={getTooltipContent(rowIdx, colIdx)}
                  >
                    <span className="text-xs font-medium">
                      {rowIdx === colIdx ? '1' : value.toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* Selected cell details */}
      {selectedCell && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
          <p className="text-sm font-medium text-gray-900">
            {labels[selectedCell.row]} &harr; {labels[selectedCell.col]}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Correlation:{' '}
            <span className="font-semibold">
              {values[selectedCell.row][selectedCell.col].toFixed(4)}
            </span>
          </p>
          {selectedCell.row !== selectedCell.col && (
            <p className="text-xs text-gray-500 mt-1">
              {Math.abs(values[selectedCell.row][selectedCell.col]) >= 0.5
                ? 'Strong correlation indicates these components tend to perform similarly.'
                : Math.abs(values[selectedCell.row][selectedCell.col]) >= 0.3
                  ? 'Moderate correlation suggests some relationship between components.'
                  : 'Weak or no correlation - components perform independently.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Loading Skeleton
// =============================================================================

export function CorrelationHeatmapSkeleton({
  height = 400,
}: {
  height?: number
}) {
  return (
    <div className="animate-pulse bg-gray-100 rounded-lg" style={{ height }}>
      <div className="p-4">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 36 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default CorrelationHeatmap
