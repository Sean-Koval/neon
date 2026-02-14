'use client'

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface VersionData {
  version: string
  firstSeen: string
  lastSeen: string
  traceCount: number
  avgScore: number | null
  avgDuration: number
}

interface VersionComparisonChartProps {
  versions: VersionData[]
  slaTarget?: number
}

function getBarColor(score: number): string {
  if (score >= 0.9) return '#10b981' // emerald-500
  if (score >= 0.7) return '#f59e0b' // amber-500
  return '#f43f5e' // rose-500
}

export function VersionComparisonChart({
  versions,
  slaTarget = 0.85,
}: VersionComparisonChartProps) {
  const chartData = versions
    .filter((v) => v.avgScore !== null)
    .slice(0, 5)
    .map((v) => ({
      version: v.version,
      score: Number(((v.avgScore ?? 0) * 100).toFixed(1)),
      rawScore: v.avgScore ?? 0,
    }))
    .reverse()

  if (chartData.length === 0) {
    return null
  }

  return (
    <div className="bg-surface-card border border-border rounded-xl p-6">
      <h3 className="text-content-primary font-semibold mb-4">
        Version Score Comparison
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 20, right: 20 }}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="version"
              tick={{ fill: '#9ca3af', fontSize: 12, fontFamily: 'monospace' }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f9fafb',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`${value}%`, 'Score']}
            />
            <ReferenceLine
              x={slaTarget * 100}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{
                value: `SLA ${(slaTarget * 100).toFixed(0)}%`,
                fill: '#9ca3af',
                fontSize: 11,
                position: 'top',
              }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={24}>
              {chartData.map((entry) => (
                <Cell key={entry.version} fill={getBarColor(entry.rawScore)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
