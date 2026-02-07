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
      context: { params: Promise<{ evalId: string }> },
    ) => {
      try {
        const { evalId } = await context.params

        const projectId =
          auth?.workspaceId ||
          request.headers.get('x-project-id') ||
          '00000000-0000-0000-0000-000000000001'

        const ch = getClickHouseClient()

        // Fetch the score by score_id
        const scoreResult = await ch.query({
          query: `
            SELECT * FROM scores
            WHERE project_id = {projectId:String} AND score_id = {evalId:String}
            LIMIT 1
          `,
          query_params: { projectId, evalId },
          format: 'JSONEachRow',
        })

        interface ScoreRow {
          name: string
          value: number
          run_id: string | null
          timestamp: string
          comment: string
        }

        const scores = await scoreResult.json<ScoreRow>()

        if (scores.length === 0) {
          return NextResponse.json(
            { error: 'Evaluation not found' },
            { status: 404 },
          )
        }

        const score = scores[0]

        // Fetch related scores from the same run_id
        let testResults: {
          id: string
          name: string
          passed: boolean
          scores: { name: string; value: number; reason: string | undefined }[]
          latencyMs: number
        }[] = []

        if (score.run_id) {
          const relatedResult = await ch.query({
            query: `
              SELECT score_id as id, name, value, comment,
                if(value >= 0.7, 1, 0) as passed, 0 as latencyMs
              FROM scores
              WHERE project_id = {projectId:String} AND run_id = {runId:String}
              ORDER BY name
            `,
            query_params: { projectId, runId: score.run_id },
            format: 'JSONEachRow',
          })

          interface RelatedRow {
            id: string
            name: string
            value: number
            comment: string
            passed: number
            latencyMs: number
          }

          const relatedRows = await relatedResult.json<RelatedRow>()

          testResults = relatedRows.map((r) => ({
            id: r.id,
            name: r.name,
            passed: Boolean(Number(r.passed)),
            scores: [
              {
                name: r.name,
                value: Number(r.value),
                reason: r.comment || undefined,
              },
            ],
            latencyMs: Number(r.latencyMs),
          }))
        }

        return NextResponse.json({
          skillId: score.name,
          skillName: score.name,
          version: score.run_id || 'unknown',
          timestamp: score.timestamp,
          passRate: Number(score.value) >= 0.7 ? 1 : 0,
          avgScore: Number(score.value),
          avgLatencyMs: 0,
          testResults,
          isRegression: false,
          baselineScore: undefined,
        })
      } catch (error) {
        logger.error({ err: error }, 'Error fetching eval detail')
        return NextResponse.json(
          { error: 'Failed to fetch eval detail', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
  READ_LIMIT,
)
