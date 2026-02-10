'use client'

import { AlertTriangle, Bell, Shield, Trash2, XCircle } from 'lucide-react'
import type { AlertRule, AlertState } from '@/lib/alerting/types'

interface AlertRuleWithState extends AlertRule {
  state: AlertState | null
}

interface AlertRulesListProps {
  rules: AlertRuleWithState[]
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  isUpdating?: boolean
}

const SEVERITY_STYLES = {
  critical: {
    badge: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
    icon: XCircle,
    dot: 'bg-red-500',
  },
  warning: {
    badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
    icon: AlertTriangle,
    dot: 'bg-amber-500',
  },
  info: {
    badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    icon: Bell,
    dot: 'bg-blue-500',
  },
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  inactive: { label: 'Inactive', color: 'text-gray-400 dark:text-gray-500' },
  pending: { label: 'Pending', color: 'text-amber-500' },
  firing: { label: 'Firing', color: 'text-red-500' },
  resolved: { label: 'Resolved', color: 'text-green-500' },
}

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
}

export function AlertRulesList({
  rules,
  onToggle,
  onDelete,
  isUpdating,
}: AlertRulesListProps) {
  if (rules.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          No alert rules configured
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create alert rules to monitor eval scores, latency, and error rates.
        </p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alert Rules</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-700">
        {rules.map((rule) => (
          <AlertRuleRow
            key={rule.id}
            rule={rule}
            onToggle={onToggle}
            onDelete={onDelete}
            isUpdating={isUpdating}
          />
        ))}
      </div>
    </div>
  )
}

function AlertRuleRow({
  rule,
  onToggle,
  onDelete,
  isUpdating,
}: {
  rule: AlertRuleWithState
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  isUpdating?: boolean
}) {
  const severityStyle = SEVERITY_STYLES[rule.severity]
  const statusInfo = rule.state
    ? STATUS_STYLES[rule.state.status] || STATUS_STYLES.inactive
    : STATUS_STYLES.inactive

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
      <div className="flex items-start gap-3">
        {/* Toggle */}
        <label className="relative inline-flex items-center cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={() => onToggle(rule.id, !rule.enabled)}
            disabled={isUpdating}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 dark:bg-dark-700 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-dark-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
        </label>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`text-sm font-medium ${
                rule.enabled ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {rule.name}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${severityStyle.badge}`}
            >
              {rule.severity}
            </span>
            {rule.state && rule.state.status !== 'inactive' && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium ${statusInfo.color}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    rule.state.status === 'firing'
                      ? 'bg-red-500 animate-pulse'
                      : rule.state.status === 'pending'
                        ? 'bg-amber-500'
                        : 'bg-green-500'
                  }`}
                />
                {statusInfo.label}
              </span>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{rule.description}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            <span className="font-mono">
              {rule.metric} {OPERATOR_LABELS[rule.operator] || rule.operator}{' '}
              {rule.threshold}
            </span>
            {' | '}
            Window: {rule.windowSeconds}s
            {rule.consecutiveBreaches > 1 &&
              ` | ${rule.consecutiveBreaches} consecutive breaches`}
          </p>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(rule.id)}
          disabled={isUpdating}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
