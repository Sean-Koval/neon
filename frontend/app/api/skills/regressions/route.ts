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

      const ch = getClickHouseClient()

      const result = await ch.query({
        query: `
          WITH recent AS (
            SELECT name, avg(value) as current_score
            FROM scores
            WHERE project_id = {projectId:String}
              AND timestamp >= now() - INTERVAL 7 DAY
            GROUP BY name
          ),
          baseline AS (
            SELECT name, avg(value) as baseline_score
            FROM scores
            WHERE project_id = {projectId:String}
              AND timestamp >= now() - INTERVAL 30 DAY
              AND timestamp < now() - INTERVAL 7 DAY
            GROUP BY name
          )
          SELECT
            r.name as skillId,
            r.name as skillName,
            r.current_score as currentScore,
            b.baseline_score as baselineScore,
            r.current_score - b.baseline_score as delta
          FROM recent r
          JOIN baseline b ON r.name = b.name
          WHERE r.current_score < b.baseline_score - 0.05
          ORDER BY delta ASC
        `,
        query_params: { projectId },
        format: 'JSONEachRow',
      })

      interface RawRegression {
        skillId: string
        skillName: string
        currentScore: number
        baselineScore: number
        delta: number
      }

      const rows = await result.json<RawRegression>()

      const regressions = rows.map((r) => {
        const delta = Number(r.delta)
        const severity =
          delta < -0.15 ? 'high' : delta < -0.08 ? 'medium' : 'low'
        return {
          skillId: r.skillId,
          skillName: r.skillName,
          severity,
          delta,
          baselineScore: Number(r.baselineScore),
          currentScore: Number(r.currentScore),
          detectedAt: new Date().toISOString(),
          affectedTests: 0,
        }
      })

      return NextResponse.json({ regressions })
    } catch (error) {
      logger.error({ err: error }, 'Error fetching skill regressions')
      return NextResponse.json(
        { error: 'Failed to fetch skill regressions', details: String(error) },
        { status: 500 },
      )
    }
  }),
  READ_LIMIT,
)
