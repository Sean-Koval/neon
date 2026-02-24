/**
 * Activity Feed API
 *
 * GET /api/activity - Returns recent activity events across the platform.
 *
 * Merges events from multiple sources:
 * - Eval run completions (from ClickHouse traces)
 * - Prompt deployments (from ClickHouse prompts)
 * - Alerts (TODO)
 * - Optimization completions (TODO)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getClickHouseClient } from '@/lib/clickhouse'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import type { ActivityEvent } from '@/types/activity'

/**
 * GET /api/activity?limit=10&agentId=optional
 *
 * Returns merged, time-sorted activity events.
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthResult) => {
  const projectId = auth.workspaceId
  if (!projectId) {
    return NextResponse.json(
      { error: 'Workspace context required' },
      { status: 400 },
    )
  }

  const { searchParams } = request.nextUrl
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('limit')) || 10),
  )
  const agentId = searchParams.get('agentId') || undefined

  try {
    const ch = getClickHouseClient()
    const events: ActivityEvent[] = []

    // -----------------------------------------------------------------------
    // 1. Eval run completions
    // -----------------------------------------------------------------------
    const agentFilter = agentId
      ? 'AND agent_id = {agentId:String}'
      : ''

    const evalQuery = `
      SELECT
        run_id,
        name,
        agent_id,
        max(timestamp) as completed_at,
        count() as trace_count,
        countIf(status = 'error') as error_count
      FROM neon.traces
      WHERE project_id = {projectId:String}
        AND run_id IS NOT NULL
        AND run_id != ''
        ${agentFilter}
      GROUP BY run_id, name, agent_id
      ORDER BY completed_at DESC
      LIMIT 5
    `

    const evalParams: Record<string, string> = { projectId }
    if (agentId) evalParams.agentId = agentId

    const evalResult = await ch.query({
      query: evalQuery,
      query_params: evalParams,
      format: 'JSONEachRow',
    })

    const evalRows = await evalResult.json<{
      run_id: string
      name: string
      agent_id: string
      completed_at: string
      trace_count: string
      error_count: string
    }>()

    for (const row of evalRows) {
      const traceCount = Number(row.trace_count)
      const errorCount = Number(row.error_count)
      const passCount = traceCount - errorCount

      events.push({
        id: `eval-${row.run_id}`,
        type: 'eval-complete',
        description: `${row.name || 'Unnamed'} eval completed: ${passCount}/${traceCount} passed`,
        timestamp: row.completed_at,
        href: `/eval-runs/${row.run_id}`,
        metadata: {
          runId: row.run_id,
          agentId: row.agent_id,
          traceCount,
          errorCount,
        },
      })
    }

    // -----------------------------------------------------------------------
    // 2. Prompt deployments
    // -----------------------------------------------------------------------
    const promptQuery = `
      SELECT
        prompt_id,
        name,
        version,
        updated_at
      FROM neon.prompts
      WHERE project_id = {projectId:String}
        AND is_production = 1
      ORDER BY updated_at DESC
      LIMIT 5
    `

    const promptResult = await ch.query({
      query: promptQuery,
      query_params: { projectId },
      format: 'JSONEachRow',
    })

    const promptRows = await promptResult.json<{
      prompt_id: string
      name: string
      version: string
      updated_at: string
    }>()

    for (const row of promptRows) {
      events.push({
        id: `deploy-${row.prompt_id}-v${row.version}`,
        type: 'deploy',
        description: `${row.name} v${row.version} deployed to production`,
        timestamp: row.updated_at,
        href: `/prompts/${row.prompt_id}`,
        metadata: {
          promptId: row.prompt_id,
          version: row.version,
        },
      })
    }

    // -----------------------------------------------------------------------
    // 3. Alerts
    // TODO: Fetch from alerts API or query ClickHouse directly once alert
    //       storage is implemented.
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // 4. Optimization completions
    // TODO: Wire up when training loop / optimization workflows are available.
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Merge and sort by timestamp descending, return top N
    // -----------------------------------------------------------------------
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )

    return NextResponse.json({ events: events.slice(0, limit) })
  } catch (error) {
    console.error('Error fetching activity feed:', error)

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('connect') ||
        error.message.includes('timeout'))

    if (isConnectionError) {
      return NextResponse.json({
        events: [],
        warning: 'ClickHouse not available',
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch activity feed', details: String(error) },
      { status: 500 },
    )
  }
})
