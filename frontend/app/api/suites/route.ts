/**
 * Eval Suites API
 *
 * GET /api/suites - List all evaluation suites
 * POST /api/suites - Create a new evaluation suite
 *
 * Suites are stored in PostgreSQL (created by postgres-init.sql).
 * This route provides CRUD operations with graceful degradation
 * when the database isn't available.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import type { EvalSuite, EvalSuiteList, ScorerType } from '@/lib/types'
import { validateBody } from '@/lib/validation/middleware'
import { createSuiteSchema } from '@/lib/validation/schemas'

// Create a connection pool for raw queries
// (suites table is in postgres-init.sql, not Drizzle schema)
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
      logger.error({ err }, 'PostgreSQL pool error in suites route')
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
    default_scorers: ((config.default_scorers as string[]) ||
      []) as ScorerType[],
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
 * GET /api/suites
 *
 * List all evaluation suites for the authenticated workspace.
 *
 * Query params:
 * - limit: Maximum results (default 100)
 * - offset: Pagination offset (default 0)
 */
export const GET = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    const projectId = auth.workspaceId
    if (!projectId) {
      return NextResponse.json(
        { error: 'Workspace context required' },
        { status: 400 },
      )
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '100', 10),
      1000,
    )
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    try {
      const pool = getPool()

      // Always filter by authenticated workspace
      const query =
        'SELECT * FROM suites WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
      const params = [projectId, limit, offset]

      const result = await pool.query(query, params)

      // Get total count for pagination
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM suites WHERE project_id = $1',
        [projectId],
      )
      const total = parseInt(countResult.rows[0]?.count || '0', 10)

      const suites: EvalSuite[] = result.rows.map(mapRowToSuite)

      const response: EvalSuiteList = {
        items: suites,
        total,
      }

      return NextResponse.json(response)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching suites')

      // Graceful degradation - return empty list if database isn't available
      const isConnectionError =
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
          error.message.includes('connect') ||
          error.message.includes('timeout') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('does not exist'))

      if (isConnectionError) {
        return NextResponse.json({
          items: [],
          total: 0,
          warning:
            'Database not available or suites table not created. Run postgres-init.sql to set up.',
        } satisfies EvalSuiteList & { warning: string })
      }

      return NextResponse.json(
        { error: 'Failed to fetch suites', details: String(error) },
        { status: 500 },
      )
    }
  }),
)

/**
 * POST /api/suites
 *
 * Create a new evaluation suite.
 *
 * Request body:
 * {
 *   name: string;
 *   description?: string;
 *   agent_id?: string;
 *   default_scorers?: string[];
 *   default_min_score?: number;
 *   default_timeout_seconds?: number;
 *   default_config?: object;
 * }
 */
export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const body = await request.json()

      // Validate request body
      const validation = validateBody(createSuiteSchema, body)
      if (!validation.success) return validation.response
      const data = validation.data

      // Validate that project_id matches auth workspace if provided
      if (data.project_id && data.project_id !== projectId) {
        return NextResponse.json(
          { error: 'project_id does not match authenticated workspace' },
          { status: 403 },
        )
      }

      const pool = getPool()

      // Build config object from optional fields
      const config: Record<string, unknown> = {}
      if (data.default_scorers) config.default_scorers = data.default_scorers
      if (data.default_min_score !== undefined)
        config.default_min_score = data.default_min_score
      if (data.default_timeout_seconds !== undefined)
        config.default_timeout_seconds = data.default_timeout_seconds
      if (data.default_config) config.default_config = data.default_config

      // Always use auth workspace as project_id
      const result = await pool.query(
        `INSERT INTO suites (project_id, name, description, agent_module_path, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
        [
          projectId,
          data.name,
          data.description || null,
          data.agent_id || null,
          JSON.stringify(config),
        ],
      )

      const suite = mapRowToSuite(result.rows[0])

      return NextResponse.json(suite, { status: 201 })
    } catch (error) {
      logger.error({ err: error }, 'Error creating suite')

      // Check for foreign key violation (invalid project_id)
      if (
        error instanceof Error &&
        error.message.includes('violates foreign key constraint')
      ) {
        return NextResponse.json(
          { error: 'Invalid project_id - project does not exist' },
          { status: 400 },
        )
      }

      // Graceful degradation for connection errors
      const isConnectionError =
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
          error.message.includes('connect') ||
          error.message.includes('timeout'))

      if (isConnectionError) {
        return NextResponse.json(
          {
            error: 'Database not available',
            details:
              'PostgreSQL is not reachable. Please ensure the database is running.',
          },
          { status: 503 },
        )
      }

      return NextResponse.json(
        { error: 'Failed to create suite', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
