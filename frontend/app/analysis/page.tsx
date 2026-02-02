'use client'

/**
 * Analysis Page
 *
 * Multi-component correlation view showing:
 * - Cross-component performance analysis
 * - Correlation heatmaps
 * - Component health dashboard
 * - Dependency graph visualization
 */

import {
  Activity,
  Calendar,
  Download,
  GitBranch,
  Grid3X3,
  HeartPulse,
  LayoutGrid,
  RefreshCcw,
} from 'lucide-react'
import { useState } from 'react'
import {
  ComponentHealthDashboard,
  ComponentHealthSkeleton,
  CorrelationHeatmap,
  CorrelationHeatmapSkeleton,
  CrossComponentAnalysis,
  CrossComponentAnalysisSkeleton,
  DependencyGraphSkeleton,
  DependencyGraphVisualization,
} from '@/components/analysis'
import {
  type ComponentMetrics,
  useComponentCorrelation,
} from '@/hooks/use-component-correlation'

// =============================================================================
// Types
// =============================================================================

type ViewTab = 'health' | 'correlation' | 'graph' | 'comparison'

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

// =============================================================================
// Main Page Component
// =============================================================================

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('health')
  const [dateRange, setDateRange] = useState(30)
  const [selectedComponent, setSelectedComponent] =
    useState<ComponentMetrics | null>(null)

  // Fetch correlation data
  const {
    components,
    correlationMatrix,
    correlations,
    dependencyGraph,
    health,
    isLoading,
    isError,
    error,
    refetch,
  } = useComponentCorrelation({
    days: dateRange,
    minSampleSize: 3,
    significanceThreshold: 0.1,
  })

  // Handle component selection
  const handleComponentSelect = (component: ComponentMetrics) => {
    setSelectedComponent(
      component.id === selectedComponent?.id ? null : component,
    )
  }

  // Export correlation data
  const handleExport = () => {
    if (!correlationMatrix) return

    const data = {
      exportedAt: new Date().toISOString(),
      dateRange: `${dateRange} days`,
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        avgScore: c.avgScore,
        passRate: c.passRate,
        healthStatus: c.healthStatus,
      })),
      correlations: correlations.slice(0, 20).map((c) => ({
        componentA: c.componentA,
        componentB: c.componentB,
        correlation: c.correlation,
        strength: c.strength,
      })),
      health: health
        ? {
            overallScore: health.overallScore,
            healthyCount: health.healthyCount,
            warningCount: health.warningCount,
            criticalCount: health.criticalCount,
          }
        : null,
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analysis-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Tab configuration
  const tabs = [
    { id: 'health' as ViewTab, label: 'Health Dashboard', icon: HeartPulse },
    {
      id: 'correlation' as ViewTab,
      label: 'Correlation Matrix',
      icon: Grid3X3,
    },
    { id: 'graph' as ViewTab, label: 'Dependency Graph', icon: GitBranch },
    {
      id: 'comparison' as ViewTab,
      label: 'Performance Analysis',
      icon: LayoutGrid,
    },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Component Analysis
          </h1>
          <p className="text-gray-500">
            Cross-component correlations and system health
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              {DATE_RANGES.map((range) => (
                <option key={range.days} value={range.days}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCcw
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isLoading || !correlationMatrix}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-rose-800 font-medium">
            Error loading analysis data
          </p>
          <p className="text-rose-600 text-sm mt-1">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-sm text-rose-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Summary Stats */}
      {health && !isLoading && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium">Components</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {components.length}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <HeartPulse className="w-4 h-4" />
              <span className="text-xs font-medium">Overall Health</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                health.overallScore >= 80
                  ? 'text-emerald-600'
                  : health.overallScore >= 60
                    ? 'text-amber-600'
                    : 'text-rose-600'
              }`}
            >
              {health.overallScore}%
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4 border-emerald-200">
            <div className="text-xs font-medium text-emerald-600 mb-1">
              Healthy
            </div>
            <div className="text-2xl font-bold text-emerald-700">
              {health.healthyCount}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4 border-amber-200">
            <div className="text-xs font-medium text-amber-600 mb-1">
              Warning
            </div>
            <div className="text-2xl font-bold text-amber-700">
              {health.warningCount}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4 border-rose-200">
            <div className="text-xs font-medium text-rose-600 mb-1">
              Critical
            </div>
            <div className="text-2xl font-bold text-rose-700">
              {health.criticalCount}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {/* Health Dashboard Tab */}
        {activeTab === 'health' &&
          (isLoading ? (
            <ComponentHealthSkeleton />
          ) : health ? (
            <ComponentHealthDashboard
              components={components}
              health={health}
              onComponentClick={handleComponentSelect}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No health data available
            </div>
          ))}

        {/* Correlation Matrix Tab */}
        {activeTab === 'correlation' && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Component Correlation Matrix
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Shows how component scores correlate with each other. Strong
              positive correlations (blue) indicate components that tend to
              succeed or fail together. Negative correlations (red) suggest
              inverse relationships.
            </p>
            {isLoading ? (
              <CorrelationHeatmapSkeleton height={500} />
            ) : correlationMatrix ? (
              <CorrelationHeatmap
                matrix={correlationMatrix}
                correlations={correlations}
                height={500}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Insufficient data for correlation analysis
              </div>
            )}
          </div>
        )}

        {/* Dependency Graph Tab */}
        {activeTab === 'graph' && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Component Dependency Graph
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Visualizes relationships between components based on correlation
              strength. Connected components have statistically significant
              correlations. Node size indicates component type, color indicates
              health status.
            </p>
            {isLoading ? (
              <DependencyGraphSkeleton height={500} />
            ) : dependencyGraph ? (
              <DependencyGraphVisualization
                graph={dependencyGraph}
                height={500}
                onNodeClick={handleComponentSelect}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No significant dependencies found
              </div>
            )}
          </div>
        )}

        {/* Performance Analysis Tab */}
        {activeTab === 'comparison' &&
          (isLoading ? (
            <CrossComponentAnalysisSkeleton />
          ) : (
            <CrossComponentAnalysis
              components={components}
              correlations={correlations}
              onComponentSelect={handleComponentSelect}
            />
          ))}
      </div>

      {/* Selected Component Sidebar */}
      {selectedComponent && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l shadow-lg p-6 overflow-y-auto z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Component Details
            </h3>
            <button
              type="button"
              onClick={() => setSelectedComponent(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="font-medium">{selectedComponent.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Type</p>
              <p className="font-medium capitalize">{selectedComponent.type}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Score</p>
                <p
                  className={`text-xl font-bold ${
                    selectedComponent.avgScore >= 0.8
                      ? 'text-emerald-600'
                      : selectedComponent.avgScore >= 0.6
                        ? 'text-amber-600'
                        : 'text-rose-600'
                  }`}
                >
                  {(selectedComponent.avgScore * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pass Rate</p>
                <p className="text-xl font-bold text-gray-900">
                  {(selectedComponent.passRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Evaluations</p>
                <p className="font-medium">{selectedComponent.evalCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Latency</p>
                <p className="font-medium">
                  {selectedComponent.avgLatency >= 1000
                    ? `${(selectedComponent.avgLatency / 1000).toFixed(1)}s`
                    : `${Math.round(selectedComponent.avgLatency)}ms`}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Health Status</p>
              <span
                className={`
                  inline-flex px-2 py-1 text-sm font-medium rounded-full mt-1
                  ${
                    selectedComponent.healthStatus === 'healthy'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedComponent.healthStatus === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                  }
                `}
              >
                {selectedComponent.healthStatus}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Trend</p>
              <p className="font-medium capitalize">
                {selectedComponent.trend}
              </p>
            </div>

            {/* Related Correlations */}
            {correlations.filter(
              (c) =>
                c.componentA === selectedComponent.id ||
                c.componentB === selectedComponent.id,
            ).length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Top Correlations
                </p>
                <div className="space-y-2">
                  {correlations
                    .filter(
                      (c) =>
                        c.componentA === selectedComponent.id ||
                        c.componentB === selectedComponent.id,
                    )
                    .slice(0, 5)
                    .map((corr) => {
                      const otherId =
                        corr.componentA === selectedComponent.id
                          ? corr.componentB
                          : corr.componentA
                      const otherName = components.find(
                        (c) => c.id === otherId,
                      )?.name

                      return (
                        <div
                          key={`${corr.componentA}-${corr.componentB}`}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-600 truncate max-w-[60%]">
                            {otherName}
                          </span>
                          <span
                            className={`font-medium ${
                              corr.correlation > 0
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {corr.correlation.toFixed(3)}
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
