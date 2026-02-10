/**
 * Prompts API
 *
 * GET /api/prompts - List prompts
 * POST /api/prompts - Create a new prompt
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { type PromptRecord, prompts } from '@/lib/db/clickhouse'
import { logger } from '@/lib/logger'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { READ_LIMIT, WRITE_LIMIT } from '@/lib/rate-limit'
import type { Prompt, PromptList } from '@/lib/types'
import { validateBody } from '@/lib/validation/middleware'
import { createPromptSchema } from '@/lib/validation/schemas'

/**
 * Transform ClickHouse record to API response
 */
function transformPrompt(record: PromptRecord): Prompt {
  return {
    id: record.prompt_id,
    project_id: record.project_id,
    name: record.name,
    description: record.description || undefined,
    type: record.type,
    template: record.template || undefined,
    messages: record.messages ? JSON.parse(record.messages) : undefined,
    variables: record.variables ? JSON.parse(record.variables) : undefined,
    config: record.config ? JSON.parse(record.config) : undefined,
    tags: record.tags || [],
    is_production: record.is_production === 1,
    version: record.version,
    commit_message: record.commit_message || undefined,
    created_by: record.created_by || undefined,
    created_at: record.created_at,
    updated_at: record.updated_at,
    parent_version_id: record.parent_version_id || undefined,
    variant: record.variant || undefined,
  }
}

/**
 * GET /api/prompts
 *
 * List prompts with optional filters.
 *
 * Query params:
 * - projectId: Project ID (default: 'default')
 * - tags: Comma-separated tags
 * - isProduction: Filter by production status ('true' or 'false')
 * - limit: Number of results (default: 50)
 * - offset: Offset for pagination (default: 0)
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId') || 'default'
    const tagsParam = searchParams.get('tags')
    const isProductionParam = searchParams.get('isProduction')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const tags = tagsParam ? tagsParam.split(',') : undefined
    const isProduction =
      isProductionParam === 'true'
        ? true
        : isProductionParam === 'false'
          ? false
          : undefined

    const { data: records } = await prompts.list({
      projectId,
      tags,
      isProduction,
      limit,
      offset,
    })

    const response: PromptList = {
      items: records.map(transformPrompt),
      total: records.length,
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error({ err: error }, 'Error listing prompts')

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          error: 'ClickHouse service unavailable',
          details: 'The database is not reachable.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to list prompts', details: String(error) },
      { status: 500 },
    )
  }
}, READ_LIMIT)

/**
 * POST /api/prompts
 *
 * Create a new prompt (version 1).
 *
 * Request body:
 * {
 *   name: string;
 *   description?: string;
 *   type: 'text' | 'chat';
 *   template?: string;
 *   messages?: PromptMessage[];
 *   variables?: PromptVariable[];
 *   config?: PromptConfig;
 *   tags?: string[];
 *   is_production?: boolean;
 *   commit_message?: string;
 * }
 */
export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate request body
    const validation = validateBody(createPromptSchema, rawBody)
    if (!validation.success) return validation.response
    const body = validation.data
    const projectId = body.projectId || 'default'

    // Check if prompt with this name already exists and get next version
    const { data: existingVersion } = await prompts.getLatestVersion(
      projectId,
      body.name,
    )
    const version = existingVersion + 1
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '')

    const promptId = uuidv4()
    const record: PromptRecord = {
      project_id: projectId,
      prompt_id: promptId,
      name: body.name,
      description: body.description || '',
      type: body.type,
      template: body.template || '',
      messages: body.messages ? JSON.stringify(body.messages) : '',
      variables: body.variables ? JSON.stringify(body.variables) : '',
      config: body.config ? JSON.stringify(body.config) : '',
      tags: body.tags || [],
      is_production: body.is_production ? 1 : 0,
      version,
      commit_message: body.commit_message || `Version ${version}`,
      created_by: '',
      created_at: now,
      updated_at: now,
      parent_version_id: '',
      variant: 'control',
    }

    await prompts.insert(record)

    return NextResponse.json(transformPrompt(record), { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'Error creating prompt')

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          error: 'ClickHouse service unavailable',
          details: 'The database is not reachable.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to create prompt', details: String(error) },
      { status: 500 },
    )
  }
}, WRITE_LIMIT)
