'use client'

import { AlertCircle, Bell, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { AlertConfig } from '@/components/alerts/alert-config'
import { AlertHistory } from '@/components/alerts/alert-history'
import { AlertRulesList } from '@/components/alerts/alert-rules-list'
import {
  CreateAlertRuleDialog,
  type AlertRuleFormData,
} from '@/components/alerts/create-alert-rule-dialog'
import { useToast } from '@/components/toast'
import { useAlerts } from '@/hooks/use-alerts'
import {
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useUpdateAlertRule,
} from '@/hooks/use-alert-rules'

export default function AlertsPage() {
  const { data, isLoading, error, refetch } = useAlerts()
  const {
    data: rulesData,
    isLoading: rulesLoading,
    refetch: refetchRules,
  } = useAlertRules()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { addToast } = useToast()

  const alerts = data?.alerts ?? []
  const thresholds = data?.thresholds ?? []
  const rules = rulesData?.items ?? []

  // Build a unique suite list from thresholds
  const suites = thresholds.map((t) => ({
    id: t.suiteId,
    name: alerts.find((a) => a.suiteId === t.suiteId)?.suiteName ?? t.suiteId,
  }))
  const uniqueSuites = Array.from(
    new Map(suites.map((s) => [s.id, s])).values(),
  )

  const { mutate: createRule, isPending: isCreating } = useCreateAlertRule({
    onSuccess: () => {
      addToast('Alert rule created', 'success')
      setDialogOpen(false)
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const { mutate: updateRule, isPending: isUpdating } = useUpdateAlertRule({
    onError: (err) => addToast(err.message, 'error'),
  })

  const { mutate: deleteRule, isPending: isDeleting } = useDeleteAlertRule({
    onSuccess: () => addToast('Alert rule deleted', 'success'),
    onError: (err) => addToast(err.message, 'error'),
  })

  function handleCreateRule(formData: AlertRuleFormData) {
    createRule(formData)
  }

  function handleToggleRule(id: string, enabled: boolean) {
    updateRule({ id, enabled })
  }

  function handleDeleteRule(id: string) {
    deleteRule(id)
  }

  function handleRefresh() {
    refetch()
    refetchRules()
  }

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="btn btn-primary inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Alert Rule
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="btn btn-secondary inline-flex items-center gap-2"
            title="Refresh alerts"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {isLoading && rulesLoading ? (
        <AlertsSkeleton />
      ) : error ? (
        <div className="card p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-900">Failed to load alerts</p>
          <p className="text-xs text-gray-500 mt-1">{error.message}</p>
          <button type="button" onClick={handleRefresh} className="mt-3 btn btn-secondary text-sm inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : (
        <>
          {/* Active Alerts */}
          <AlertHistory alerts={alerts} />

          {/* Alert Rules */}
          <div className="space-y-4">
            <AlertRulesList
              rules={rules}
              onToggle={handleToggleRule}
              onDelete={handleDeleteRule}
              isUpdating={isUpdating || isDeleting}
            />
          </div>

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

      {/* Create Alert Rule Dialog */}
      <CreateAlertRuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateRule}
        isPending={isCreating}
      />
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
