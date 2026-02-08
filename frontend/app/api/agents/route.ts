/**
 * Agent Registry API
 *
 * GET /api/agents - List agents (auto-discovered from ClickHouse + enriched from PostgreSQL)
 * POST /api/agents - Register/enrich an agent
 */

import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getClickHouseClient } from '@/lib/clickhouse'
import { agents, db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

export const GET = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const ch = getClickHouseClient()
      const result = await ch.query({
        query: `
          SELECT
            agent_id,
            agent_version,
            count() as trace_count,
            countIf(status = 'error') as error_count,
            avg(duration_ms) as avg_duration,
            quantile(0.5)(duration_ms) as p50_latency
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id IS NOT NULL
            AND agent_id != ''
          GROUP BY agent_id, agent_version
          ORDER BY trace_count DESC
        `,
        query_params: { projectId },
        format: 'JSONEachRow',
      })

      const chAgents = await result.json<{
        agent_id: string
        agent_version: string
        trace_count: string
        error_count: string
        avg_duration: string
        p50_latency: string
      }>()

      // Get PostgreSQL enrichment data
      const pgAgents = await db.select().from(agents)
      const pgMap = new Map(pgAgents.map((a) => [a.id, a]))

      const items = chAgents.map((ch) => {
        const enrichment = pgMap.get(ch.agent_id)
        const traceCount = Number(ch.trace_count)
        const errorCount = Number(ch.error_count)

        return {
          id: ch.agent_id,
          name: enrichment?.displayName || ch.agent_id,
          version: ch.agent_version || 'unknown',
          environments: enrichment?.environments || [],
          health:
            errorCount / traceCount > 0.1
              ? 'failing'
              : errorCount / traceCount > 0.05
                ? 'degraded'
                : 'healthy',
          traceCount,
          errorRate: traceCount > 0 ? (errorCount / traceCount) * 100 : 0,
          avgDuration: Number(ch.avg_duration),
          p50Latency: Number(ch.p50_latency),
          description: enrichment?.description,
          team: enrichment?.team,
        }
      })

      return NextResponse.json({ items, count: items.length })
    } catch (error) {
      logger.error({ err: error }, 'Error listing agents')
      return NextResponse.json(
        { error: 'Failed to list agents', details: String(error) },
        { status: 500 },
      )
    }
  }),
)

export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const body = await request.json()
      const { id, displayName, description, team, environments, associatedSuites, mcpServers, metadata } = body

      if (!id) {
        return NextResponse.json({ error: 'Agent id is required' }, { status: 400 })
      }

      const existing = await db.select().from(agents).where(eq(agents.id, id))

      if (existing.length > 0) {
        await db
          .update(agents)
          .set({
            displayName,
            description,
            team,
            environments,
            associatedSuites,
            mcpServers,
            metadata,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, id))
      } else {
        await db.insert(agents).values({
          id,
          displayName,
          description,
          team,
          environments,
          associatedSuites,
          mcpServers,
          metadata,
          workspaceId: projectId,
        })
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      logger.error({ err: error }, 'Error registering agent')
      return NextResponse.json(
        { error: 'Failed to register agent', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
