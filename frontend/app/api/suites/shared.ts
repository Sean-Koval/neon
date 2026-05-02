import { Pool } from 'pg'
import { logger } from '@/lib/logger'
import type { EvalCase, EvalCaseCreate, EvalSuite, ScorerType } from '@/lib/types'

let pool: Pool | null = null

export function getPool(): Pool {
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
      logger.error({ err }, 'PostgreSQL pool error in suites routes')
    })
  }

  return pool
}

export function isConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('ECONNREFUSED') ||
      error.message.includes('connect') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('does not exist'))
  )
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function mapRowToCase(row: Record<string, unknown>): EvalCase {
  const expected = asRecord(row.expected)
  const config = asRecord(row.config)
  const scorerConfig = config.scorer_config

  return {
    id: row.id as string,
    suite_id: row.suite_id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    input: asRecord(row.input),
    expected_tools: asStringArray(expected.expected_tools),
    expected_tool_sequence: asStringArray(expected.expected_tool_sequence),
    expected_output_contains: asStringArray(expected.expected_output_contains),
    expected_output_pattern:
      typeof expected.expected_output_pattern === 'string'
        ? expected.expected_output_pattern
        : null,
    scorers: asStringArray(row.scorers) as ScorerType[],
    scorer_config:
      scorerConfig && typeof scorerConfig === 'object' && !Array.isArray(scorerConfig)
        ? (scorerConfig as Record<string, unknown>)
        : null,
    min_score:
      typeof config.min_score === 'number'
        ? config.min_score
        : typeof config.min_score === 'string'
          ? Number(config.min_score)
          : 0.7,
    tags: asStringArray(config.tags),
    timeout_seconds:
      typeof config.timeout_seconds === 'number'
        ? config.timeout_seconds
        : typeof config.timeout_seconds === 'string'
          ? Number(config.timeout_seconds)
          : 300,
    created_at: row.created_at
      ? new Date(row.created_at as string).toISOString()
      : new Date().toISOString(),
    updated_at: row.updated_at
      ? new Date(row.updated_at as string).toISOString()
      : new Date().toISOString(),
  }
}

export function mapRowToSuite(
  row: Record<string, unknown>,
  cases: EvalCase[] = [],
): EvalSuite {
  const config = asRecord(row.config)

  return {
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    agent_id: (row.agent_module_path as string) || '',
    default_scorers: asStringArray(config.default_scorers) as ScorerType[],
    default_min_score:
      typeof config.default_min_score === 'number'
        ? config.default_min_score
        : typeof config.default_min_score === 'string'
          ? Number(config.default_min_score)
          : 0.7,
    default_timeout_seconds:
      typeof config.default_timeout_seconds === 'number'
        ? config.default_timeout_seconds
        : typeof config.default_timeout_seconds === 'string'
          ? Number(config.default_timeout_seconds)
          : 300,
    parallel: Boolean(config.parallel),
    stop_on_failure: Boolean(config.stop_on_failure),
    cases,
    created_at: row.created_at
      ? new Date(row.created_at as string).toISOString()
      : new Date().toISOString(),
    updated_at: row.updated_at
      ? new Date(row.updated_at as string).toISOString()
      : new Date().toISOString(),
  }
}

export async function loadCases(
  db: Pick<Pool, 'query'>,
  suiteId: string,
): Promise<EvalCase[]> {
  const result = await db.query(
    'SELECT * FROM cases WHERE suite_id = $1 ORDER BY created_at ASC',
    [suiteId],
  )

  return result.rows.map((row) => mapRowToCase(row as Record<string, unknown>))
}

export function buildSuiteConfig(data: {
  default_scorers?: string[]
  default_min_score?: number
  default_timeout_seconds?: number
  parallel?: boolean
  stop_on_failure?: boolean
  default_config?: Record<string, unknown>
}): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (data.default_scorers) config.default_scorers = data.default_scorers
  if (data.default_min_score !== undefined) {
    config.default_min_score = data.default_min_score
  }
  if (data.default_timeout_seconds !== undefined) {
    config.default_timeout_seconds = data.default_timeout_seconds
  }
  if (data.parallel !== undefined) config.parallel = data.parallel
  if (data.stop_on_failure !== undefined) {
    config.stop_on_failure = data.stop_on_failure
  }
  if (data.default_config) config.default_config = data.default_config

  return config
}

export function buildCaseExpected(data: Partial<EvalCaseCreate>): Record<string, unknown> {
  const expected: Record<string, unknown> = {}

  if (data.expected_tools?.length) expected.expected_tools = data.expected_tools
  if (data.expected_tool_sequence?.length) {
    expected.expected_tool_sequence = data.expected_tool_sequence
  }
  if (data.expected_output_contains?.length) {
    expected.expected_output_contains = data.expected_output_contains
  }
  if (data.expected_output_pattern) {
    expected.expected_output_pattern = data.expected_output_pattern
  }

  return expected
}

export function buildCaseConfig(data: Partial<EvalCaseCreate>): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (data.scorer_config) config.scorer_config = data.scorer_config
  if (data.min_score !== undefined) config.min_score = data.min_score
  if (data.tags) config.tags = data.tags
  if (data.timeout_seconds !== undefined) {
    config.timeout_seconds = data.timeout_seconds
  }

  return config
}
