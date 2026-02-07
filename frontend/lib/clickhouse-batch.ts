/**
 * ClickHouse Batch Insert Buffer
 *
 * Provides high-throughput batch inserts for ClickHouse tables.
 * ClickHouse is optimized for batch operations, not single-row inserts.
 *
 * Features:
 * - Configurable batch size and flush interval
 * - Auto-flush when buffer is full or interval expires
 * - Graceful shutdown with buffer drain
 * - Error handling for partial batch failures
 * - Per-table buffer isolation
 * - Thread-safe for concurrent API requests
 */

import {
  getClickHouseClient,
  type ScoreRecord,
  type SpanRecord,
  type TraceRecord,
} from './clickhouse'
import { invalidateOnWrite } from './db/clickhouse'

/**
 * Configuration for batch buffer
 */
export interface BatchBufferConfig {
  /** Maximum rows before auto-flush (default: 1000) */
  batchSize: number
  /** Milliseconds before auto-flush (default: 5000) */
  flushIntervalMs: number
  /** Maximum retries for failed batches (default: 3) */
  maxRetries: number
  /** Enable debug logging (default: false) */
  debug: boolean
}

/**
 * Metrics for a batch buffer
 */
export interface BatchBufferMetrics {
  /** Total rows inserted successfully */
  rowsInserted: number
  /** Total batches flushed */
  batchesFlushed: number
  /** Total failed batches */
  failedBatches: number
  /** Total retried batches */
  retriedBatches: number
  /** Current buffer size */
  currentBufferSize: number
  /** Average batch size */
  averageBatchSize: number
  /** Last flush timestamp */
  lastFlushTime: Date | null
}

/**
 * Result of a batch flush operation
 */
interface FlushResult {
  success: boolean
  rowsInserted: number
  error?: Error
}

const DEFAULT_CONFIG: BatchBufferConfig = {
  batchSize: 1000,
  flushIntervalMs: 5000,
  maxRetries: 3,
  debug: false,
}

/**
 * Generic batch buffer for ClickHouse inserts
 */
export class BatchBuffer<T extends object> {
  private readonly tableName: string
  private readonly config: BatchBufferConfig
  private buffer: T[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private isFlushing = false
  private isShuttingDown = false
  private metrics: BatchBufferMetrics = {
    rowsInserted: 0,
    batchesFlushed: 0,
    failedBatches: 0,
    retriedBatches: 0,
    currentBufferSize: 0,
    averageBatchSize: 0,
    lastFlushTime: null,
  }

  // Promise for in-progress flush, to coordinate concurrent calls
  private flushPromise: Promise<FlushResult> | null = null

  constructor(tableName: string, config: Partial<BatchBufferConfig> = {}) {
    this.tableName = tableName
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startFlushTimer()
  }

  /**
   * Add rows to the buffer. Auto-flushes in batch-sized chunks if buffer exceeds batch size.
   * Returns a promise that resolves when the rows are buffered
   * (not necessarily inserted yet, unless buffer exceeded batch size).
   */
  async add(rows: T[]): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error(`BatchBuffer for ${this.tableName} is shutting down`)
    }

    this.buffer.push(...rows)
    this.metrics.currentBufferSize = this.buffer.length

    this.log(
      `Added ${rows.length} rows to ${this.tableName} buffer (total: ${this.buffer.length})`,
    )

    // Auto-flush in batch-sized chunks while buffer exceeds batch size
    while (this.buffer.length >= this.config.batchSize) {
      await this.flushBatch()
    }
  }

  /**
   * Flush exactly one batch worth of rows (or all remaining if less than batch size)
   */
  private async flushBatch(): Promise<FlushResult> {
    if (this.buffer.length === 0) {
      return { success: true, rowsInserted: 0 }
    }

    // Take exactly batch size rows (or all if less)
    const rowsToInsert = this.buffer.splice(0, this.config.batchSize)
    this.metrics.currentBufferSize = this.buffer.length

    return this.insertBatch(rowsToInsert)
  }

  /**
   * Force flush the current buffer to ClickHouse
   */
  async flush(): Promise<FlushResult> {
    // If already flushing, wait for that to complete
    if (this.isFlushing && this.flushPromise) {
      return this.flushPromise
    }

    // Nothing to flush
    if (this.buffer.length === 0) {
      return { success: true, rowsInserted: 0 }
    }

    this.isFlushing = true

    // Create the flush promise
    this.flushPromise = this.executeFlush()

    try {
      return await this.flushPromise
    } finally {
      this.isFlushing = false
      this.flushPromise = null
      this.restartFlushTimer()
    }
  }

  /**
   * Execute the actual flush operation - flushes all remaining rows
   */
  private async executeFlush(): Promise<FlushResult> {
    const rowsToInsert = [...this.buffer]
    this.buffer = []
    this.metrics.currentBufferSize = 0

    return this.insertBatch(rowsToInsert)
  }

  /**
   * Insert a batch of rows with retries
   */
  private async insertBatch(rowsToInsert: T[]): Promise<FlushResult> {
    if (rowsToInsert.length === 0) {
      return { success: true, rowsInserted: 0 }
    }

    let lastError: Error | undefined
    let attempt = 0

    while (attempt < this.config.maxRetries) {
      try {
        const ch = getClickHouseClient()
        await ch.insert({
          table: this.tableName,
          values: rowsToInsert,
          format: 'JSONEachRow',
        })

        // Success
        this.metrics.rowsInserted += rowsToInsert.length
        this.metrics.batchesFlushed += 1
        this.metrics.lastFlushTime = new Date()
        this.updateAverageBatchSize(rowsToInsert.length)

        this.log(`Flushed ${rowsToInsert.length} rows to ${this.tableName}`)

        return { success: true, rowsInserted: rowsToInsert.length }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt += 1

        if (attempt < this.config.maxRetries) {
          this.metrics.retriedBatches += 1
          this.log(
            `Retry ${attempt}/${this.config.maxRetries} for ${this.tableName}: ${lastError.message}`,
          )
          // Exponential backoff
          await this.sleep(2 ** attempt * 100)
        }
      }
    }

    // All retries failed
    this.metrics.failedBatches += 1
    console.error(
      `BatchBuffer flush failed for ${this.tableName} after ${this.config.maxRetries} retries:`,
      lastError,
    )

    // Re-add failed rows to buffer for next attempt (unless shutting down)
    if (!this.isShuttingDown) {
      this.buffer.unshift(...rowsToInsert)
      this.metrics.currentBufferSize = this.buffer.length
    }

    return { success: false, rowsInserted: 0, error: lastError }
  }

  /**
   * Gracefully shutdown the buffer, flushing any remaining rows
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true
    this.stopFlushTimer()

    if (this.buffer.length > 0) {
      this.log(
        `Shutting down ${this.tableName} buffer, flushing ${this.buffer.length} remaining rows`,
      )
      await this.flush()
    }

    this.log(`BatchBuffer for ${this.tableName} shutdown complete`)
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchBufferMetrics {
    return { ...this.metrics }
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length
  }

  /**
   * Check if buffer has pending rows
   */
  hasPendingRows(): boolean {
    return this.buffer.length > 0
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0 && !this.isFlushing) {
        this.flush().catch((err) => {
          console.error(`Periodic flush failed for ${this.tableName}:`, err)
        })
      }
    }, this.config.flushIntervalMs)

    // Don't keep the process alive just for this timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref()
    }
  }

  private restartFlushTimer(): void {
    if (!this.isShuttingDown) {
      this.startFlushTimer()
    }
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private updateAverageBatchSize(batchSize: number): void {
    const total =
      this.metrics.averageBatchSize * (this.metrics.batchesFlushed - 1) +
      batchSize
    this.metrics.averageBatchSize = total / this.metrics.batchesFlushed
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[BatchBuffer:${this.tableName}] ${message}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// ============================================================================
// Singleton Buffer Instances
// ============================================================================

let tracesBuffer: BatchBuffer<TraceRecord> | null = null
let spansBuffer: BatchBuffer<SpanRecord> | null = null
let scoresBuffer: BatchBuffer<ScoreRecord> | null = null
let isInitialized = false

/**
 * Global configuration for all batch buffers
 */
let globalConfig: Partial<BatchBufferConfig> = {}

/**
 * Configure batch buffer settings (call before first use)
 */
export function configureBatchBuffers(
  config: Partial<BatchBufferConfig>,
): void {
  globalConfig = { ...globalConfig, ...config }

  // If buffers already exist, recreate them with new config
  if (isInitialized) {
    console.warn(
      'Reconfiguring batch buffers after initialization - existing buffers will be flushed',
    )
    shutdownBatchBuffers().then(() => {
      isInitialized = false
      initializeBatchBuffers()
    })
  }
}

/**
 * Initialize batch buffers (called automatically on first use)
 */
function initializeBatchBuffers(): void {
  if (isInitialized) return

  tracesBuffer = new BatchBuffer<TraceRecord>('traces', globalConfig)
  spansBuffer = new BatchBuffer<SpanRecord>('spans', globalConfig)
  scoresBuffer = new BatchBuffer<ScoreRecord>('scores', globalConfig)
  isInitialized = true

  // Register shutdown handlers
  if (typeof process !== 'undefined') {
    const shutdown = async () => {
      await shutdownBatchBuffers()
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    process.on('beforeExit', shutdown)
  }
}

/**
 * Get the traces batch buffer
 */
export function getTracesBuffer(): BatchBuffer<TraceRecord> {
  initializeBatchBuffers()
  return tracesBuffer!
}

/**
 * Get the spans batch buffer
 */
export function getSpansBuffer(): BatchBuffer<SpanRecord> {
  initializeBatchBuffers()
  return spansBuffer!
}

/**
 * Get the scores batch buffer
 */
export function getScoresBuffer(): BatchBuffer<ScoreRecord> {
  initializeBatchBuffers()
  return scoresBuffer!
}

// ============================================================================
// Batch Insert Functions
// ============================================================================

/**
 * Add traces to the batch buffer for insertion
 * @param traces - Trace records to insert
 * @param options - Optional: immediate=true to flush immediately
 */
export async function batchInsertTraces(
  traces: TraceRecord[],
  options?: { immediate?: boolean },
): Promise<void> {
  const buffer = getTracesBuffer()
  await buffer.add(traces)

  if (options?.immediate) {
    await buffer.flush()
  }

  // Invalidate cached queries that depend on traces data
  invalidateOnWrite('traces')
}

/**
 * Add spans to the batch buffer for insertion
 * @param spans - Span records to insert
 * @param options - Optional: immediate=true to flush immediately
 */
export async function batchInsertSpans(
  spans: SpanRecord[],
  options?: { immediate?: boolean },
): Promise<void> {
  const buffer = getSpansBuffer()
  await buffer.add(spans)

  if (options?.immediate) {
    await buffer.flush()
  }

  // Invalidate cached queries that depend on spans data
  invalidateOnWrite('spans')
}

/**
 * Add scores to the batch buffer for insertion
 * @param scores - Score records to insert
 * @param options - Optional: immediate=true to flush immediately
 */
export async function batchInsertScores(
  scores: ScoreRecord[],
  options?: { immediate?: boolean },
): Promise<void> {
  const buffer = getScoresBuffer()
  await buffer.add(scores)

  if (options?.immediate) {
    await buffer.flush()
  }

  // Invalidate cached queries that depend on scores data
  invalidateOnWrite('scores')
}

/**
 * Flush all batch buffers immediately
 */
export async function flushAllBuffers(): Promise<void> {
  if (!isInitialized) return

  await Promise.all([
    tracesBuffer?.flush(),
    spansBuffer?.flush(),
    scoresBuffer?.flush(),
  ])
}

/**
 * Shutdown all batch buffers gracefully
 */
export async function shutdownBatchBuffers(): Promise<void> {
  if (!isInitialized) return

  await Promise.all([
    tracesBuffer?.shutdown(),
    spansBuffer?.shutdown(),
    scoresBuffer?.shutdown(),
  ])

  tracesBuffer = null
  spansBuffer = null
  scoresBuffer = null
  isInitialized = false
}

/**
 * Get metrics for all batch buffers
 */
export function getAllBufferMetrics(): {
  traces: BatchBufferMetrics | null
  spans: BatchBufferMetrics | null
  scores: BatchBufferMetrics | null
} {
  return {
    traces: tracesBuffer?.getMetrics() ?? null,
    spans: spansBuffer?.getMetrics() ?? null,
    scores: scoresBuffer?.getMetrics() ?? null,
  }
}

/**
 * Check if any buffer has pending rows
 */
export function hasPendingInserts(): boolean {
  if (!isInitialized) return false

  return (
    (tracesBuffer?.hasPendingRows() ?? false) ||
    (spansBuffer?.hasPendingRows() ?? false) ||
    (scoresBuffer?.hasPendingRows() ?? false)
  )
}
