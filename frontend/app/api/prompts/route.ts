/**
 * Prompts API
 *
 * GET /api/prompts - List prompts
 * POST /api/prompts - Create a new prompt
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  getLatestPromptVersion,
  insertPrompt,
  listPrompts,
  type PromptRecord,
} from '@/lib/clickhouse'
import type { Prompt, PromptCreate, PromptList } from '@/lib/types'

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
export async function GET(request: NextRequest) {
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

    const records = await listPrompts({
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
    console.error('Error listing prompts:', error)

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
}

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
export async function POST(request: NextRequest) {
  try {
    const body: PromptCreate & { projectId?: string } = await request.json()
    const projectId = body.projectId || 'default'

    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.type || !['text', 'chat'].includes(body.type)) {
      return NextResponse.json(
        { error: 'type must be "text" or "chat"' },
        { status: 400 },
      )
    }
    if (body.type === 'text' && !body.template) {
      return NextResponse.json(
        { error: 'template is required for text prompts' },
        { status: 400 },
      )
    }
    if (
      body.type === 'chat' &&
      (!body.messages || body.messages.length === 0)
    ) {
      return NextResponse.json(
        { error: 'messages are required for chat prompts' },
        { status: 400 },
      )
    }

    // Check if prompt with this name already exists and get next version
    const existingVersion = await getLatestPromptVersion(projectId, body.name)
    const version = existingVersion + 1
    const now = new Date().toISOString()

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

    await insertPrompt(record)

    return NextResponse.json(transformPrompt(record), { status: 201 })
  } catch (error) {
    console.error('Error creating prompt:', error)

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
}
