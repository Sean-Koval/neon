'use client'

import { Plus, X } from 'lucide-react'
import { useState } from 'react'

interface CreateAlertRuleDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (rule: AlertRuleFormData) => void
  isPending?: boolean
}

export interface AlertRuleFormData {
  name: string
  description: string
  metric: string
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  threshold: number
  severity: 'critical' | 'warning' | 'info'
  enabled: boolean
  windowSeconds: number
  consecutiveBreaches: number
}

const METRIC_OPTIONS = [
  { value: 'eval.avg_score', label: 'Average Eval Score' },
  { value: 'eval.pass_rate', label: 'Pass Rate' },
  { value: 'eval.consecutive_failures', label: 'Consecutive Failures' },
  { value: 'api.error_rate', label: 'API Error Rate' },
  { value: 'api.latency_p95_ms', label: 'API P95 Latency (ms)' },
  { value: 'system.memory_usage_percent', label: 'Memory Usage (%)' },
]

const OPERATOR_OPTIONS = [
  { value: 'gt', label: '> (greater than)' },
  { value: 'gte', label: '>= (greater or equal)' },
  { value: 'lt', label: '< (less than)' },
  { value: 'lte', label: '<= (less or equal)' },
  { value: 'eq', label: '= (equal)' },
]

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

export function CreateAlertRuleDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: CreateAlertRuleDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [metric, setMetric] = useState('eval.avg_score')
  const [operator, setOperator] = useState<AlertRuleFormData['operator']>('lt')
  const [threshold, setThreshold] = useState(0.7)
  const [severity, setSeverity] = useState<AlertRuleFormData['severity']>('warning')
  const [windowSeconds, setWindowSeconds] = useState(300)
  const [consecutiveBreaches, setConsecutiveBreaches] = useState(1)

  if (!open) return null

  const isValid = name.trim().length > 0 && metric.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      metric,
      operator,
      threshold,
      severity,
      enabled: true,
      windowSeconds,
      consecutiveBreaches,
    })
  }

  function resetForm() {
    setName('')
    setDescription('')
    setMetric('eval.avg_score')
    setOperator('lt')
    setThreshold(0.7)
    setSeverity('warning')
    setWindowSeconds(300)
    setConsecutiveBreaches(1)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Create Alert Rule
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="rule-name" className="block text-xs font-medium text-gray-600 mb-1">
              Rule Name *
            </label>
            <input
              id="rule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Low eval score alert"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="rule-desc" className="block text-xs font-medium text-gray-600 mb-1">
              Description
            </label>
            <input
              id="rule-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this rule monitor?"
              className={inputClass}
            />
          </div>

          {/* Metric + Operator + Threshold row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="rule-metric" className="block text-xs font-medium text-gray-600 mb-1">
                Metric *
              </label>
              <select
                id="rule-metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className={inputClass}
              >
                {METRIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rule-operator" className="block text-xs font-medium text-gray-600 mb-1">
                Operator
              </label>
              <select
                id="rule-operator"
                value={operator}
                onChange={(e) =>
                  setOperator(e.target.value as AlertRuleFormData['operator'])
                }
                className={inputClass}
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rule-threshold" className="block text-xs font-medium text-gray-600 mb-1">
                Threshold
              </label>
              <input
                id="rule-threshold"
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Severity */}
          <div>
            <label htmlFor="rule-severity" className="block text-xs font-medium text-gray-600 mb-1">
              Severity
            </label>
            <select
              id="rule-severity"
              value={severity}
              onChange={(e) =>
                setSeverity(e.target.value as AlertRuleFormData['severity'])
              }
              className={inputClass}
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Window + Consecutive Breaches */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rule-window" className="block text-xs font-medium text-gray-600 mb-1">
                Eval Window (seconds)
              </label>
              <input
                id="rule-window"
                type="number"
                min="1"
                value={windowSeconds}
                onChange={(e) => setWindowSeconds(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="rule-breaches" className="block text-xs font-medium text-gray-600 mb-1">
                Consecutive Breaches
              </label>
              <input
                id="rule-breaches"
                type="number"
                min="1"
                value={consecutiveBreaches}
                onChange={(e) => setConsecutiveBreaches(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isPending}
              className="btn btn-primary text-sm inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {isPending ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
