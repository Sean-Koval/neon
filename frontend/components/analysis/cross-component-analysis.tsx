'use client'

/**
 * Cross-Component Performance Analysis
 *
 * Displays performance comparisons across different components.
 */

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import type {
  ComponentMetrics,
  CorrelationPair,
} from '@/hooks/use-component-correlation'

// =============================================================================
// Types
// =============================================================================

export interface CrossComponentAnalysisProps {
  /** Component metrics */
  components: ComponentMetrics[]
  /** Correlation pairs */
  correlations: CorrelationPair[]
  /** Called when a component is selected */
  onComponentSelect?: (component: ComponentMetrics) => void
  /** Custom className */
  className?: string
}

type SortField = 'name' | 'avgScore' | 'passRate' | 'evalCount' | 'variance'
type SortDirection = 'asc' | 'desc'
type FilterType = 'all' | 'suite' | 'scorer'

// =============================================================================
// Custom Tooltip
// =============================================================================

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload as ComponentMetrics

  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="font-medium text-gray-900 border-b pb-2 mb-2">
        {data.name}
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Type:</span>
          <span className="font-medium capitalize">{data.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Score:</span>
          <span className="font-medium">
            {(data.avgScore * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Pass Rate:</span>
          <span className="font-medium">
            {(data.passRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Evaluations:</span>
          <span className="font-medium">{data.evalCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Variance:</span>
          <span className="font-medium">
            {(data.variance * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Trend:</span>
          <span className="flex items-center gap-1 font-medium capitalize">
            {data.trend === 'up' && (
              <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            )}
            {data.trend === 'down' && (
              <ArrowDownRight className="w-3 h-3 text-rose-500" />
            )}
            {data.trend === 'stable' && (
              <ArrowRight className="w-3 h-3 text-gray-400" />
            )}
            {data.trend}
          </span>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Bar Color Function
// =============================================================================

function getBarColor(score: number): string {
  if (score >= 0.8) return '#34d399' // emerald-400
  if (score >= 0.6) return '#fbbf24' // amber-400
  return '#f87171' // rose-400
}

// =============================================================================
// Main Component
// =============================================================================

export function CrossComponentAnalysis({
  components,
  correlations,
  onComponentSelect,
  className = '',
}: CrossComponentAnalysisProps) {
  const [sortField, setSortField] = useState<SortField>('avgScore')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  )

  // Filter and sort components
  const filteredComponents = useMemo(() => {
    let result = [...components]

    // Apply type filter
    if (filterType !== 'all') {
      result = result.filter((c) => c.type === filterType)
    }

    // Apply sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'avgScore':
          comparison = a.avgScore - b.avgScore
          break
        case 'passRate':
          comparison = a.passRate - b.passRate
          break
        case 'evalCount':
          comparison = a.evalCount - b.evalCount
          break
        case 'variance':
          comparison = a.variance - b.variance
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [components, filterType, sortField, sortDirection])

  // Get correlations for selected component
  const selectedCorrelations = useMemo(() => {
    if (!selectedComponent) return []
    return correlations
      .filter(
        (c) =>
          c.componentA === selectedComponent ||
          c.componentB === selectedComponent,
      )
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
  }, [correlations, selectedComponent])

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Handle component selection
  const handleComponentClick = (componentId: string) => {
    const newSelected = componentId === selectedComponent ? null : componentId
    setSelectedComponent(newSelected)
    if (newSelected) {
      const component = components.find((c) => c.id === newSelected)
      if (component) onComponentSelect?.(component)
    }
  }

  if (components.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg p-8 ${className}`}
      >
        <p className="text-gray-500">
          No component data available for analysis
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Components</option>
            <option value="suite">Test Suites</option>
            <option value="scorer">Scorers</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          {(
            ['avgScore', 'passRate', 'evalCount', 'variance'] as SortField[]
          ).map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => handleSort(field)}
              className={`
                  text-xs px-2 py-1 rounded-lg transition-colors flex items-center gap-1
                  ${
                    sortField === field
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
            >
              {field === 'avgScore' && 'Score'}
              {field === 'passRate' && 'Pass Rate'}
              {field === 'evalCount' && 'Count'}
              {field === 'variance' && 'Variance'}
              {sortField === field &&
                (sortDirection === 'asc' ? (
                  <SortAsc className="w-3 h-3" />
                ) : (
                  <SortDesc className="w-3 h-3" />
                ))}
            </button>
          ))}
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h3 className="font-medium text-gray-900 mb-4">
          Component Performance Comparison
        </h3>
        <div style={{ height: Math.max(300, filteredComponents.length * 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredComponents}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 100, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12 }}
                width={90}
                tickFormatter={(v) =>
                  v.length > 12 ? `${v.slice(0, 12)}...` : v
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="avgScore"
                radius={[0, 4, 4, 0]}
                onClick={(data) => handleComponentClick(data.id)}
                style={{ cursor: 'pointer' }}
              >
                {filteredComponents.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={getBarColor(entry.avgScore)}
                    stroke={selectedComponent === entry.id ? '#1e40af' : 'none'}
                    strokeWidth={selectedComponent === entry.id ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Component
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('avgScore')}
              >
                Score
                <HelpTooltip content="Average score (0-1). 0.8+ excellent (green), 0.6-0.8 good (amber), below 0.6 needs work (red)." />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('passRate')}
              >
                Pass Rate
                <HelpTooltip content="Percentage of test cases that passed their scoring threshold." />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('evalCount')}
              >
                Evals
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trend
                <HelpTooltip content="Direction of score change over recent evaluations: up, down, or stable." />
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Health
                <HelpTooltip content="Overall status based on score, pass rate, and trend. Healthy (green), warning (amber), or critical (red)." />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredComponents.map((component) => (
              <tr
                key={component.id}
                className={`
                  hover:bg-gray-50 cursor-pointer transition-colors
                  ${selectedComponent === component.id ? 'bg-primary-50' : ''}
                `}
                onClick={() => handleComponentClick(component.id)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-gray-900">
                    {component.name}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-full capitalize">
                    {component.type}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span
                    className={`font-semibold ${
                      component.avgScore >= 0.8
                        ? 'text-emerald-600'
                        : component.avgScore >= 0.6
                          ? 'text-amber-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {(component.avgScore * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-gray-700">
                    {(component.passRate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-gray-600">{component.evalCount}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  {component.trend === 'up' && (
                    <ArrowUpRight className="w-5 h-5 text-emerald-500 inline-block" />
                  )}
                  {component.trend === 'down' && (
                    <ArrowDownRight className="w-5 h-5 text-rose-500 inline-block" />
                  )}
                  {component.trend === 'stable' && (
                    <ArrowRight className="w-5 h-5 text-gray-400 inline-block" />
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  <span
                    className={`
                      inline-flex px-2 py-1 text-xs font-medium rounded-full
                      ${
                        component.healthStatus === 'healthy'
                          ? 'bg-emerald-100 text-emerald-800'
                          : component.healthStatus === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }
                    `}
                  >
                    {component.healthStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Component Correlations */}
      {selectedComponent && selectedCorrelations.length > 0 && (
        <div className="mt-4 bg-white border rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">
            Correlations with{' '}
            {components.find((c) => c.id === selectedComponent)?.name}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {selectedCorrelations.slice(0, 6).map((corr) => {
              const otherComponent =
                corr.componentA === selectedComponent
                  ? corr.componentB
                  : corr.componentA
              const otherName = components.find(
                (c) => c.id === otherComponent,
              )?.name

              return (
                <div
                  key={`${corr.componentA}-${corr.componentB}`}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {otherName}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {corr.strength}{' '}
                      {corr.correlation > 0 ? 'positive' : 'negative'}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        corr.correlation > 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {corr.correlation.toFixed(3)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Loading Skeleton
// =============================================================================

export function CrossComponentAnalysisSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex justify-between">
        <div className="h-8 bg-gray-200 rounded w-32" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded w-16" />
          ))}
        </div>
      </div>
      <div className="bg-gray-100 rounded-lg h-64" />
      <div className="bg-gray-100 rounded-lg h-48" />
    </div>
  )
}

export default CrossComponentAnalysis
