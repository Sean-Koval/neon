'use client'

import { Bell, RefreshCw } from 'lucide-react'
import { AlertConfig } from '@/components/alerts/alert-config'
import { AlertHistory } from '@/components/alerts/alert-history'
import { useAlerts } from '@/hooks/use-alerts'

export default function AlertsPage() {
  const { data, isLoading, refetch } = useAlerts()

  const alerts = data?.alerts ?? []
  const thresholds = data?.thresholds ?? []

  // Build a unique suite list from thresholds
  const suites = thresholds.map((t) => ({
    id: t.suiteId,
    name: alerts.find((a) => a.suiteId === t.suiteId)?.suiteName ?? t.suiteId,
  }))
  // Deduplicate suites by id
  const uniqueSuites = Array.from(
    new Map(suites.map((s) => [s.id, s])).values(),
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500">
            Regression detection and threshold configuration
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn btn-secondary inline-flex items-center gap-2"
          title="Refresh alerts"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <AlertsSkeleton />
      ) : (
        <>
          {/* Active Alerts */}
          <AlertHistory alerts={alerts} />

          {/* Threshold Configuration */}
          {uniqueSuites.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Alert Thresholds
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Configure regression detection thresholds per evaluation suite
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uniqueSuites.map((suite) => (
                  <AlertConfig
                    key={suite.id}
                    suiteId={suite.id}
                    suiteName={suite.name}
                    current={thresholds.find((t) => t.suiteId === suite.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AlertsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card p-6 animate-pulse">
        <div className="h-5 w-40 bg-gray-200 rounded mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-gray-200 rounded mb-1" />
                <div className="h-3 w-72 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
