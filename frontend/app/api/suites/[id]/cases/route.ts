import { type NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { validateBody } from '@/lib/validation/middleware'
import { createCaseSchema } from '@/lib/validation/schemas'
import {
  buildCaseConfig,
  buildCaseExpected,
  getPool,
  isConnectionError,
  isValidUuid,
  loadCases,
  mapRowToCase,
} from '@/app/api/suites/shared'

async function getOwnedSuiteId(projectId: string, suiteId: string) {
  const pool = getPool()
  const result = await pool.query(
    'SELECT id, project_id FROM suites WHERE id = $1',
    [suiteId],
  )

  if (result.rows.length === 0 || result.rows[0].project_id !== projectId) {
    return null
  }

  return result.rows[0].id as string
}

export const GET = withRateLimit(
  withAuth(
    async (
      _request: NextRequest,
      auth: AuthResult,
      context: { params: Promise<{ id: string }> },
    ) => {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const { id } = await context.params
      if (!isValidUuid(id)) {
        return NextResponse.json(
          { error: 'Invalid suite ID format' },
          { status: 400 },
        )
      }

      try {
        const ownedSuiteId = await getOwnedSuiteId(projectId, id)
        if (!ownedSuiteId) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const cases = await loadCases(getPool(), ownedSuiteId)
        return NextResponse.json(cases)
      } catch (error) {
        logger.error({ err: error }, 'Error fetching suite cases')

        if (isConnectionError(error)) {
          return NextResponse.json(
            {
              error: 'Database not available',
              details: 'PostgreSQL is not reachable.',
            },
            { status: 503 },
          )
        }

        return NextResponse.json(
          { error: 'Failed to fetch suite cases', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

export const POST = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth: AuthResult,
      context: { params: Promise<{ id: string }> },
    ) => {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const { id } = await context.params
      if (!isValidUuid(id)) {
        return NextResponse.json(
          { error: 'Invalid suite ID format' },
          { status: 400 },
        )
      }

      try {
        const validation = validateBody(createCaseSchema, await request.json())
        if (!validation.success) return validation.response

        const ownedSuiteId = await getOwnedSuiteId(projectId, id)
        if (!ownedSuiteId) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const data = validation.data
        const result = await getPool().query(
          `INSERT INTO cases (suite_id, name, description, input, expected, scorers, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            ownedSuiteId,
            data.name,
            data.description || null,
            JSON.stringify(data.input),
            JSON.stringify(buildCaseExpected(data)),
            JSON.stringify(data.scorers),
            JSON.stringify(buildCaseConfig(data)),
          ],
        )

        return NextResponse.json(
          mapRowToCase(result.rows[0] as Record<string, unknown>),
          { status: 201 },
        )
      } catch (error) {
        logger.error({ err: error }, 'Error creating suite case')

        if (isConnectionError(error)) {
          return NextResponse.json(
            {
              error: 'Database not available',
              details: 'PostgreSQL is not reachable.',
            },
            { status: 503 },
          )
        }

        return NextResponse.json(
          { error: 'Failed to create suite case', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
