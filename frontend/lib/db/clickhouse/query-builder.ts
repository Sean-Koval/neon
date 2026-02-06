/**
 * ClickHouse Query Builder
 *
 * Type-safe query builder abstraction for ClickHouse operations.
 * Centralizes connection management, provides built-in caching,
 * and standardizes error handling.
 *
 * All ClickHouse queries should go through this layer instead of
 * calling getClickHouseClient() directly in route handlers.
 */

import { getClickHouseClient } from '../../clickhouse'

// =============================================================================
// Types
// =============================================================================

/** Standard query parameters that most queries need */
export interface BaseQueryParams {
  projectId: string
  startDate?: string
  endDate?: string
}

/** Pagination parameters */
export interface PaginationParams {
  limit?: number
  offset?: number
}

/** Query result with timing metadata */
export interface QueryResult<T> {
  data: T
  queryTimeMs: number
}

/** Cache entry with TTL */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

// =============================================================================
// In-Memory Cache
// =============================================================================

const cache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL_MS = 30_000 // 30 seconds
const MAX_CACHE_SIZE = 500

/**
 * Generate a cache key from query parameters.
 */
function makeCacheKey(prefix: string, params: object): string {
  const sorted = Object.entries(params as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&')
  return `${prefix}:${sorted}`
}

/**
 * Get a cached value if it exists and hasn't expired.
 */
function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return undefined

  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }

  return entry.data
}

/**
 * Store a value in the cache with TTL.
 */
function setCache<T>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  // Evict oldest entries if cache is too large
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }

  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  })
}

/**
 * Invalidate cache entries matching a prefix.
 */
export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear()
}

// =============================================================================
// Query Execution
// =============================================================================

/**
 * Execute a ClickHouse query with timing, caching, and error handling.
 *
 * @param cacheKey - Cache key prefix (pass null to skip caching)
 * @param params - Query parameters (used for cache key generation)
 * @param queryFn - The actual query function to execute
 * @param ttlMs - Cache TTL in milliseconds (default: 30s)
 */
export async function executeQuery<T>(
  cacheKey: string | null,
  params: object,
  queryFn: () => Promise<T>,
  ttlMs?: number,
): Promise<QueryResult<T>> {
  // Check cache first
  if (cacheKey) {
    const key = makeCacheKey(cacheKey, params)
    const cached = getCached<T>(key)
    if (cached !== undefined) {
      return { data: cached, queryTimeMs: 0 }
    }
  }

  const start = performance.now()

  try {
    const data = await queryFn()
    const queryTimeMs = Math.round(performance.now() - start)

    // Cache the result
    if (cacheKey) {
      const key = makeCacheKey(cacheKey, params)
      setCache(key, data, ttlMs)
    }

    return { data, queryTimeMs }
  } catch (error) {
    const elapsed = Math.round(performance.now() - start)
    console.error(
      `Query failed after ${elapsed}ms [${cacheKey || 'uncached'}]:`,
      error,
    )
    throw error
  }
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Build a WHERE clause from conditions.
 */
export function buildWhereClause(conditions: string[]): string {
  if (conditions.length === 0) return ''
  return `WHERE ${conditions.join(' AND ')}`
}

/**
 * Add standard date range conditions to a conditions array.
 */
export function addDateRangeConditions(
  conditions: string[],
  opts: { startDate?: string; endDate?: string; dateColumn?: string },
): void {
  const col = opts.dateColumn || 'timestamp'
  if (opts.startDate) {
    conditions.push(`${col} >= {startDate:Date}`)
  }
  if (opts.endDate) {
    conditions.push(`${col} <= {endDate:Date} + INTERVAL 1 DAY`)
  }
}

/**
 * Get the ClickHouse client (re-export for convenience).
 */
export { getClickHouseClient } from '../../clickhouse'

// =============================================================================
// Re-export types from clickhouse.ts for backward compatibility
// =============================================================================

export type {
  DailyRunSummary,
  DashboardSummary,
  DurationStats,
  PromptRecord,
  ScoreRecord,
  ScorerStats,
  ScoreTrendPoint,
  SpanDetails,
  SpanRecord,
  SpanSummary,
  ToolMetric,
  ToolMetricsSummary,
  TraceRecord,
} from '../../clickhouse'
