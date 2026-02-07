import { type NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { getClickHouseClient } from '@/lib/clickhouse'
import { READ_LIMIT } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const GET = withRateLimit(
  withAuth(async (request: NextRequest, auth) => {
    try {
      const projectId =
        auth?.workspaceId ||
        request.headers.get('x-project-id') ||
        '00000000-0000-0000-0000-000000000001'

      const searchParams = request.nextUrl.searchParams
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')

      const ch = getClickHouseClient()

      const conditions = ['project_id = {projectId:String}']
      const queryParams: Record<string, string | number> = { projectId }

      if (startDate && endDate) {
        conditions.push(
          'timestamp >= {startDate:Date} AND timestamp <= {endDate:Date} + INTERVAL 1 DAY',
        )
        queryParams.startDate = startDate
        queryParams.endDate = endDate
      }

      const result = await ch.query({
        query: `
          SELECT
            name as skillId,
            name as skillName,
            count() as totalEvals,
            countIf(value >= 0.7) / count() as passRate,
            avg(value) as avgScore,
            0 as avgLatencyMs,
            max(timestamp) as lastEvalDate
          FROM scores
          WHERE ${conditions.join(' AND ')}
          GROUP BY name
          ORDER BY totalEvals DESC
        `,
        query_params: queryParams,
        format: 'JSONEachRow',
      })

      interface RawSummary {
        skillId: string
        skillName: string
        totalEvals: number
        passRate: number
        avgScore: number
        avgLatencyMs: number
        lastEvalDate: string
      }

      const rows = await result.json<RawSummary>()

      const summaries = rows.map((row) => ({
        ...row,
        totalEvals: Number(row.totalEvals),
        passRate: Number(row.passRate),
        avgScore: Number(row.avgScore),
        avgLatencyMs: Number(row.avgLatencyMs),
        trend: 'stable' as const,
        regressionCount: 0,
      }))

      return NextResponse.json({ summaries })
    } catch (error) {
      logger.error({ err: error }, 'Error fetching skill summaries')
      return NextResponse.json(
        { error: 'Failed to fetch skill summaries', details: String(error) },
        { status: 500 },
      )
    }
  }),
  READ_LIMIT,
)
