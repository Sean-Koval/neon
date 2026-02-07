'use client'

import { AlertTriangle, Bell, ChevronRight, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { RegressionAlert } from '@/lib/regression'

interface RegressionBannerProps {
  alerts: RegressionAlert[]
}

export function RegressionBanner({ alerts }: RegressionBannerProps) {
  if (alerts.length === 0) return null

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length
  const isCritical = criticalCount > 0

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isCritical
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      }`}
      role="alert"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isCritical ? (
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          )}
          <div>
            <p
              className={`text-sm font-medium ${isCritical ? 'text-red-800' : 'text-amber-800'}`}
            >
              {alerts.length} regression{alerts.length !== 1 ? 's' : ''}{' '}
              detected
              {criticalCount > 0 && (
                <span className="ml-1">
                  ({criticalCount} critical
                  {warningCount > 0 ? `, ${warningCount} warning` : ''})
                </span>
              )}
            </p>
            <p
              className={`text-xs mt-0.5 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}
            >
              {alerts[0].suiteName}: {alerts[0].details}
              {alerts.length > 1 &&
                ` and ${alerts.length - 1} more`}
            </p>
          </div>
        </div>
        <Link
          href="/alerts"
          className={`inline-flex items-center gap-1 text-sm font-medium ${
            isCritical
              ? 'text-red-700 hover:text-red-900'
              : 'text-amber-700 hover:text-amber-900'
          }`}
        >
          <Bell className="w-4 h-4" />
          View alerts
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
