/**
 * Alert Evaluator Tests
 *
 * Tests for the AlertEvaluator class:
 * - Rule management (add, remove, get)
 * - Metric evaluation against thresholds
 * - Alert state transitions (inactive -> pending -> firing -> resolved)
 * - Consecutive breach counting
 * - Notification generation
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AlertEvaluator } from '@/lib/alerting/evaluator'
import type { AlertRule, MetricDataPoint } from '@/lib/alerting/types'

// =============================================================================
// Test Fixtures
// =============================================================================

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test alert rule',
    severity: 'warning',
    enabled: true,
    metric: 'test.metric',
    operator: 'gt',
    threshold: 100,
    windowSeconds: 300,
    consecutiveBreaches: 1,
    labels: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMetric(metric: string, value: number): MetricDataPoint {
  return { metric, value, timestamp: new Date().toISOString() }
}

// =============================================================================
// Tests
// =============================================================================

describe('AlertEvaluator', () => {
  let evaluator: AlertEvaluator

  beforeEach(() => {
    evaluator = new AlertEvaluator()
  })

  describe('Rule Management', () => {
    it('adds a rule and retrieves it', () => {
      const rule = makeRule()
      evaluator.addRule(rule)

      expect(evaluator.getRule('test-rule')).toEqual(rule)
      expect(evaluator.getRules()).toHaveLength(1)
    })

    it('initializes state when adding a rule', () => {
      evaluator.addRule(makeRule())

      const state = evaluator.getState('test-rule')
      expect(state).toBeDefined()
      expect(state!.status).toBe('inactive')
      expect(state!.firingCount).toBe(0)
      expect(state!.firedAt).toBeNull()
    })

    it('removes a rule and its state', () => {
      evaluator.addRule(makeRule())
      expect(evaluator.getRules()).toHaveLength(1)

      const removed = evaluator.removeRule('test-rule')
      expect(removed).toBe(true)
      expect(evaluator.getRules()).toHaveLength(0)
      expect(evaluator.getState('test-rule')).toBeUndefined()
    })

    it('returns false when removing nonexistent rule', () => {
      expect(evaluator.removeRule('nonexistent')).toBe(false)
    })

    it('initializes with rules array', () => {
      const rules = [makeRule({ id: 'r1' }), makeRule({ id: 'r2' })]
      const e = new AlertEvaluator(rules)

      expect(e.getRules()).toHaveLength(2)
      expect(e.getState('r1')).toBeDefined()
      expect(e.getState('r2')).toBeDefined()
    })

    it('updates an existing rule without resetting state', () => {
      const rule = makeRule()
      evaluator.addRule(rule)

      // Trigger a metric to change state
      evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(evaluator.getState('test-rule')!.status).toBe('firing')

      // Update rule threshold
      evaluator.addRule({ ...rule, threshold: 200 })
      // State should be preserved (still firing from before)
      expect(evaluator.getState('test-rule')!.status).toBe('firing')
      expect(evaluator.getRule('test-rule')!.threshold).toBe(200)
    })
  })

  describe('Evaluation - Greater Than', () => {
    it('fires when value exceeds threshold', () => {
      evaluator.addRule(makeRule({ operator: 'gt', threshold: 100 }))

      const notifications = evaluator.evaluate([makeMetric('test.metric', 150)])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('firing')
      expect(evaluator.getState('test-rule')!.status).toBe('firing')
    })

    it('does not fire when value equals threshold', () => {
      evaluator.addRule(makeRule({ operator: 'gt', threshold: 100 }))

      const notifications = evaluator.evaluate([makeMetric('test.metric', 100)])

      expect(notifications).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('inactive')
    })

    it('does not fire when value is below threshold', () => {
      evaluator.addRule(makeRule({ operator: 'gt', threshold: 100 }))

      const notifications = evaluator.evaluate([makeMetric('test.metric', 50)])

      expect(notifications).toHaveLength(0)
    })
  })

  describe('Evaluation - Less Than', () => {
    it('fires when value is below threshold', () => {
      evaluator.addRule(makeRule({ operator: 'lt', threshold: 0.7 }))

      const notifications = evaluator.evaluate([makeMetric('test.metric', 0.5)])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('firing')
    })

    it('does not fire when value exceeds threshold', () => {
      evaluator.addRule(makeRule({ operator: 'lt', threshold: 0.7 }))

      const notifications = evaluator.evaluate([makeMetric('test.metric', 0.9)])

      expect(notifications).toHaveLength(0)
    })
  })

  describe('Evaluation - Other Operators', () => {
    it('gte fires when value equals threshold', () => {
      evaluator.addRule(makeRule({ operator: 'gte', threshold: 100 }))
      const n = evaluator.evaluate([makeMetric('test.metric', 100)])
      expect(n).toHaveLength(1)
    })

    it('lte fires when value equals threshold', () => {
      evaluator.addRule(makeRule({ operator: 'lte', threshold: 100 }))
      const n = evaluator.evaluate([makeMetric('test.metric', 100)])
      expect(n).toHaveLength(1)
    })

    it('eq fires when value equals threshold exactly', () => {
      evaluator.addRule(makeRule({ operator: 'eq', threshold: 42 }))
      const n = evaluator.evaluate([makeMetric('test.metric', 42)])
      expect(n).toHaveLength(1)
    })

    it('eq does not fire when value differs', () => {
      evaluator.addRule(makeRule({ operator: 'eq', threshold: 42 }))
      const n = evaluator.evaluate([makeMetric('test.metric', 43)])
      expect(n).toHaveLength(0)
    })
  })

  describe('Consecutive Breaches', () => {
    it('requires multiple breaches before firing', () => {
      evaluator.addRule(makeRule({ consecutiveBreaches: 3 }))

      // First breach - pending
      let n = evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(n).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('pending')
      expect(evaluator.getState('test-rule')!.firingCount).toBe(1)

      // Second breach - still pending
      n = evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(n).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('pending')
      expect(evaluator.getState('test-rule')!.firingCount).toBe(2)

      // Third breach - fires
      n = evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(n).toHaveLength(1)
      expect(n[0].type).toBe('firing')
      expect(evaluator.getState('test-rule')!.status).toBe('firing')
    })

    it('resets breach count when value returns to normal', () => {
      evaluator.addRule(makeRule({ consecutiveBreaches: 3 }))

      // Two breaches
      evaluator.evaluate([makeMetric('test.metric', 150)])
      evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(evaluator.getState('test-rule')!.firingCount).toBe(2)

      // Value returns to normal
      evaluator.evaluate([makeMetric('test.metric', 50)])
      expect(evaluator.getState('test-rule')!.firingCount).toBe(0)
      expect(evaluator.getState('test-rule')!.status).toBe('inactive')

      // Start breaching again - count starts from 0
      evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(evaluator.getState('test-rule')!.firingCount).toBe(1)
    })
  })

  describe('State Transitions', () => {
    it('transitions: inactive -> firing -> resolved -> inactive', () => {
      evaluator.addRule(makeRule())

      // inactive -> firing
      evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(evaluator.getState('test-rule')!.status).toBe('firing')

      // firing -> resolved (value drops below threshold)
      const resolved = evaluator.evaluate([makeMetric('test.metric', 50)])
      expect(resolved).toHaveLength(1)
      expect(resolved[0].type).toBe('resolved')
      expect(evaluator.getState('test-rule')!.status).toBe('resolved')

      // resolved stays resolved until it fires again or remains normal
      evaluator.evaluate([makeMetric('test.metric', 50)])
      // No notification for staying normal
    })

    it('does not generate duplicate firing notifications', () => {
      evaluator.addRule(makeRule())

      // First breach - fires
      const n1 = evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(n1).toHaveLength(1)

      // Still breaching - no new notification
      const n2 = evaluator.evaluate([makeMetric('test.metric', 200)])
      expect(n2).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('firing')
    })

    it('records firedAt and resolvedAt timestamps', () => {
      evaluator.addRule(makeRule())

      evaluator.evaluate([makeMetric('test.metric', 150)])
      const firedState = evaluator.getState('test-rule')!
      expect(firedState.firedAt).not.toBeNull()

      evaluator.evaluate([makeMetric('test.metric', 50)])
      const resolvedState = evaluator.getState('test-rule')!
      expect(resolvedState.resolvedAt).not.toBeNull()
    })
  })

  describe('Disabled Rules', () => {
    it('skips evaluation of disabled rules', () => {
      evaluator.addRule(makeRule({ enabled: false }))

      const n = evaluator.evaluate([makeMetric('test.metric', 150)])
      expect(n).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('inactive')
    })
  })

  describe('Multiple Rules', () => {
    it('evaluates multiple rules independently', () => {
      evaluator.addRule(makeRule({ id: 'rule-a', metric: 'metric.a', threshold: 100 }))
      evaluator.addRule(makeRule({ id: 'rule-b', metric: 'metric.b', threshold: 50 }))

      const n = evaluator.evaluate([
        makeMetric('metric.a', 150), // breaching
        makeMetric('metric.b', 30),  // not breaching
      ])

      expect(n).toHaveLength(1)
      expect(n[0].rule.id).toBe('rule-a')
      expect(evaluator.getState('rule-a')!.status).toBe('firing')
      expect(evaluator.getState('rule-b')!.status).toBe('inactive')
    })

    it('getFiringAlerts returns only firing rules', () => {
      evaluator.addRule(makeRule({ id: 'r1', metric: 'm1', threshold: 100 }))
      evaluator.addRule(makeRule({ id: 'r2', metric: 'm2', threshold: 100 }))
      evaluator.addRule(makeRule({ id: 'r3', metric: 'm3', threshold: 100 }))

      evaluator.evaluate([
        makeMetric('m1', 150),
        makeMetric('m2', 50),
        makeMetric('m3', 200),
      ])

      const firing = evaluator.getFiringAlerts()
      expect(firing).toHaveLength(2)
      const ids = firing.map((s) => s.ruleId)
      expect(ids).toContain('r1')
      expect(ids).toContain('r3')
    })
  })

  describe('Notification Drain', () => {
    it('drainNotifications returns all accumulated notifications', () => {
      evaluator.addRule(makeRule())

      evaluator.evaluate([makeMetric('test.metric', 150)]) // firing
      evaluator.evaluate([makeMetric('test.metric', 50)])   // resolved

      const notifications = evaluator.drainNotifications()
      expect(notifications).toHaveLength(2)
      expect(notifications[0].type).toBe('firing')
      expect(notifications[1].type).toBe('resolved')
    })

    it('drainNotifications clears the queue', () => {
      evaluator.addRule(makeRule())
      evaluator.evaluate([makeMetric('test.metric', 150)])

      evaluator.drainNotifications()
      const second = evaluator.drainNotifications()
      expect(second).toHaveLength(0)
    })
  })

  describe('Reset', () => {
    it('resets all states to inactive', () => {
      evaluator.addRule(makeRule({ id: 'r1', metric: 'm1' }))
      evaluator.addRule(makeRule({ id: 'r2', metric: 'm2' }))

      evaluator.evaluate([makeMetric('m1', 150), makeMetric('m2', 150)])
      expect(evaluator.getFiringAlerts()).toHaveLength(2)

      evaluator.reset()

      expect(evaluator.getFiringAlerts()).toHaveLength(0)
      expect(evaluator.getState('r1')!.status).toBe('inactive')
      expect(evaluator.getState('r2')!.status).toBe('inactive')
      expect(evaluator.drainNotifications()).toHaveLength(0)
    })
  })

  describe('No Data', () => {
    it('keeps state unchanged when no metrics match the rule', () => {
      evaluator.addRule(makeRule())

      const n = evaluator.evaluate([makeMetric('other.metric', 150)])
      expect(n).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('inactive')
    })

    it('keeps state unchanged when no metrics provided', () => {
      evaluator.addRule(makeRule())
      evaluator.evaluate([makeMetric('test.metric', 150)]) // fire

      const n = evaluator.evaluate([]) // no data
      expect(n).toHaveLength(0)
      expect(evaluator.getState('test-rule')!.status).toBe('firing')
    })
  })

  describe('Current Value Tracking', () => {
    it('tracks the current metric value in state', () => {
      evaluator.addRule(makeRule())

      evaluator.evaluate([makeMetric('test.metric', 42)])
      expect(evaluator.getState('test-rule')!.currentValue).toBe(42)

      evaluator.evaluate([makeMetric('test.metric', 99)])
      expect(evaluator.getState('test-rule')!.currentValue).toBe(99)
    })

    it('uses latest metric value when multiple are provided', () => {
      evaluator.addRule(makeRule())

      evaluator.evaluate([
        makeMetric('test.metric', 10),
        makeMetric('test.metric', 50),
        makeMetric('test.metric', 200), // latest
      ])

      expect(evaluator.getState('test-rule')!.currentValue).toBe(200)
    })
  })
})
