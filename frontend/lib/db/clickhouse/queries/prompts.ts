/**
 * Prompt Queries
 *
 * Centralized query module for prompt management operations.
 * Wraps the raw ClickHouse functions with caching and write invalidation.
 */

import {
  getLatestPromptVersion,
  getPromptById,
  getPromptByName,
  getPromptVersionHistory,
  insertPrompt,
  listPrompts,
  type PromptRecord,
} from '../../../clickhouse'
import {
  type BaseQueryParams,
  executeQuery,
  invalidateOnWrite,
  type PaginationParams,
  type QueryResult,
} from '../query-builder'

// =============================================================================
// Read Operations (cached)
// =============================================================================

/** Get a prompt by its UUID */
export async function getById(
  projectId: string,
  promptId: string,
): Promise<QueryResult<PromptRecord | null>> {
  return executeQuery(
    'prompts.getById',
    { projectId, promptId },
    () => getPromptById(projectId, promptId),
    60_000, // 1 min cache - prompts change infrequently
  )
}

/** Get a prompt by name, optionally at a specific version */
export async function getByName(
  projectId: string,
  name: string,
  version?: number,
): Promise<QueryResult<PromptRecord | null>> {
  return executeQuery(
    'prompts.getByName',
    { projectId, name, version },
    () => getPromptByName(projectId, name, version),
    60_000,
  )
}

/** List prompts with optional filters */
export async function list(
  params: BaseQueryParams &
    PaginationParams & {
      tags?: string[]
      isProduction?: boolean
    },
): Promise<QueryResult<PromptRecord[]>> {
  return executeQuery(
    'prompts.list',
    params,
    () =>
      listPrompts({
        projectId: params.projectId,
        tags: params.tags,
        isProduction: params.isProduction,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      }),
    30_000,
  )
}

/** Get version history for a prompt */
export async function getVersionHistory(
  projectId: string,
  name: string,
  limit = 20,
): Promise<QueryResult<PromptRecord[]>> {
  return executeQuery(
    'prompts.versionHistory',
    { projectId, name, limit },
    () => getPromptVersionHistory(projectId, name, limit),
    60_000,
  )
}

/** Get the latest version number for a prompt */
export async function getLatestVersion(
  projectId: string,
  name: string,
): Promise<QueryResult<number>> {
  return executeQuery(
    'prompts.latestVersion',
    { projectId, name },
    () => getLatestPromptVersion(projectId, name),
    15_000, // shorter cache for version checks before writes
  )
}

// =============================================================================
// Write Operations (with cache invalidation)
// =============================================================================

/** Insert a prompt and invalidate related caches */
export async function insert(prompt: PromptRecord): Promise<void> {
  await insertPrompt(prompt)
  invalidateOnWrite('prompts')
}
