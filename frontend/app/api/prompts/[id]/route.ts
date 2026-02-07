/**
 * Prompt by ID API
 *
 * GET /api/prompts/[id] - Get a prompt by ID or name
 * PATCH /api/prompts/[id] - Update a prompt (creates new version)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  getLatestPromptVersion,
  getPromptById,
  getPromptByName,
  getPromptVersionHistory,
  insertPrompt,
  type PromptRecord,
} from '@/lib/clickhouse'
import type { Prompt, PromptUpdate, PromptVersionEntry } from '@/lib/types'
import { updatePromptSchema } from '@/lib/validation/schemas'
import { validateBody } from '@/lib/validation/middleware'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { WRITE_LIMIT, READ_LIMIT } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

interface RouteParams {
  params: Promise<{ id: string }>
}

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
 * GET /api/prompts/[id]
 *
 * Get a prompt by ID or name.
 *
 * Query params:
 * - projectId: Project ID (default: 'default')
 * - version: Specific version number (optional)
 * - history: If 'true', return version history instead of single prompt
 */
export const GET = withRateLimit(async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId') || 'default'
    const versionParam = searchParams.get('version')
    const historyParam = searchParams.get('history')

    // If history is requested, return version history
    if (historyParam === 'true') {
      const records = await getPromptVersionHistory(projectId, id)
      if (records.length === 0) {
        return NextResponse.json(
          { error: `Prompt "${id}" not found` },
          { status: 404 },
        )
      }

      const history: PromptVersionEntry[] = records.map((r) => ({
        id: r.prompt_id,
        version: r.version,
        commit_message: r.commit_message || undefined,
        created_by: r.created_by || undefined,
        created_at: r.created_at,
      }))

      return NextResponse.json({ items: history, name: id })
    }

    // Check if ID is a UUID (prompt_id) or a name
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    let record: PromptRecord | null
    if (isUuid) {
      record = await getPromptById(projectId, id)
    } else {
      const version = versionParam ? parseInt(versionParam, 10) : undefined
      record = await getPromptByName(projectId, id, version)
    }

    if (!record) {
      return NextResponse.json(
        { error: `Prompt "${id}" not found` },
        { status: 404 },
      )
    }

    return NextResponse.json(transformPrompt(record))
  } catch (error) {
    logger.error({ err: error }, 'Error getting prompt')

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
      { error: 'Failed to get prompt', details: String(error) },
      { status: 500 },
    )
  }
}, READ_LIMIT)

/**
 * PATCH /api/prompts/[id]
 *
 * Update a prompt (creates a new version).
 *
 * Request body:
 * {
 *   description?: string;
 *   template?: string;
 *   messages?: PromptMessage[];
 *   variables?: PromptVariable[];
 *   config?: PromptConfig;
 *   tags?: string[];
 *   is_production?: boolean;
 *   commit_message?: string;
 * }
 */
export const PATCH = withRateLimit(async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const rawBody = await request.json()

    // Validate request body
    const validation = validateBody(updatePromptSchema, rawBody)
    if (!validation.success) return validation.response
    const body = validation.data
    const projectId = body.projectId || 'default'

    // Get existing prompt
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    let existing: PromptRecord | null
    if (isUuid) {
      existing = await getPromptById(projectId, id)
    } else {
      existing = await getPromptByName(projectId, id)
    }

    if (!existing) {
      return NextResponse.json(
        { error: `Prompt "${id}" not found` },
        { status: 404 },
      )
    }

    // Get next version number
    const newVersion =
      (await getLatestPromptVersion(projectId, existing.name)) + 1
    const now = new Date().toISOString()

    // Create new version with updates
    const newPromptId = uuidv4()
    const record: PromptRecord = {
      project_id: projectId,
      prompt_id: newPromptId,
      name: existing.name,
      description: body.description ?? existing.description,
      type: existing.type,
      template: body.template !== undefined ? body.template : existing.template,
      messages:
        body.messages !== undefined
          ? JSON.stringify(body.messages)
          : existing.messages,
      variables:
        body.variables !== undefined
          ? JSON.stringify(body.variables)
          : existing.variables,
      config:
        body.config !== undefined
          ? JSON.stringify(body.config)
          : existing.config,
      tags: body.tags ?? existing.tags,
      is_production:
        body.is_production !== undefined
          ? body.is_production
            ? 1
            : 0
          : existing.is_production,
      version: newVersion,
      commit_message: body.commit_message || `Version ${newVersion}`,
      created_by: '',
      created_at: now,
      updated_at: now,
      parent_version_id: existing.prompt_id,
      variant: existing.variant,
    }

    await insertPrompt(record)

    return NextResponse.json(transformPrompt(record))
  } catch (error) {
    logger.error({ err: error }, 'Error updating prompt')

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
      { error: 'Failed to update prompt', details: String(error) },
      { status: 500 },
    )
  }
}, WRITE_LIMIT)
