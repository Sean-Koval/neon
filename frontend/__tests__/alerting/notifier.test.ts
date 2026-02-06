/**
 * Alert Notifier Tests
 *
 * Tests for the AlertNotifier class:
 * - Console logging
 * - Webhook delivery
 * - Batch notification
 * - Error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AlertNotifier,
  buildWebhookPayload,
  formatAlertMessage,
} from '@/lib/alerting/notifier'
import type { AlertNotification, AlertRule, AlertState } from '@/lib/alerting/types'

// =============================================================================
// Test Fixtures
// =============================================================================

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'test-rule',
    name: 'High Error Rate',
    description: 'Test rule',
    severity: 'critical',
    enabled: true,
    metric: 'api.error_rate',
    operator: 'gt',
    threshold: 0.05,
    windowSeconds: 300,
    consecutiveBreaches: 1,
    labels: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeState(overrides: Partial<AlertState> = {}): AlertState {
  return {
    ruleId: 'test-rule',
    status: 'firing',
    firedAt: '2026-01-15T10:00:00Z',
    resolvedAt: null,
    lastEvaluatedAt: '2026-01-15T10:05:00Z',
    currentValue: 0.08,
    firingCount: 1,
    ...overrides,
  }
}

function makeFiringNotification(overrides: Partial<AlertNotification> = {}): AlertNotification {
  return {
    rule: makeRule(),
    state: makeState(),
    type: 'firing',
    timestamp: '2026-01-15T10:05:00Z',
    ...overrides,
  }
}

function makeResolvedNotification(): AlertNotification {
  return {
    rule: makeRule(),
    state: makeState({
      status: 'resolved',
      resolvedAt: '2026-01-15T10:10:00Z',
      currentValue: 0.02,
    }),
    type: 'resolved',
    timestamp: '2026-01-15T10:10:00Z',
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('formatAlertMessage', () => {
  it('formats firing alert message', () => {
    const msg = formatAlertMessage(makeFiringNotification())
    expect(msg).toContain('CRITICAL')
    expect(msg).toContain('High Error Rate')
    expect(msg).toContain('api.error_rate')
    expect(msg).toContain('0.08')
    expect(msg).toContain('0.05')
  })

  it('formats resolved alert message', () => {
    const msg = formatAlertMessage(makeResolvedNotification())
    expect(msg).toContain('RESOLVED')
    expect(msg).toContain('High Error Rate')
    expect(msg).toContain('normal')
  })

  it('includes correct operator symbol', () => {
    const gt = formatAlertMessage(makeFiringNotification({ rule: makeRule({ operator: 'gt' }) }))
    expect(gt).toContain('>')

    const lt = formatAlertMessage(makeFiringNotification({ rule: makeRule({ operator: 'lt' }) }))
    expect(lt).toContain('<')
  })
})

describe('buildWebhookPayload', () => {
  it('builds correct payload structure', () => {
    const payload = buildWebhookPayload(makeFiringNotification())

    expect(payload.version).toBe('1')
    expect(payload.alert).toMatchObject({
      ruleId: 'test-rule',
      ruleName: 'High Error Rate',
      severity: 'critical',
      status: 'firing',
      metric: 'api.error_rate',
      currentValue: 0.08,
      threshold: 0.05,
      operator: 'gt',
      firedAt: '2026-01-15T10:00:00Z',
    })
    expect(payload.alert.message).toBeDefined()
    expect(payload.timestamp).toBeDefined()
  })

  it('builds resolved payload', () => {
    const payload = buildWebhookPayload(makeResolvedNotification())
    expect(payload.alert.status).toBe('resolved')
    expect(payload.alert.resolvedAt).toBe('2026-01-15T10:10:00Z')
  })
})

describe('AlertNotifier', () => {
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Console Notifications', () => {
    it('logs critical firing alerts to console.error', async () => {
      const notifier = new AlertNotifier({ consoleEnabled: true })
      await notifier.notify(makeFiringNotification())

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      expect(consoleSpy.error.mock.calls[0][0]).toContain('ALERT')
    })

    it('logs warning firing alerts to console.warn', async () => {
      const notifier = new AlertNotifier({ consoleEnabled: true })
      await notifier.notify(makeFiringNotification({
        rule: makeRule({ severity: 'warning' }),
      }))

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
    })

    it('logs resolved alerts to console.info', async () => {
      const notifier = new AlertNotifier({ consoleEnabled: true })
      await notifier.notify(makeResolvedNotification())

      expect(consoleSpy.info).toHaveBeenCalledTimes(1)
      expect(consoleSpy.info.mock.calls[0][0]).toContain('RESOLVED')
    })

    it('does not log when console is disabled', async () => {
      const notifier = new AlertNotifier({ consoleEnabled: false })
      await notifier.notify(makeFiringNotification())

      expect(consoleSpy.error).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
    })
  })

  describe('Webhook Notifications', () => {
    it('sends POST to configured webhook URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      const notifier = new AlertNotifier({
        webhookUrl: 'https://hooks.example.com/alerts',
        fetchFn: mockFetch,
      })

      const result = await notifier.notify(makeFiringNotification())
      expect(result).toBe(true)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/alerts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      // Verify payload
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.version).toBe('1')
      expect(body.alert.ruleId).toBe('test-rule')
    })

    it('returns false on webhook failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })
      const notifier = new AlertNotifier({
        webhookUrl: 'https://hooks.example.com/alerts',
        consoleEnabled: false,
        fetchFn: mockFetch,
      })

      const result = await notifier.notify(makeFiringNotification())
      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network unreachable'))
      const notifier = new AlertNotifier({
        webhookUrl: 'https://hooks.example.com/alerts',
        consoleEnabled: false,
        fetchFn: mockFetch,
      })

      const result = await notifier.notify(makeFiringNotification())
      expect(result).toBe(false)
    })

    it('does not send webhook when URL is not configured', async () => {
      const mockFetch = vi.fn()
      const notifier = new AlertNotifier({
        webhookUrl: undefined,
        fetchFn: mockFetch,
      })

      expect(notifier.hasWebhook()).toBe(false)
      await notifier.notify(makeFiringNotification())
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not send webhook when URL is empty string', async () => {
      const notifier = new AlertNotifier({ webhookUrl: '' })
      expect(notifier.hasWebhook()).toBe(false)
    })
  })

  describe('Batch Notifications', () => {
    it('sends all notifications and returns success count', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      const notifier = new AlertNotifier({
        webhookUrl: 'https://hooks.example.com/alerts',
        consoleEnabled: false,
        fetchFn: mockFetch,
      })

      const notifications = [
        makeFiringNotification(),
        makeResolvedNotification(),
        makeFiringNotification({ rule: makeRule({ id: 'rule-2', name: 'Rule 2' }) }),
      ]

      const delivered = await notifier.notifyBatch(notifications)
      expect(delivered).toBe(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('counts failures correctly', async () => {
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 2) return { ok: false, status: 500, statusText: 'Error' }
        return { ok: true, status: 200 }
      })

      const notifier = new AlertNotifier({
        webhookUrl: 'https://hooks.example.com/alerts',
        consoleEnabled: false,
        fetchFn: mockFetch,
      })

      const delivered = await notifier.notifyBatch([
        makeFiringNotification(),
        makeFiringNotification(), // this one fails
        makeFiringNotification(),
      ])

      expect(delivered).toBe(2) // 1 failed out of 3
    })
  })
})
