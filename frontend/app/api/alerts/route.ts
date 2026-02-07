/**
 * Alerts API
 *
 * GET /api/alerts - List active regression alerts + evaluate alert rules
 * POST /api/alerts - Configure alert thresholds per suite
 *
 * Thresholds are stored in-memory (reset on server restart).
 * Alerts are computed from runs data on each request.
 * Alert rules are also evaluated against current run metrics.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { AlertEvaluator, DEFAULT_ALERT_RULES } from '@/lib/alerting'
import type { MetricDataPoint } from '@/lib/alerting/types'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import {
  type AlertThreshold,
  DEFAULT_THRESHOLD,
  detectRegressions,
} from '@/lib/regression'
import type { EvalRun } from '@/lib/types'

// In-memory threshold storage per workspace
const thresholdStore = new Map<string, AlertThreshold[]>()

// Shared alert rule evaluator (initialized with defaults)
const ruleEvaluator = new AlertEvaluator(DEFAULT_ALERT_RULES)

/**
 * Compute metrics from eval runs for alert rule evaluation.
 */
function computeMetricsFromRuns(runs: EvalRun[]): MetricDataPoint[] {
  const metrics: MetricDataPoint[] = []
  const now = new Date().toISOString()

  if (runs.length === 0) return metrics

  // Average score across recent completed runs
  const completedRuns = runs.filter(
    (r) => r.status === 'completed' && r.summary?.avg_score != null,
  )

  if (completedRuns.length > 0) {
    const avgScore =
      completedRuns.reduce((sum, r) => sum + (r.summary?.avg_score ?? 0), 0) /
      completedRuns.length

    metrics.push({ metric: 'eval.avg_score', value: avgScore, timestamp: now })

    // Pass rate
    const totalCases = completedRuns.reduce(
      (sum, r) => sum + (r.summary?.total_cases ?? 0),
      0,
    )
    const passedCases = completedRuns.reduce(
      (sum, r) => sum + (r.summary?.passed ?? 0),
      0,
    )
    if (totalCases > 0) {
      metrics.push({
        metric: 'eval.pass_rate',
        value: passedCases / totalCases,
        timestamp: now,
      })
    }
  }

  // Consecutive failures
  let consecutiveFailures = 0
  const sortedRuns = [...runs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  for (const run of sortedRuns) {
    if (run.status === 'failed') {
      consecutiveFailures++
    } else {
      break
    }
  }
  metrics.push({
    metric: 'eval.consecutive_failures',
    value: consecutiveFailures,
    timestamp: now,
  })

  return metrics
}

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/neon'
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
    pool.on('error', (err: Error) => {
      console.error('PostgreSQL pool error in alerts route:', err)
    })
  }
  return pool
}

/**
 * GET /api/alerts
 *
 * Returns active regression alerts computed from recent runs.
 */
export const GET = withAuth(async (_request: NextRequest, auth: AuthResult) => {
  const projectId = auth.workspaceId
  if (!projectId) {
    return NextResponse.json(
      { error: 'Workspace context required' },
      { status: 400 },
    )
  }

  try {
    const db = getPool()
    const result = await db.query(
      `SELECT r.id, r.suite_id, COALESCE(s.name, 'Unknown Suite') as suite_name,
              r.project_id, r.agent_version, r.status,
              r.config, r.started_at, r.completed_at, r.created_at
       FROM runs r
       LEFT JOIN suites s ON r.suite_id = s.id
       WHERE r.project_id = $1 AND r.status = 'completed'
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [projectId],
    )

    const runs: EvalRun[] = result.rows.map((row) => ({
      id: row.id,
      suite_id: row.suite_id,
      suite_name: row.suite_name || 'Unknown Suite',
      project_id: row.project_id,
      agent_version: row.agent_version,
      trigger: 'manual',
      status: row.status,
      config: row.config,
      summary: null,
      started_at: row.started_at
        ? new Date(row.started_at).toISOString()
        : null,
      completed_at: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
      created_at: row.created_at
        ? new Date(row.created_at).toISOString()
        : new Date().toISOString(),
    }))

    const thresholds = thresholdStore.get(projectId) ?? []
    const alerts = detectRegressions(runs, thresholds)

    // Evaluate alert rules against current metrics
    const metrics = computeMetricsFromRuns(runs)
    const ruleNotifications = ruleEvaluator.evaluate(metrics)
    const firingRules = ruleEvaluator.getFiringAlerts()

    return NextResponse.json({
      alerts,
      thresholds:
        thresholds.length > 0
          ? thresholds
          : Array.from(new Set(runs.map((r) => r.suite_id))).map((suiteId) => ({
              suiteId,
              ...DEFAULT_THRESHOLD,
            })),
      ruleAlerts: {
        firing: firingRules.length,
        notifications: ruleNotifications.map((n) => ({
          ruleId: n.rule.id,
          ruleName: n.rule.name,
          type: n.type,
          severity: n.rule.severity,
          metric: n.rule.metric,
          currentValue: n.state.currentValue,
          threshold: n.rule.threshold,
          timestamp: n.timestamp,
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching alerts:', error)

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout') ||
        error.message.includes('does not exist'))

    if (isConnectionError) {
      return NextResponse.json({
        alerts: [],
        thresholds: [],
        warning: 'Database not available',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: String(error) },
      { status: 500 },
    )
  }
})

/**
 * POST /api/alerts
 *
 * Save alert thresholds for a suite.
 *
 * Request body:
 * {
 *   suiteId: string;
 *   absoluteMin: number;
 *   dropPercent: number;
 *   windowSize: number;
 * }
 */
export const POST = withAuth(async (request: NextRequest, auth: AuthResult) => {
  const projectId = auth.workspaceId
  if (!projectId) {
    return NextResponse.json(
      { error: 'Workspace context required' },
      { status: 400 },
    )
  }

  try {
    const body = await request.json()

    if (!body.suiteId) {
      return NextResponse.json(
        { error: 'suiteId is required' },
        { status: 400 },
      )
    }

    const threshold: AlertThreshold = {
      suiteId: body.suiteId,
      absoluteMin: Math.max(
        0,
        Math.min(1, body.absoluteMin ?? DEFAULT_THRESHOLD.absoluteMin),
      ),
      dropPercent: Math.max(
        0,
        Math.min(1, body.dropPercent ?? DEFAULT_THRESHOLD.dropPercent),
      ),
      windowSize: Math.max(
        1,
        Math.min(50, body.windowSize ?? DEFAULT_THRESHOLD.windowSize),
      ),
    }

    const existing = thresholdStore.get(projectId) ?? []
    const updated = existing.filter((t) => t.suiteId !== threshold.suiteId)
    updated.push(threshold)
    thresholdStore.set(projectId, updated)

    return NextResponse.json({ threshold }, { status: 200 })
  } catch (error) {
    console.error('Error saving threshold:', error)
    return NextResponse.json(
      { error: 'Failed to save threshold', details: String(error) },
      { status: 500 },
    )
  }
})
