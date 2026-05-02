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
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import type { EvalCase, EvalSuite, EvalSuiteList } from '@/lib/types'
import { validateBody } from '@/lib/validation/middleware'
import { createSuiteSchema } from '@/lib/validation/schemas'
import {
  buildCaseConfig,
  buildCaseExpected,
  buildSuiteConfig,
  getPool,
  isConnectionError,
  mapRowToCase,
  mapRowToSuite,
} from '@/app/api/suites/shared'

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

      const suites: EvalSuite[] = result.rows.map((row) =>
        mapRowToSuite(row as Record<string, unknown>),
      )

      const response: EvalSuiteList = {
        items: suites,
        total,
      }

      return NextResponse.json(response)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching suites')

      if (isConnectionError(error)) {
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

      const config = buildSuiteConfig(data)
      const createdCases: EvalCase[] = []

      await pool.query('BEGIN')

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

      const suiteRow = result.rows[0] as Record<string, unknown>

      for (const testCase of data.cases ?? []) {
        const caseResult = await pool.query(
          `INSERT INTO cases (suite_id, name, description, input, expected, scorers, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            suiteRow.id,
            testCase.name,
            testCase.description || null,
            JSON.stringify(testCase.input),
            JSON.stringify(buildCaseExpected(testCase)),
            JSON.stringify(testCase.scorers),
            JSON.stringify(buildCaseConfig(testCase)),
          ],
        )

        createdCases.push(
          mapRowToCase(caseResult.rows[0] as Record<string, unknown>),
        )
      }

      await pool.query('COMMIT')

      const suite = mapRowToSuite(suiteRow, createdCases)

      return NextResponse.json(suite, { status: 201 })
    } catch (error) {
      try {
        await getPool().query('ROLLBACK')
      } catch {
        // Ignore rollback failures after a create error.
      }

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
