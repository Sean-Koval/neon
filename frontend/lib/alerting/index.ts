/**
 * Alerting Module
 *
 * Configurable alerting rules system for monitoring API health,
 * eval quality, and infrastructure metrics.
 */

export type {
  AlertNotification,
  AlertRule,
  AlertRuleCreate,
  AlertRuleOperator,
  AlertRuleUpdate,
  AlertSeverity,
  AlertState,
  AlertStateStatus,
  MetricDataPoint,
  WebhookPayload,
} from './types'

export { AlertEvaluator } from './evaluator'
export { AlertNotifier, buildWebhookPayload, formatAlertMessage } from './notifier'
export type { NotifierOptions } from './notifier'
export { DEFAULT_ALERT_RULES } from './rules'
