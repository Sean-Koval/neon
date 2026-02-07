/**
 * Default Alert Rules
 *
 * Pre-configured alert rules for common monitoring scenarios.
 * These can be customized or overridden via the API.
 */

import type { AlertRule } from './types'

/**
 * Default alert rules shipped with Neon.
 * Deployers can modify thresholds via the API.
 */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'api-error-rate',
    name: 'High API Error Rate',
    description: 'Fires when API error rate exceeds 5% over a 5-minute window',
    severity: 'critical',
    enabled: true,
    metric: 'api.error_rate',
    operator: 'gt',
    threshold: 0.05,
    windowSeconds: 300,
    consecutiveBreaches: 1,
    labels: { category: 'reliability', component: 'api' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'api-p95-latency',
    name: 'High API P95 Latency',
    description: 'Fires when API p95 latency exceeds 2 seconds',
    severity: 'warning',
    enabled: true,
    metric: 'api.latency_p95_ms',
    operator: 'gt',
    threshold: 2000,
    windowSeconds: 300,
    consecutiveBreaches: 2,
    labels: { category: 'performance', component: 'api' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'eval-score-low',
    name: 'Low Eval Score',
    description:
      'Fires when average eval score drops below configured threshold',
    severity: 'warning',
    enabled: true,
    metric: 'eval.avg_score',
    operator: 'lt',
    threshold: 0.7,
    windowSeconds: 600,
    consecutiveBreaches: 1,
    labels: { category: 'quality', component: 'eval' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'eval-consecutive-failures',
    name: 'Consecutive Eval Failures',
    description: 'Fires when more than 3 consecutive eval runs fail',
    severity: 'critical',
    enabled: true,
    metric: 'eval.consecutive_failures',
    operator: 'gt',
    threshold: 3,
    windowSeconds: 1800,
    consecutiveBreaches: 1,
    labels: { category: 'reliability', component: 'eval' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'memory-usage-high',
    name: 'High Memory Usage',
    description: 'Fires when memory usage exceeds 85%',
    severity: 'warning',
    enabled: true,
    metric: 'system.memory_usage_percent',
    operator: 'gt',
    threshold: 85,
    windowSeconds: 120,
    consecutiveBreaches: 3,
    labels: { category: 'infrastructure', component: 'system' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]
