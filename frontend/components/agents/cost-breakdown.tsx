'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { trpc } from '@/lib/trpc'

interface CostBreakdownProps {
  agentId: string
}

const attributionColors = {
  model: 'bg-primary-500',
  tool: 'bg-accent-500',
  retry: 'bg-amber-500',
}

export function CostBreakdown({ agentId }: CostBreakdownProps) {
  const { data } = trpc.agents.getCostBreakdown.useQuery({ agentId })

  const totalDailyCost = data?.totalDailyCost ?? 0
  const attribution = data?.attribution ?? { model: 0, tool: 0, retry: 0 }
  const dailyCosts = data?.dailyCosts ?? []

  const totalAttribution =
    attribution.model + attribution.tool + attribution.retry
  const pct = (val: number) =>
    totalAttribution > 0 ? (val / totalAttribution) * 100 : 0

  const bars = [
    {
      label: 'Model Inference',
      key: 'model' as const,
      cost: attribution.model,
    },
    { label: 'Tool Execution', key: 'tool' as const, cost: attribution.tool },
    { label: 'Retries', key: 'retry' as const, cost: attribution.retry },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left - Cost Attribution */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-1">
          Cost Attribution (7d)
        </h3>
        <p className="text-3xl font-bold text-content-primary mb-6">
          ${totalDailyCost.toFixed(2)}
          <span className="text-sm font-normal text-content-muted">/day</span>
        </p>
        <div className="space-y-4">
          {bars.map((bar) => (
            <div key={bar.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-content-secondary">
                  {bar.label}
                </span>
                <span className="text-xs text-content-muted">
                  {pct(bar.cost).toFixed(0)}% &middot; ${bar.cost.toFixed(2)}
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${attributionColors[bar.key]} rounded-full transition-all`}
                  style={{ width: `${pct(bar.cost)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right - Cost Trend Chart */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">
          Cost Trend (7d)
        </h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyCosts}>
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
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-content-muted, #9ca3af)',
                }}
                width={55}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                labelFormatter={(label: string) =>
                  new Date(label).toLocaleDateString()
                }
              />
              <Area
                type="monotone"
                dataKey="totalCost"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
