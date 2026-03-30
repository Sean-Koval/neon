import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import {
  getPool,
  isConnectionError,
  isValidUuid,
  loadCases,
  mapRowToSuite,
} from '@/app/api/suites/shared'
import {
  getSuiteExportMetadata,
  renderSuiteExport,
  type SuiteExportFormat,
} from '@/lib/suites/export'
import { logger } from '@/lib/logger'

const SUPPORTED_FORMATS = new Set<SuiteExportFormat>(['typescript', 'python'])

export const GET = withAuth(
  async (request: NextRequest, auth, context) => {
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const suiteId = context?.params?.id as string
    if (!isValidUuid(suiteId)) {
      return NextResponse.json({ error: 'Invalid suite ID format' }, { status: 400 })
    }

    const formatParam = request.nextUrl.searchParams.get('format') ?? 'typescript'
    if (!SUPPORTED_FORMATS.has(formatParam as SuiteExportFormat)) {
      return NextResponse.json(
        { error: 'Invalid export format. Use "typescript" or "python".' },
        { status: 400 },
      )
    }

    try {
      const db = getPool()
      const suiteResult = await db.query(
        'SELECT * FROM suites WHERE id = $1 AND project_id = $2',
        [suiteId, auth.workspaceId],
      )

      if (suiteResult.rows.length === 0) {
        return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
      }

      const cases = await loadCases(db, suiteId)
      const suite = mapRowToSuite(
        suiteResult.rows[0] as Record<string, unknown>,
        cases,
      )

      const format = formatParam as SuiteExportFormat
      const code = renderSuiteExport(suite, format)
      const metadata = getSuiteExportMetadata(suite, format)

      return new NextResponse(code, {
        status: 200,
        headers: {
          'Content-Type': `${metadata.contentType}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="${metadata.filename}"`,
        },
      })
    } catch (error) {
      logger.error({ err: error, suiteId }, 'Error exporting suite')
      if (isConnectionError(error)) {
        return NextResponse.json(
          { error: 'Database unavailable', message: 'Could not connect to PostgreSQL' },
          { status: 503 },
        )
      }

      return NextResponse.json(
        { error: 'Failed to export suite' },
        { status: 500 },
      )
    }
  },
  { optional: false },
)
