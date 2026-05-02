import { type NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { validateBody } from '@/lib/validation/middleware'
import { updateCaseSchema } from '@/lib/validation/schemas'
import {
  buildCaseConfig,
  buildCaseExpected,
  getPool,
  isConnectionError,
  isValidUuid,
  mapRowToCase,
} from '@/app/api/suites/shared'

async function ensureOwnedSuite(projectId: string, suiteId: string) {
  const suiteResult = await getPool().query(
    'SELECT id, project_id FROM suites WHERE id = $1',
    [suiteId],
  )

  if (
    suiteResult.rows.length === 0 ||
    suiteResult.rows[0].project_id !== projectId
  ) {
    return false
  }

  return true
}

export const PATCH = withRateLimit(
  withAuth(
    async (
      request: NextRequest,
      auth: AuthResult,
      context: { params: Promise<{ id: string; caseId: string }> },
    ) => {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const { id, caseId } = await context.params
      if (!isValidUuid(id) || !isValidUuid(caseId)) {
        return NextResponse.json(
          { error: 'Invalid suite or case ID format' },
          { status: 400 },
        )
      }

      try {
        const validation = validateBody(updateCaseSchema, await request.json())
        if (!validation.success) return validation.response

        const ownsSuite = await ensureOwnedSuite(projectId, id)
        if (!ownsSuite) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const existingResult = await getPool().query(
          'SELECT * FROM cases WHERE id = $1 AND suite_id = $2',
          [caseId, id],
        )
        if (existingResult.rows.length === 0) {
          return NextResponse.json(
            { error: 'Case not found' },
            { status: 404 },
          )
        }

        const currentRow = existingResult.rows[0] as Record<string, unknown>
        const currentExpected =
          typeof currentRow.expected === 'object' && currentRow.expected
            ? (currentRow.expected as Record<string, unknown>)
            : {}
        const currentConfig =
          typeof currentRow.config === 'object' && currentRow.config
            ? (currentRow.config as Record<string, unknown>)
            : {}

        const data = validation.data
        const updates: string[] = []
        const params: unknown[] = []
        let paramIndex = 1

        if (data.name !== undefined) {
          updates.push(`name = $${paramIndex++}`)
          params.push(data.name)
        }

        if (data.description !== undefined) {
          updates.push(`description = $${paramIndex++}`)
          params.push(data.description)
        }

        if (data.input !== undefined) {
          updates.push(`input = $${paramIndex++}`)
          params.push(JSON.stringify(data.input))
        }

        if (
          data.expected_tools !== undefined ||
          data.expected_tool_sequence !== undefined ||
          data.expected_output_contains !== undefined ||
          data.expected_output_pattern !== undefined
        ) {
          updates.push(`expected = $${paramIndex++}`)
          params.push(
            JSON.stringify({
              ...currentExpected,
              ...buildCaseExpected(data),
            }),
          )
        }

        if (data.scorers !== undefined) {
          updates.push(`scorers = $${paramIndex++}`)
          params.push(JSON.stringify(data.scorers))
        }

        if (
          data.scorer_config !== undefined ||
          data.min_score !== undefined ||
          data.tags !== undefined ||
          data.timeout_seconds !== undefined
        ) {
          updates.push(`config = $${paramIndex++}`)
          params.push(
            JSON.stringify({
              ...currentConfig,
              ...buildCaseConfig(data),
            }),
          )
        }

        updates.push('updated_at = NOW()')

        if (updates.length === 1) {
          return NextResponse.json(mapRowToCase(currentRow))
        }

        params.push(caseId, id)
        const result = await getPool().query(
          `UPDATE cases
           SET ${updates.join(', ')}
           WHERE id = $${paramIndex++} AND suite_id = $${paramIndex}
           RETURNING *`,
          params,
        )

        return NextResponse.json(
          mapRowToCase(result.rows[0] as Record<string, unknown>),
        )
      } catch (error) {
        logger.error({ err: error }, 'Error updating suite case')

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
          { error: 'Failed to update suite case', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

export const DELETE = withRateLimit(
  withAuth(
    async (
      _request: NextRequest,
      auth: AuthResult,
      context: { params: Promise<{ id: string; caseId: string }> },
    ) => {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const { id, caseId } = await context.params
      if (!isValidUuid(id) || !isValidUuid(caseId)) {
        return NextResponse.json(
          { error: 'Invalid suite or case ID format' },
          { status: 400 },
        )
      }

      try {
        const ownsSuite = await ensureOwnedSuite(projectId, id)
        if (!ownsSuite) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const existingResult = await getPool().query(
          'SELECT id FROM cases WHERE id = $1 AND suite_id = $2',
          [caseId, id],
        )

        if (existingResult.rows.length === 0) {
          return NextResponse.json(
            { error: 'Case not found' },
            { status: 404 },
          )
        }

        await getPool().query('DELETE FROM cases WHERE id = $1 AND suite_id = $2', [
          caseId,
          id,
        ])

        return new NextResponse(null, { status: 204 })
      } catch (error) {
        logger.error({ err: error }, 'Error deleting suite case')

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
          { error: 'Failed to delete suite case', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
