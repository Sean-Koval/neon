/**
 * In-Memory Sliding Window Rate Limiter
 *
 * Provides rate limiting for self-hosted deployments without external
 * dependencies (no Redis/Upstash). Uses a sliding window counter
 * approach for accurate limiting.
 *
 * Configurable via environment variables:
 * - RATE_LIMIT_RPM: Requests per minute (default 60)
 * - RATE_LIMIT_BURST: Extra burst capacity (default 10)
 *
 * @module lib/rate-limit
 */

// =============================================================================
// Types
// =============================================================================

export interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean
  /** Remaining requests in current window */
  remaining: number
  /** Unix timestamp (seconds) when the window resets */
  reset: number
  /** Total limit for the window */
  limit: number
}

interface SlidingWindowEntry {
  /** Timestamps of requests within the window */
  timestamps: number[]
  /** Last cleanup time */
  lastCleanup: number
}

// =============================================================================
// Rate Limiter Class
// =============================================================================

class RateLimiter {
  private windows = new Map<string, SlidingWindowEntry>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Auto-cleanup expired entries every 60 seconds to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
    // Allow Node to exit even with the interval running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Check and consume a rate limit token for the given key.
   */
  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now()
    const windowStart = now - config.windowMs

    let entry = this.windows.get(key)
    if (!entry) {
      entry = { timestamps: [], lastCleanup: now }
      this.windows.set(key, entry)
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)
    entry.lastCleanup = now

    const currentCount = entry.timestamps.length
    const reset = Math.ceil((now + config.windowMs) / 1000)

    if (currentCount >= config.limit) {
      return {
        success: false,
        remaining: 0,
        reset,
        limit: config.limit,
      }
    }

    // Record this request
    entry.timestamps.push(now)

    return {
      success: true,
      remaining: config.limit - currentCount - 1,
      reset,
      limit: config.limit,
    }
  }

  /**
   * Remove entries that haven't been accessed in over 5 minutes.
   */
  private cleanup(): void {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, entry] of this.windows) {
      if (entry.lastCleanup < cutoff) {
        this.windows.delete(key)
      }
    }
  }

  /** Destroy the limiter and clear the cleanup interval. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.windows.clear()
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

// Use globalThis to survive hot-reloading in development
const globalForRateLimit = globalThis as unknown as {
  __rateLimiter?: RateLimiter
}

export const rateLimiter =
  globalForRateLimit.__rateLimiter ?? new RateLimiter()

if (process.env.NODE_ENV !== 'production') {
  globalForRateLimit.__rateLimiter = rateLimiter
}

// =============================================================================
// Preset Configurations
// =============================================================================

const RPM = parseInt(process.env.RATE_LIMIT_RPM || '60', 10)
const BURST = parseInt(process.env.RATE_LIMIT_BURST || '10', 10)

/** Read endpoints: higher limit (e.g. GET) */
export const READ_LIMIT: RateLimitConfig = {
  limit: RPM * 2, // 120/min default
  windowMs: 60_000,
}

/** Write endpoints: standard limit (e.g. POST/PUT/PATCH) */
export const WRITE_LIMIT: RateLimitConfig = {
  limit: Math.ceil(RPM / 2), // 30/min default
  windowMs: 60_000,
}

/** Batch endpoints: strictest limit */
export const BATCH_LIMIT: RateLimitConfig = {
  limit: Math.ceil(RPM / 6) + BURST, // ~20/min default
  windowMs: 60_000,
}
