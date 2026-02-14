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

  getTraceQualityStats: publicProcedure
    .input(z.object({ agentId: z.string(), days: z.number().default(7) }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId
      const ch = getClickHouseClient()

      const traceResult = await ch.query({
        query: `
          SELECT
            count() as total_traces,
            avg(duration_ms) as avg_duration,
            quantile(0.5)(duration_ms) as median_duration
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id = {agentId:String}
            AND timestamp >= now() - INTERVAL {days:UInt32} DAY
        `,
        query_params: { projectId, agentId: input.agentId, days: input.days },
        format: 'JSONEachRow',
      })

      const traceRows = await traceResult.json<{
        total_traces: string
        avg_duration: string
        median_duration: string
      }>()

      const scoreResult = await ch.query({
        query: `
          SELECT
            avg(s.value) as avg_score,
            countIf(s.value < 0.7) as low_score_count,
            count() as scored_traces
          FROM neon.scores s
          JOIN neon.traces t ON s.project_id = t.project_id AND s.trace_id = t.trace_id
          WHERE t.project_id = {projectId:String}
            AND t.agent_id = {agentId:String}
            AND t.timestamp >= now() - INTERVAL {days:UInt32} DAY
        `,
        query_params: { projectId, agentId: input.agentId, days: input.days },
        format: 'JSONEachRow',
      })

      const scoreRows = await scoreResult.json<{
        avg_score: string
        low_score_count: string
        scored_traces: string
      }>()

      // Loop detection: traces with anomalously high span count (>50)
      const loopResult = await ch.query({
        query: `
          SELECT count() as loop_count
          FROM (
            SELECT trace_id, count() as span_count
            FROM neon.spans
            WHERE project_id = {projectId:String}
              AND trace_id IN (
                SELECT trace_id FROM neon.traces
                WHERE project_id = {projectId:String}
                  AND agent_id = {agentId:String}
                  AND timestamp >= now() - INTERVAL {days:UInt32} DAY
              )
            GROUP BY trace_id
            HAVING span_count > 50
          )
        `,
        query_params: { projectId, agentId: input.agentId, days: input.days },
        format: 'JSONEachRow',
      })

      const loopRows = await loopResult.json<{ loop_count: string }>()

      const trace = traceRows[0]
      const score = scoreRows[0]
      const loop = loopRows[0]

      return {
        totalTraces: Number(trace?.total_traces ?? 0),
        avgDuration: Number(trace?.avg_duration ?? 0),
        medianDuration: Number(trace?.median_duration ?? 0),
        avgScore: Number(score?.avg_score ?? 0),
        lowScoreCount: Number(score?.low_score_count ?? 0),
        scoredTraces: Number(score?.scored_traces ?? 0),
        loopDetections: Number(loop?.loop_count ?? 0),
      }
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const projectId = ctx.projectId
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
          workspaceId: projectId,
        })
      }

      return { success: true }
    }),

  getSystemPrompt: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId
      const ch = getClickHouseClient()

      const result = await ch.query({
        query: `
          SELECT s.input
          FROM neon.spans s
          INNER JOIN neon.traces t ON s.project_id = t.project_id AND s.trace_id = t.trace_id
          WHERE t.project_id = {projectId:String}
            AND t.agent_id = {agentId:String}
            AND s.span_type = 'generation'
            AND s.input != ''
          ORDER BY t.timestamp DESC
          LIMIT 1
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const rows = await result.json<{ input: string }>()
      if (rows.length === 0) {
        return { systemPrompt: null }
      }

      try {
        const parsed = JSON.parse(rows[0].input)
        if (Array.isArray(parsed)) {
          const systemMsg = parsed.find((m: { role?: string }) => m.role === 'system')
          if (systemMsg?.content) {
            return { systemPrompt: systemMsg.content as string }
          }
        }
        if (typeof parsed === 'string') {
          return { systemPrompt: parsed }
        }
      } catch {
        // Not JSON, return raw input
      }

      return { systemPrompt: rows[0].input }
    }),

  getCostBreakdown: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId
      const ch = getClickHouseClient()

      const result = await ch.query({
        query: `
          SELECT
            toDate(timestamp) as date,
            sum(total_tokens * 0.00001) as model_cost,
            sum(tool_calls * 0.001) as tool_cost,
            countIf(status = 'error') * 0.0005 as retry_cost,
            sum(total_tokens * 0.00001) + sum(tool_calls * 0.001) + countIf(status = 'error') * 0.0005 as total_cost
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id = {agentId:String}
            AND timestamp >= now() - INTERVAL 7 DAY
          GROUP BY date
          ORDER BY date ASC
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const rows = await result.json<{
        date: string
        model_cost: string
        tool_cost: string
        retry_cost: string
        total_cost: string
      }>()

      const dailyCosts = rows.map((r) => ({
        date: r.date,
        modelCost: Number(r.model_cost),
        toolCost: Number(r.tool_cost),
        retryCost: Number(r.retry_cost),
        totalCost: Number(r.total_cost),
      }))

      const totalModel = dailyCosts.reduce((s, d) => s + d.modelCost, 0)
      const totalTool = dailyCosts.reduce((s, d) => s + d.toolCost, 0)
      const totalRetry = dailyCosts.reduce((s, d) => s + d.retryCost, 0)
      const totalAll = totalModel + totalTool + totalRetry
      const days = dailyCosts.length || 1

      return {
        dailyCosts,
        totalDailyCost: totalAll / days,
        attribution: { model: totalModel, tool: totalTool, retry: totalRetry },
      }
    }),

  getHealthTrends: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId
      const ch = getClickHouseClient()

      const latencyResult = await ch.query({
        query: `
          SELECT
            toDate(timestamp) as date,
            avg(duration_ms) as avg_latency,
            quantile(0.5)(duration_ms) as p50_latency
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id = {agentId:String}
            AND timestamp >= now() - INTERVAL 7 DAY
          GROUP BY date
          ORDER BY date ASC
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const latencyRows = await latencyResult.json<{
        date: string
        avg_latency: string
        p50_latency: string
      }>()

      const scoreResult = await ch.query({
        query: `
          SELECT
            toDate(t.timestamp) as date,
            avg(s.value) * 100 as avg_score
          FROM neon.scores s
          INNER JOIN neon.traces t ON s.project_id = t.project_id AND s.trace_id = t.trace_id
          WHERE t.project_id = {projectId:String}
            AND t.agent_id = {agentId:String}
            AND t.timestamp >= now() - INTERVAL 7 DAY
          GROUP BY date
          ORDER BY date ASC
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const scoreRows = await scoreResult.json<{ date: string; avg_score: string }>()
      const scoreMap = new Map(scoreRows.map((r) => [r.date, Number(r.avg_score)]))

      const daily = latencyRows.map((r) => ({
        date: r.date,
        avgLatency: Number(r.avg_latency),
        p50Latency: Number(r.p50_latency),
        avgScore: scoreMap.get(r.date) ?? null,
      }))

      return { daily }
    }),

  getRecentActivity: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectId = ctx.projectId
      const ch = getClickHouseClient()

      const result = await ch.query({
        query: `
          SELECT
            trace_id, name, status, agent_version, timestamp, duration_ms
          FROM neon.traces
          WHERE project_id = {projectId:String}
            AND agent_id = {agentId:String}
          ORDER BY timestamp DESC
          LIMIT 10
        `,
        query_params: { projectId, agentId: input.agentId },
        format: 'JSONEachRow',
      })

      const rows = await result.json<{
        trace_id: string
        name: string
        status: string
        agent_version: string
        timestamp: string
        duration_ms: string
      }>()

      let lastVersion: string | null = null
      const events = rows.map((row, i) => {
        let type: 'eval_completed' | 'eval_failed' | 'deployment'

        if (row.status === 'error') {
          type = 'eval_failed'
        } else if (lastVersion !== null && row.agent_version !== lastVersion) {
          type = 'deployment'
        } else {
          type = 'eval_completed'
        }

        const description = type === 'deployment'
          ? `Version changed to ${row.agent_version}`
          : `${row.name || 'Trace'} ${type === 'eval_failed' ? 'failed' : 'completed'} (${Number(row.duration_ms).toFixed(0)}ms)`

        lastVersion = row.agent_version

        return {
          id: `${row.trace_id}-${i}`,
          type,
          description,
          timestamp: row.timestamp,
          traceId: row.trace_id,
        }
      })

      return { events }
    }),
})
