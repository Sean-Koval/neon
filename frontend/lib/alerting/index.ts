/**
 * Alerting Module
 *
 * Configurable alerting rules system for monitoring API health,
 * eval quality, and infrastructure metrics.
 */

export { AlertEvaluator } from './evaluator'
export type { NotifierOptions } from './notifier'
export {
  AlertNotifier,
  buildWebhookPayload,
  formatAlertMessage,
} from './notifier'
export { DEFAULT_ALERT_RULES } from './rules'
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
