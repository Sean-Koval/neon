/**
 * Agents Router
 *
 * tRPC procedures for agent registry operations.
 */

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, agents } from '@/lib/db'
import { getClickHouseClient } from '@/lib/clickhouse'
import { router, publicProcedure } from '../trpc'

export const agentsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        environment: z.string().optional(),
        search: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId

      // Auto-discover agents from ClickHouse traces
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

      return chAgents.map((ch) => {
        const enrichment = pgMap.get(ch.agent_id)
        const traceCount = Number(ch.trace_count)
        const errorCount = Number(ch.error_count)

        return {
          id: ch.agent_id,
          name: enrichment?.displayName || ch.agent_id,
          version: ch.agent_version || 'unknown',
          environments: enrichment?.environments || [],
          health: errorCount / traceCount > 0.1 ? 'failing' : errorCount / traceCount > 0.05 ? 'degraded' : 'healthy' as const,
          traceCount,
          errorRate: traceCount > 0 ? (errorCount / traceCount) * 100 : 0,
          avgDuration: Number(ch.avg_duration),
          p50Latency: Number(ch.p50_latency),
          description: enrichment?.description,
          team: enrichment?.team,
          tags: enrichment?.tags || [],
        }
      })
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId

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
        query_params: { projectId, agentId: input.id },
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

      const pgAgent = await db.select().from(agents).where(eq(agents.id, input.id))
      const enrichment = pgAgent[0]
      const ch_row = rows[0]

      if (!ch_row) {
        return null
      }

      const traceCount = Number(ch_row.trace_count)
      const errorCount = Number(ch_row.error_count)

      return {
        id: ch_row.agent_id,
        name: enrichment?.displayName || ch_row.agent_id,
        version: ch_row.agent_version || 'unknown',
        environments: enrichment?.environments || [],
        health: errorCount / traceCount > 0.1 ? 'failing' : errorCount / traceCount > 0.05 ? 'degraded' : 'healthy' as const,
        traceCount,
        errorRate: traceCount > 0 ? (errorCount / traceCount) * 100 : 0,
        avgDuration: Number(ch_row.avg_duration),
        p50Latency: Number(ch_row.p50_latency),
        description: enrichment?.description,
        team: enrichment?.team,
        tags: enrichment?.tags || [],
        associatedSuites: enrichment?.associatedSuites || [],
        mcpServers: enrichment?.mcpServers || [],
        metadata: enrichment?.metadata,
      }
    }),

  getVersions: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId

      const ch = getClickHouseClient()

      // Get version info from traces
      const result = await ch.query({
        query: `
          SELECT
            agent_version,
            min(timestamp) as first_seen,
            max(timestamp) as last_seen,
            count() as trace_count,
            avg(duration_ms) as avg_duration
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id = {agentId:String}
            AND agent_version IS NOT NULL
            AND agent_version != ''
          GROUP BY agent_version
          ORDER BY first_seen DESC
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const rows = await result.json<{
        agent_version: string
        first_seen: string
        last_seen: string
        trace_count: string
        avg_duration: string
      }>()

      // Enrich with avg score per version from scores table
      const scoreResult = await ch.query({
        query: `
          SELECT
            t.agent_version,
            avg(s.value) as avg_score
          FROM neon.scores s
          JOIN neon.traces t ON s.project_id = t.project_id AND s.trace_id = t.trace_id
          WHERE t.project_id = {projectId:String}
            AND t.agent_id = {agentId:String}
            AND t.agent_version IS NOT NULL
            AND t.agent_version != ''
          GROUP BY t.agent_version
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const scoreRows = await scoreResult.json<{
        agent_version: string
        avg_score: string
      }>()

      const scoreMap = new Map(scoreRows.map((r) => [r.agent_version, Number(r.avg_score)]))

      return rows.map((row) => ({
        version: row.agent_version,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        traceCount: Number(row.trace_count),
        avgScore: scoreMap.get(row.agent_version) ?? null,
        avgDuration: Number(row.avg_duration),
      }))
    }),

  upsert: publicProcedure
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().optional(),
        description: z.string().optional(),
        team: z.string().optional(),
        environments: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        associatedSuites: z.array(z.string()).optional(),
        mcpServers: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        workspaceId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await db.select().from(agents).where(eq(agents.id, input.id))

      if (existing.length > 0) {
        await db
          .update(agents)
          .set({
            displayName: input.displayName,
            description: input.description,
            team: input.team,
            environments: input.environments,
            tags: input.tags,
            associatedSuites: input.associatedSuites,
            mcpServers: input.mcpServers,
            metadata: input.metadata,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, input.id))
      } else {
        await db.insert(agents).values({
          id: input.id,
          displayName: input.displayName,
          description: input.description,
          team: input.team,
          environments: input.environments,
          tags: input.tags,
          associatedSuites: input.associatedSuites,
          mcpServers: input.mcpServers,
          metadata: input.metadata,
          workspaceId: input.workspaceId,
        })
      }

      return { success: true }
    }),
})
