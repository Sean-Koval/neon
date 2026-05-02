/**
 * Individual Eval Suite API
 *
 * GET /api/suites/:id - Get a single evaluation suite
 * PATCH /api/suites/:id - Update an evaluation suite
 * DELETE /api/suites/:id - Delete an evaluation suite
 */

import { type NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import type { EvalSuite } from '@/lib/types'
import { validateBody } from '@/lib/validation/middleware'
import { updateSuiteSchema } from '@/lib/validation/schemas'
import {
  buildSuiteConfig,
  getPool,
  isConnectionError,
  isValidUuid,
  loadCases,
  mapRowToSuite,
} from '@/app/api/suites/shared'

/**
 * GET /api/suites/:id
 *
 * Get a single evaluation suite by ID.
 * Verifies ownership against authenticated workspace.
 */
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
        const pool = getPool()
        const result = await pool.query('SELECT * FROM suites WHERE id = $1', [
          id,
        ])

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        // Verify ownership - return 404 to prevent enumeration
        if (result.rows[0].project_id !== projectId) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const cases = await loadCases(pool, id)
        const suite = mapRowToSuite(result.rows[0], cases)
        return NextResponse.json(suite)
      } catch (error) {
        logger.error({ err: error }, 'Error fetching suite')

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
          { error: 'Failed to fetch suite', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

/**
 * PATCH /api/suites/:id
 *
 * Update an existing evaluation suite.
 * Verifies ownership against authenticated workspace.
 *
 * Request body (all fields optional):
 * {
 *   name?: string;
 *   description?: string | null;
 *   agent_id?: string;
 *   default_scorers?: string[];
 *   default_min_score?: number;
 *   default_timeout_seconds?: number;
 *   default_config?: object;
 * }
 */
export const PATCH = withRateLimit(
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
        const body = await request.json()

        // Validate request body
        const validation = validateBody(updateSuiteSchema, body)
        if (!validation.success) return validation.response

        const pool = getPool()

        // First, fetch current suite to merge config
        const currentResult = await pool.query(
          'SELECT * FROM suites WHERE id = $1',
          [id],
        )

        if (currentResult.rows.length === 0) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        // Verify ownership - return 404 to prevent enumeration
        if (currentResult.rows[0].project_id !== projectId) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        const currentRow = currentResult.rows[0]
        const currentConfig =
          (currentRow.config as Record<string, unknown>) || {}

        // Build update fields
        const updates: string[] = []
        const params: unknown[] = []
        let paramIndex = 1

        if (body.name !== undefined) {
          updates.push(`name = $${paramIndex++}`)
          params.push(body.name)
        }

        if (body.description !== undefined) {
          updates.push(`description = $${paramIndex++}`)
          params.push(body.description)
        }

        if (body.agent_id !== undefined) {
          updates.push(`agent_module_path = $${paramIndex++}`)
          params.push(body.agent_id)
        }

        const configUpdates = buildSuiteConfig(body)
        const newConfig = { ...currentConfig, ...configUpdates }

        // Always update config if any config fields changed
        if (
          body.default_scorers !== undefined ||
          body.default_min_score !== undefined ||
          body.default_timeout_seconds !== undefined ||
          body.default_config !== undefined ||
          body.parallel !== undefined ||
          body.stop_on_failure !== undefined
        ) {
          updates.push(`config = $${paramIndex++}`)
          params.push(JSON.stringify(newConfig))
        }

        // Always update updated_at
        updates.push(`updated_at = NOW()`)

        if (updates.length === 1) {
          // Only updated_at, no actual changes
          const cases = await loadCases(pool, id)
          return NextResponse.json(mapRowToSuite(currentRow, cases))
        }

        params.push(id)
        const updateQuery = `
      UPDATE suites
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

        const result = await pool.query(updateQuery, params)
        const cases = await loadCases(pool, id)
        const suite = mapRowToSuite(result.rows[0], cases)

        return NextResponse.json(suite)
      } catch (error) {
        logger.error({ err: error }, 'Error updating suite')

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
          { error: 'Failed to update suite', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)

/**
 * DELETE /api/suites/:id
 *
 * Delete an evaluation suite and all associated cases.
 * Verifies ownership against authenticated workspace.
 */
export const DELETE = withRateLimit(
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
        const pool = getPool()

        // Check if suite exists
        const existsResult = await pool.query(
          'SELECT id, project_id FROM suites WHERE id = $1',
          [id],
        )

        if (existsResult.rows.length === 0) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        // Verify ownership - return 404 to prevent enumeration
        if (existsResult.rows[0].project_id !== projectId) {
          return NextResponse.json(
            { error: 'Suite not found' },
            { status: 404 },
          )
        }

        // Delete suite (cases will cascade due to ON DELETE CASCADE)
        await pool.query('DELETE FROM suites WHERE id = $1', [id])

        return new NextResponse(null, { status: 204 })
      } catch (error) {
        logger.error({ err: error }, 'Error deleting suite')

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
          { error: 'Failed to delete suite', details: String(error) },
          { status: 500 },
        )
      }
    },
  ),
)
