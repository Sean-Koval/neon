/**
 * Alert Rules API
 *
 * GET /api/alerts/rules - List configured alert rules
 * POST /api/alerts/rules - Add or update an alert rule
 * DELETE /api/alerts/rules - Remove an alert rule (by id in query param)
 *
 * Alert rules are stored in-memory and initialized from defaults.
 * In a production deployment, these would be persisted to a database.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import type {
  AlertRule,
  AlertRuleCreate,
  AlertRuleUpdate,
} from '@/lib/alerting'
import { AlertEvaluator, DEFAULT_ALERT_RULES } from '@/lib/alerting'

// Singleton evaluator with default rules
const evaluator = new AlertEvaluator(DEFAULT_ALERT_RULES)

/**
 * GET /api/alerts/rules
 *
 * List all configured alert rules and their current states.
 *
 * Query params:
 * - severity: Filter by severity (critical, warning, info)
 * - enabled: Filter by enabled state (true, false)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const severityFilter = searchParams.get('severity')
  const enabledFilter = searchParams.get('enabled')

  let rules = evaluator.getRules()

  if (severityFilter) {
    rules = rules.filter((r) => r.severity === severityFilter)
  }
  if (enabledFilter !== null) {
    const enabled = enabledFilter === 'true'
    rules = rules.filter((r) => r.enabled === enabled)
  }

  const rulesWithState = rules.map((rule) => ({
    ...rule,
    state: evaluator.getState(rule.id) ?? null,
  }))

  return NextResponse.json({
    items: rulesWithState,
    count: rulesWithState.length,
    firing: evaluator.getFiringAlerts().length,
  })
}

/**
 * POST /api/alerts/rules
 *
 * Add a new alert rule or update an existing one.
 *
 * If `id` is provided in the body and matches an existing rule,
 * the rule is updated. Otherwise, a new rule is created.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields for new rules
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.metric) {
      return NextResponse.json({ error: 'metric is required' }, { status: 400 })
    }
    if (body.threshold === undefined || body.threshold === null) {
      return NextResponse.json(
        { error: 'threshold is required' },
        { status: 400 },
      )
    }
    if (!body.operator) {
      return NextResponse.json(
        { error: 'operator is required' },
        { status: 400 },
      )
    }

    const validOperators = ['gt', 'gte', 'lt', 'lte', 'eq']
    if (!validOperators.includes(body.operator)) {
      return NextResponse.json(
        { error: `operator must be one of: ${validOperators.join(', ')}` },
        { status: 400 },
      )
    }

    const validSeverities = ['critical', 'warning', 'info']
    if (body.severity && !validSeverities.includes(body.severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${validSeverities.join(', ')}` },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const existingRule = body.id ? evaluator.getRule(body.id) : undefined

    const rule: AlertRule = {
      id: body.id || uuidv4(),
      name: body.name,
      description: body.description || '',
      severity: body.severity || 'warning',
      enabled: body.enabled ?? true,
      metric: body.metric,
      operator: body.operator,
      threshold: body.threshold,
      windowSeconds: body.windowSeconds || 300,
      consecutiveBreaches: body.consecutiveBreaches || 1,
      labels: body.labels || {},
      createdAt: existingRule?.createdAt || now,
      updatedAt: now,
    }

    evaluator.addRule(rule)

    return NextResponse.json(
      { ...rule, state: evaluator.getState(rule.id) },
      { status: existingRule ? 200 : 201 },
    )
  } catch (error) {
    console.error('Error creating/updating alert rule:', error)
    return NextResponse.json(
      { error: 'Failed to create/update alert rule', details: String(error) },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/alerts/rules
 *
 * Remove an alert rule.
 *
 * Query params:
 * - id: Rule ID to delete (required)
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json(
      { error: 'id query parameter is required' },
      { status: 400 },
    )
  }

  const rule = evaluator.getRule(id)
  if (!rule) {
    return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 })
  }

  evaluator.removeRule(id)

  return new NextResponse(null, { status: 204 })
}
