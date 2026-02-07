/**
 * Alert Notifier
 *
 * Delivers alert notifications via configured channels.
 * Supports webhook (POST to URL) and console logging.
 */

import type { AlertNotification, AlertRule, WebhookPayload } from './types'

/** Format a human-readable alert message */
function formatAlertMessage(notification: AlertNotification): string {
  const { rule, state, type } = notification
  const operatorSymbol: Record<AlertRule['operator'], string> = {
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    eq: '==',
  }

  if (type === 'firing') {
    return `[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.metric} is ${state.currentValue} (threshold: ${operatorSymbol[rule.operator]} ${rule.threshold})`
  }
  return `[RESOLVED] ${rule.name}: ${rule.metric} returned to normal (${state.currentValue})`
}

/** Build a webhook payload from a notification */
function buildWebhookPayload(notification: AlertNotification): WebhookPayload {
  const { rule, state, type, timestamp } = notification
  return {
    version: '1',
    alert: {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: type,
      metric: rule.metric,
      currentValue: state.currentValue,
      threshold: rule.threshold,
      operator: rule.operator,
      message: formatAlertMessage(notification),
      firedAt: state.firedAt,
      resolvedAt: state.resolvedAt,
    },
    timestamp,
  }
}

export interface NotifierOptions {
  /** Webhook URL for alert delivery (env: ALERT_WEBHOOK_URL) */
  webhookUrl?: string
  /** Whether console logging is enabled (always true by default) */
  consoleEnabled?: boolean
  /** Custom fetch function for testing */
  fetchFn?: typeof fetch
}

export class AlertNotifier {
  private webhookUrl: string | null
  private consoleEnabled: boolean
  private fetchFn: typeof fetch

  constructor(options: NotifierOptions = {}) {
    this.webhookUrl =
      options.webhookUrl ?? process.env.ALERT_WEBHOOK_URL ?? null
    this.consoleEnabled = options.consoleEnabled ?? true
    this.fetchFn = options.fetchFn ?? fetch
  }

  /** Check if webhook notifications are configured */
  hasWebhook(): boolean {
    return this.webhookUrl !== null && this.webhookUrl.length > 0
  }

  /**
   * Send a notification via all configured channels.
   * Returns true if all delivery attempts succeeded.
   */
  async notify(notification: AlertNotification): Promise<boolean> {
    let success = true

    // Console logging (always enabled by default)
    if (this.consoleEnabled) {
      this.logToConsole(notification)
    }

    // Webhook delivery
    if (this.hasWebhook()) {
      const webhookSuccess = await this.sendWebhook(notification)
      if (!webhookSuccess) {
        success = false
      }
    }

    return success
  }

  /**
   * Send notifications for a batch of alerts.
   * Returns the count of successfully delivered notifications.
   */
  async notifyBatch(notifications: AlertNotification[]): Promise<number> {
    let delivered = 0
    for (const notification of notifications) {
      const success = await this.notify(notification)
      if (success) delivered++
    }
    return delivered
  }

  /** Log alert to console */
  private logToConsole(notification: AlertNotification): void {
    const message = formatAlertMessage(notification)
    if (notification.type === 'firing') {
      if (notification.rule.severity === 'critical') {
        console.error(`ALERT ${message}`)
      } else {
        console.warn(`ALERT ${message}`)
      }
    } else {
      console.info(`ALERT ${message}`)
    }
  }

  /** Send alert via webhook */
  private async sendWebhook(notification: AlertNotification): Promise<boolean> {
    if (!this.webhookUrl) return false

    const payload = buildWebhookPayload(notification)

    try {
      const response = await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error(
          `Webhook delivery failed: ${response.status} ${response.statusText}`,
        )
        return false
      }

      return true
    } catch (error) {
      console.error('Webhook delivery error:', error)
      return false
    }
  }
}

export { formatAlertMessage, buildWebhookPayload }
