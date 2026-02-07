import { type NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { getClickHouseClient } from '@/lib/clickhouse'
import { READ_LIMIT } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const GET = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth,
      context: { params: Promise<{ skillId: string }> },
    ) => {
      try {
        const { skillId } = await context.params

        const projectId =
          auth?.workspaceId ||
          request.headers.get('x-project-id') ||
          '00000000-0000-0000-0000-000000000001'

        const searchParams = request.nextUrl.searchParams
        const limit = Number(searchParams.get('limit')) || 20

        const ch = getClickHouseClient()

        const result = await ch.query({
          query: `
            SELECT
              score_id as id,
              coalesce(run_id, 'unknown') as version,
              timestamp,
              value as avgScore,
              if(value >= 0.7, 1, 0) as passRate,
              0 as avgLatencyMs,
              0 as isRegression
            FROM scores
            WHERE project_id = {projectId:String} AND name = {skillId:String}
            ORDER BY timestamp DESC
            LIMIT {limit:UInt32}
          `,
          query_params: { projectId, skillId, limit },
          format: 'JSONEachRow',
        })

        interface RawEvaluation {
          id: string
          version: string
          timestamp: string
          avgScore: number
          passRate: number
          avgLatencyMs: number
          isRegression: number
        }

        const rows = await result.json<RawEvaluation>()

        const evaluations = rows.map((row) => ({
          ...row,
          avgScore: Number(row.avgScore),
          passRate: Number(row.passRate),
          avgLatencyMs: Number(row.avgLatencyMs),
          isRegression: Boolean(Number(row.isRegression)),
        }))

        return NextResponse.json({ skillId, evaluations })
      } catch (error) {
        logger.error({ err: error }, 'Error fetching skill history')
        return NextResponse.json(
          { error: 'Failed to fetch skill history', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
  READ_LIMIT,
)
