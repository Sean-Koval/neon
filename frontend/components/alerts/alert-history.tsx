'use client'

import { AlertTriangle, Bell, ExternalLink, XCircle } from 'lucide-react'
import Link from 'next/link'
import { safeFormatDistance } from '@/lib/format-date'
import type { RegressionAlert } from '@/lib/regression'

interface AlertHistoryProps {
  alerts: RegressionAlert[]
}

export function AlertHistory({ alerts }: AlertHistoryProps) {
  if (alerts.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-50 dark:bg-emerald-500/10 flex items-center justify-center">
          <Bell className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          No regressions detected
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All evaluation suites are within their configured thresholds.
        </p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alert History</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {alerts.length} active regression{alerts.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-700">
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: RegressionAlert }) {
  const isCritical = alert.severity === 'critical'
  const Icon = isCritical ? XCircle : AlertTriangle

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
      <div className="flex items-start gap-3">
        <Icon
          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
            isCritical ? 'text-red-500' : 'text-amber-500'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {alert.suiteName}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                isCritical
                  ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                  : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
              }`}
            >
              {alert.severity}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">{alert.details}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {safeFormatDistance(alert.detectedAt)}
            </span>
            <Link
              href={`/eval-runs/${alert.runId}`}
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
            >
              View run
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className={`text-lg font-semibold ${
              isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {alert.score.toFixed(2)}
          </p>
          {alert.historicalAvg != null && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              avg: {alert.historicalAvg.toFixed(2)}
            </p>
          )}
          {alert.threshold != null && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              min: {alert.threshold.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
