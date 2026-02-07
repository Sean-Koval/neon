/**
 * Individual Eval Suite API
 *
 * GET /api/suites/:id - Get a single evaluation suite
 * PATCH /api/suites/:id - Update an evaluation suite
 * DELETE /api/suites/:id - Delete an evaluation suite
 */

import { type NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import type { EvalSuite, ScorerType } from '@/lib/types'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'
import { updateSuiteSchema } from '@/lib/validation/schemas'
import { validateBody } from '@/lib/validation/middleware'
import { withRateLimit } from '@/lib/middleware/rate-limit'

// Connection pool (shared with main suites route via process-level singleton)
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/neon'

    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    pool.on('error', (err: Error) => {
      console.error('PostgreSQL pool error in suites/[id] route:', err)
    })
  }
  return pool
}

/**
 * Map database row to EvalSuite type
 */
function mapRowToSuite(row: Record<string, unknown>): EvalSuite {
  const config = (row.config as Record<string, unknown>) || {}

  return {
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    agent_id: (row.agent_module_path as string) || '',
    default_scorers: ((config.default_scorers as string[]) || []) as ScorerType[],
    default_min_score: (config.default_min_score as number) ?? 0.7,
    default_timeout_seconds: (config.default_timeout_seconds as number) ?? 300,
    parallel: (config.parallel as boolean) ?? false,
    stop_on_failure: (config.stop_on_failure as boolean) ?? false,
    cases: [], // Cases are loaded separately via /api/suites/:id/cases
    created_at: row.created_at
      ? new Date(row.created_at as string).toISOString()
      : new Date().toISOString(),
    updated_at: row.updated_at
      ? new Date(row.updated_at as string).toISOString()
      : new Date().toISOString(),
  }
}

/**
 * Check if error is a connection error for graceful degradation
 */
function isConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('ECONNREFUSED') ||
      error.message.includes('connect') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('does not exist'))
  )
}

/**
 * GET /api/suites/:id
 *
 * Get a single evaluation suite by ID.
 * Verifies ownership against authenticated workspace.
 */
export const GET = withRateLimit(withAuth(
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

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid suite ID format' },
        { status: 400 },
      )
    }

    try {
      const pool = getPool()
      const result = await pool.query('SELECT * FROM suites WHERE id = $1', [id])

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      // Verify ownership - return 404 to prevent enumeration
      if (result.rows[0].project_id !== projectId) {
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      const suite = mapRowToSuite(result.rows[0])
      return NextResponse.json(suite)
    } catch (error) {
      console.error('Error fetching suite:', error)

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
))

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
export const PATCH = withRateLimit(withAuth(
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

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
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
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      // Verify ownership - return 404 to prevent enumeration
      if (currentResult.rows[0].project_id !== projectId) {
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      const currentRow = currentResult.rows[0]
      const currentConfig = (currentRow.config as Record<string, unknown>) || {}

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

      // Merge config fields
      const newConfig = { ...currentConfig }
      if (body.default_scorers !== undefined) {
        newConfig.default_scorers = body.default_scorers
      }
      if (body.default_min_score !== undefined) {
        newConfig.default_min_score = body.default_min_score
      }
      if (body.default_timeout_seconds !== undefined) {
        newConfig.default_timeout_seconds = body.default_timeout_seconds
      }
      if (body.default_config !== undefined) {
        newConfig.default_config = body.default_config
      }

      // Always update config if any config fields changed
      if (
        body.default_scorers !== undefined ||
        body.default_min_score !== undefined ||
        body.default_timeout_seconds !== undefined ||
        body.default_config !== undefined
      ) {
        updates.push(`config = $${paramIndex++}`)
        params.push(JSON.stringify(newConfig))
      }

      // Always update updated_at
      updates.push(`updated_at = NOW()`)

      if (updates.length === 1) {
        // Only updated_at, no actual changes
        return NextResponse.json(mapRowToSuite(currentRow))
      }

      params.push(id)
      const updateQuery = `
      UPDATE suites
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

      const result = await pool.query(updateQuery, params)
      const suite = mapRowToSuite(result.rows[0])

      return NextResponse.json(suite)
    } catch (error) {
      console.error('Error updating suite:', error)

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
))

/**
 * DELETE /api/suites/:id
 *
 * Delete an evaluation suite and all associated cases.
 * Verifies ownership against authenticated workspace.
 */
export const DELETE = withRateLimit(withAuth(
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

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
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
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      // Verify ownership - return 404 to prevent enumeration
      if (existsResult.rows[0].project_id !== projectId) {
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      // Delete suite (cases will cascade due to ON DELETE CASCADE)
      await pool.query('DELETE FROM suites WHERE id = $1', [id])

      return new NextResponse(null, { status: 204 })
    } catch (error) {
      console.error('Error deleting suite:', error)

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
))
