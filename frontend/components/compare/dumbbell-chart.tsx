'use client'

import { clsx } from 'clsx'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { RegressionItem } from '@/lib/types'

interface DumbbellChartProps {
  regressions: RegressionItem[]
  improvements: RegressionItem[]
  onCaseClick?: (caseName: string) => void
}

/**
 * Dumbbell chart (connected dot plot) showing baseline vs candidate scores
 * for each test case. Green lines for improvements, red for regressions.
 */
export const DumbbellChart = memo(function DumbbellChart({
  regressions,
  improvements,
  onCaseClick,
}: DumbbellChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Combine and sort items: regressions first (worst delta first), then improvements
  const items = useMemo(() => {
    const regs = regressions.map((r) => ({ ...r, direction: 'regression' as const }))
    const imps = improvements.map((r) => ({ ...r, direction: 'improvement' as const }))
    return [...regs, ...imps]
  }, [regressions, improvements])

  // Chart dimensions
  const rowHeight = 36
  const labelWidth = 180
  const chartPadding = { left: 16, right: 32 }
  const dotRadius = 5
  const svgHeight = items.length * rowHeight + 40 // 40 for axis

  const handleClick = useCallback(
    (caseName: string) => {
      onCaseClick?.(caseName)
    },
    [onCaseClick],
  )

  if (items.length === 0) return null

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-content-primary mb-4">
        Score Comparison
      </h2>
      <div ref={containerRef} className="overflow-x-auto">
        <div className="min-w-[500px]">
          <svg
            width="100%"
            height={svgHeight}
            viewBox={`0 0 800 ${svgHeight}`}
            className="select-none"
          >
            {/* Score axis ticks */}
            {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((tick) => {
              const x = labelWidth + chartPadding.left + tick * (800 - labelWidth - chartPadding.left - chartPadding.right)
              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={svgHeight - 30}
                    stroke="var(--color-border, #334155)"
                    strokeWidth={0.5}
                    strokeDasharray="2 4"
                    opacity={0.5}
                  />
                  <text
                    x={x}
                    y={svgHeight - 12}
                    textAnchor="middle"
                    className="fill-content-muted"
                    fontSize={11}
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              )
            })}

            {/* Rows */}
            {items.map((item, i) => {
              const y = i * rowHeight + rowHeight / 2
              const chartLeft = labelWidth + chartPadding.left
              const chartWidth = 800 - labelWidth - chartPadding.left - chartPadding.right
              const baselineX = chartLeft + item.baseline_score * chartWidth
              const candidateX = chartLeft + item.candidate_score * chartWidth
              const isHovered = hoveredIndex === i
              const isRegression = item.direction === 'regression'
              const lineColor = isRegression
                ? 'var(--color-rose-500, #f43f5e)'
                : 'var(--color-emerald-500, #10b981)'

              return (
                <g
                  key={`${item.case_name}-${item.scorer}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => handleClick(item.case_name)}
                >
                  {/* Hover background */}
                  {isHovered && (
                    <rect
                      x={0}
                      y={y - rowHeight / 2}
                      width={800}
                      height={rowHeight}
                      fill="var(--color-surface-raised, #1e293b)"
                      opacity={0.5}
                      rx={4}
                    />
                  )}

                  {/* Case label */}
                  <text
                    x={8}
                    y={y + 4}
                    className="fill-content-secondary"
                    fontSize={12}
                    textDecoration={isHovered ? 'underline' : 'none'}
                  >
                    {item.case_name.length > 22
                      ? `${item.case_name.slice(0, 22)}...`
                      : item.case_name}
                  </text>

                  {/* Connecting line */}
                  <line
                    x1={Math.min(baselineX, candidateX)}
                    y1={y}
                    x2={Math.max(baselineX, candidateX)}
                    y2={y}
                    stroke={lineColor}
                    strokeWidth={isHovered ? 3 : 2}
                    opacity={isHovered ? 1 : 0.7}
                  />

                  {/* Baseline dot (violet) */}
                  <circle
                    cx={baselineX}
                    cy={y}
                    r={isHovered ? dotRadius + 1 : dotRadius}
                    fill="#a855f7"
                    stroke="var(--color-surface-card, #0f172a)"
                    strokeWidth={1.5}
                  />

                  {/* Candidate dot (emerald) */}
                  <circle
                    cx={candidateX}
                    cy={y}
                    r={isHovered ? dotRadius + 1 : dotRadius}
                    fill="#10b981"
                    stroke="var(--color-surface-card, #0f172a)"
                    strokeWidth={1.5}
                  />

                  {/* Tooltip */}
                  {isHovered && (
                    <foreignObject
                      x={Math.min(baselineX, candidateX) - 20}
                      y={y - rowHeight - 8}
                      width={280}
                      height={rowHeight + 4}
                    >
                      <div className="bg-surface-card border border-border rounded-lg shadow-lg px-3 py-1.5 text-xs text-content-primary whitespace-nowrap">
                        <span className="font-medium">{item.case_name}</span>
                        <span className="text-content-muted mx-1.5">|</span>
                        <span className="text-[#a855f7]">Base: {item.baseline_score.toFixed(2)}</span>
                        <span className="text-content-muted mx-1.5">|</span>
                        <span className="text-[#10b981]">Cand: {item.candidate_score.toFixed(2)}</span>
                        <span className="text-content-muted mx-1.5">|</span>
                        <span className={isRegression ? 'text-rose-500' : 'text-emerald-500'}>
                          {item.delta >= 0 ? '+' : ''}{(item.delta * 100).toFixed(1)}%
                        </span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-3 px-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#a855f7]" />
              <span className="text-xs text-content-muted">Baseline</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#10b981]" />
              <span className="text-xs text-content-muted">Candidate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-emerald-500 rounded" />
              <span className="text-xs text-content-muted">Improvement</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-rose-500 rounded" />
              <span className="text-xs text-content-muted">Regression</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
