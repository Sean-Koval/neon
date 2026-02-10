'use client'

/**
 * Infrastructure Status Component
 *
 * Displays connection status for ClickHouse and Temporal services.
 */

import { CheckCircle, Database, RefreshCw, XCircle, Zap } from 'lucide-react'
import { useInfrastructureHealth } from '@/hooks/use-settings'

interface ServiceStatusProps {
  name: string
  description: string
  connected: boolean
  icon: React.ReactNode
  details?: string
}

function ServiceStatus({
  name,
  description,
  connected,
  icon,
  details,
}: ServiceStatusProps) {
  return (
    <div className="border border-border dark:border-slate-700/80 rounded-lg p-4 bg-surface-card/70 dark:bg-slate-900/72">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gray-100 dark:bg-dark-800 rounded-lg">{icon}</div>
          <div>
            <h4 className="font-medium">{name}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
            {details && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-mono">{details}</p>
            )}
          </div>
        </div>
        {connected ? (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-emerald-400 text-sm whitespace-nowrap">
            <CheckCircle className="w-4 h-4" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-sm whitespace-nowrap">
            <XCircle className="w-4 h-4" />
            Disconnected
          </span>
        )}
      </div>
    </div>
  )
}

export function InfrastructureStatus() {
  const {
    data: health,
    isLoading,
    refetch,
    isFetching,
  } = useInfrastructureHealth()

  return (
    <div className="space-y-6">
      <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="text-lg font-medium">Infrastructure Health</h3>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border dark:border-slate-700/80 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-gray-100 dark:bg-dark-800 rounded" />
            <div className="h-24 bg-gray-100 dark:bg-dark-800 rounded" />
          </div>
        ) : (
          <div className="space-y-4">
            <ServiceStatus
              name="ClickHouse"
              description="Trace and score storage"
              connected={health?.clickhouse ?? false}
              icon={<Database className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
              details={health?.clickhouseUrl}
            />
            <ServiceStatus
              name="Temporal"
              description="Durable workflow execution"
              connected={health?.temporal ?? false}
              icon={<Zap className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
              details={health?.temporalAddress}
            />
          </div>
        )}

        {/* Overall Status */}
        {health && (
          <div className="mt-6 pt-4 border-t border-border dark:border-slate-700/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Overall Status
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  health.status === 'healthy'
                    ? 'bg-green-100 dark:bg-emerald-500/20 text-green-800 dark:text-emerald-300'
                    : health.status === 'degraded'
                      ? 'bg-yellow-100 dark:bg-amber-500/20 text-yellow-800 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300'
                }`}
              >
                {health.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Last checked:{' '}
              {health.timestamp
                ? new Date(health.timestamp).toLocaleString()
                : 'Never'}
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Infrastructure connections refresh automatically every 30 seconds.
        </p>
      </div>
    </div>
  )
}
