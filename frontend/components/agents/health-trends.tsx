'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { trpc } from '@/lib/trpc'

interface HealthTrendsProps {
  agentId: string
}

export function HealthTrends({ agentId }: HealthTrendsProps) {
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId })
  const { data: trends } = trpc.agents.getHealthTrends.useQuery({ agentId })

  const metadata = agent?.metadata as Record<string, unknown> | undefined
  const slaTargets = metadata?.slaTargets as
    | {
        minPassRate?: number
        maxLatencyMs?: number
      }
    | undefined

  const dailyData = trends?.daily ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left - Score Trend */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">
          Score Trend (7d)
        </h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border, #374151)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) =>
                  new Date(v).toLocaleDateString(undefined, {
                    weekday: 'short',
                  })
                }
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-content-muted, #9ca3af)',
                }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-content-muted, #9ca3af)',
                }}
                width={45}
              />
              <Tooltip
                formatter={(value: number) => [
                  `${value.toFixed(1)}%`,
                  'Avg Score',
                ]}
                labelFormatter={(label: string) =>
                  new Date(label).toLocaleDateString()
                }
              />
              {slaTargets?.minPassRate != null && (
                <ReferenceLine
                  y={slaTargets.minPassRate}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{
                    value: 'SLA',
                    position: 'right',
                    fontSize: 10,
                    fill: '#f59e0b',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 3, fill: '#06b6d4' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right - Latency Trend */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">
          Latency Trend (7d)
        </h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border, #374151)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) =>
                  new Date(v).toLocaleDateString(undefined, {
                    weekday: 'short',
                  })
                }
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-content-muted, #9ca3af)',
                }}
              />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(0)}ms`}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-content-muted, #9ca3af)',
                }}
                width={55}
              />
              <Tooltip
                formatter={(value: number) => [
                  `${value.toFixed(0)}ms`,
                  'P50 Latency',
                ]}
                labelFormatter={(label: string) =>
                  new Date(label).toLocaleDateString()
                }
              />
              {slaTargets?.maxLatencyMs != null && (
                <ReferenceLine
                  y={slaTargets.maxLatencyMs}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{
                    value: 'SLA',
                    position: 'right',
                    fontSize: 10,
                    fill: '#f59e0b',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="p50Latency"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f59e0b' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
