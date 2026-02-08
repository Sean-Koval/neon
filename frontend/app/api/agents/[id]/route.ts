/**
 * Agent Detail API
 *
 * GET /api/agents/:id - Get single agent with metrics and metadata
 * PATCH /api/agents/:id - Update agent metadata
 */

import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getClickHouseClient } from '@/lib/clickhouse'
import { agents, db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

export const GET = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth: AuthResult,
      { params }: { params: Promise<{ id: string }> },
    ) => {
      try {
        const { id: agentId } = await params
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
              AND agent_id = {agentId:String}
            GROUP BY agent_id, agent_version
            ORDER BY trace_count DESC
            LIMIT 1
          `,
          query_params: { projectId, agentId },
          format: 'JSONEachRow',
        })

        const rows = await result.json<{
          agent_id: string
          agent_version: string
          trace_count: string
          error_count: string
          avg_duration: string
          p50_latency: string
        }>()

        const pgAgent = await db.select().from(agents).where(eq(agents.id, agentId))
        const enrichment = pgAgent[0]
        const ch_row = rows[0]

        if (!ch_row) {
          return NextResponse.json(
            { error: 'Agent not found' },
            { status: 404 },
          )
        }

        const traceCount = Number(ch_row.trace_count)
        const errorCount = Number(ch_row.error_count)

        return NextResponse.json({
          id: ch_row.agent_id,
          name: enrichment?.displayName || ch_row.agent_id,
          version: ch_row.agent_version || 'unknown',
          environments: enrichment?.environments || [],
          health:
            errorCount / traceCount > 0.1
              ? 'failing'
              : errorCount / traceCount > 0.05
                ? 'degraded'
                : 'healthy',
          traceCount,
          errorRate: traceCount > 0 ? (errorCount / traceCount) * 100 : 0,
          avgDuration: Number(ch_row.avg_duration),
          p50Latency: Number(ch_row.p50_latency),
          description: enrichment?.description,
          team: enrichment?.team,
          associatedSuites: enrichment?.associatedSuites || [],
          mcpServers: enrichment?.mcpServers || [],
          metadata: enrichment?.metadata,
        })
      } catch (error) {
        logger.error({ err: error }, 'Error getting agent detail')
        return NextResponse.json(
          { error: 'Failed to get agent', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

export const PATCH = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth: AuthResult,
      { params }: { params: Promise<{ id: string }> },
    ) => {
      try {
        const { id: agentId } = await params
        const projectId = auth.workspaceId
        if (!projectId) {
          return NextResponse.json(
            { error: 'Workspace context required' },
            { status: 400 },
          )
        }

        const body = await request.json()
        const { displayName, description, team, environments, associatedSuites, mcpServers, metadata } = body

        const existing = await db.select().from(agents).where(eq(agents.id, agentId))

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
            .where(eq(agents.id, agentId))
        } else {
          await db.insert(agents).values({
            id: agentId,
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
        logger.error({ err: error }, 'Error updating agent')
        return NextResponse.json(
          { error: 'Failed to update agent', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
