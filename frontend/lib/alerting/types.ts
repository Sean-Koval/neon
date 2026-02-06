/**
 * Alerting System Types
 *
 * Defines the type system for configurable alert rules, evaluation,
 * and notification delivery.
 */

// =============================================================================
// Alert Severity
// =============================================================================

export type AlertSeverity = 'critical' | 'warning' | 'info'

// =============================================================================
// Alert State
// =============================================================================

export type AlertStateStatus = 'inactive' | 'pending' | 'firing' | 'resolved'

export interface AlertState {
  /** Rule this state belongs to */
  ruleId: string
  /** Current status */
  status: AlertStateStatus
  /** When the alert started firing (or null if not firing) */
  firedAt: string | null
  /** When the alert was last resolved */
  resolvedAt: string | null
  /** Last time this rule was evaluated */
  lastEvaluatedAt: string
  /** Current metric value that triggered the alert */
  currentValue: number | null
  /** Number of consecutive evaluations in firing state */
  firingCount: number
}

// =============================================================================
// Alert Rule
// =============================================================================

export type AlertRuleOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'

export interface AlertRule {
  /** Unique identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what this rule monitors */
  description: string
  /** Severity level */
  severity: AlertSeverity
  /** Whether the rule is enabled */
  enabled: boolean
  /** Metric to monitor */
  metric: string
  /** Comparison operator */
  operator: AlertRuleOperator
  /** Threshold value */
  threshold: number
  /** Evaluation window in seconds */
  windowSeconds: number
  /** Number of consecutive threshold breaches before firing */
  consecutiveBreaches: number
  /** Optional labels for categorization */
  labels: Record<string, string>
  /** When the rule was created */
  createdAt: string
  /** When the rule was last updated */
  updatedAt: string
}

export type AlertRuleCreate = Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>

export type AlertRuleUpdate = Partial<Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>>

// =============================================================================
// Metric Data
// =============================================================================

export interface MetricDataPoint {
  /** Metric name (must match AlertRule.metric) */
  metric: string
  /** Metric value */
  value: number
  /** Timestamp of the measurement */
  timestamp: string
}

// =============================================================================
// Alert Notification
// =============================================================================

export interface AlertNotification {
  /** Rule that triggered the notification */
  rule: AlertRule
  /** Current state of the alert */
  state: AlertState
  /** Whether this is a firing or resolved notification */
  type: 'firing' | 'resolved'
  /** Timestamp of the notification */
  timestamp: string
}

// =============================================================================
// Webhook Payload
// =============================================================================

export interface WebhookPayload {
  /** Version of the webhook payload format */
  version: '1'
  /** Notification details */
  alert: {
    ruleId: string
    ruleName: string
    severity: AlertSeverity
    status: 'firing' | 'resolved'
    metric: string
    currentValue: number | null
    threshold: number
    operator: AlertRuleOperator
    message: string
    firedAt: string | null
    resolvedAt: string | null
  }
  /** ISO timestamp */
  timestamp: string
}
