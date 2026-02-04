/**
 * Offline Tracing Buffer
 *
 * Provides durable span buffering for offline scenarios with configurable
 * flush strategies and replay capabilities.
 *
 * @example
 * ```typescript
 * import { OfflineBuffer, createOfflineBuffer } from '@neon/sdk';
 *
 * // Create buffer with auto-flush
 * const buffer = createOfflineBuffer({
 *   maxSize: 1000,
 *   flushInterval: 30000, // 30 seconds
 *   persistPath: './traces-buffer.jsonl',
 *   onFlush: async (spans) => {
 *     await neon.traces.ingest(spans);
 *   },
 * });
 *
 * // Add spans (automatically batched)
 * buffer.add(mySpan);
 *
 * // Manual flush when back online
 * await buffer.flush();
 *
 * // Replay from disk after restart
 * await buffer.replay();
 * ```
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Span data structure for buffering
 */
export interface BufferedSpan {
  /** Unique span ID */
  spanId: string;
  /** Trace ID this span belongs to */
  traceId: string;
  /** Parent span ID (if any) */
  parentSpanId?: string;
  /** Span name */
  name: string;
  /** Span type */
  type: "span" | "generation" | "tool" | "retrieval" | "event";
  /** Component type for attribution */
  componentType?: string;
  /** Start timestamp (ISO string) */
  startTime: string;
  /** End timestamp (ISO string) */
  endTime?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Span status */
  status: "unset" | "ok" | "error";
  /** Status message */
  statusMessage?: string;
  /** Custom attributes */
  attributes: Record<string, string | number | boolean>;
  /** LLM-specific fields */
  model?: string;
  input?: string;
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Tool-specific fields */
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  /** Timestamp when this was added to buffer */
  bufferedAt: string;
  /** Number of flush attempts */
  flushAttempts: number;
}

/**
 * Flush strategy type
 */
export type FlushStrategy = "size" | "time" | "manual" | "hybrid";

/**
 * Configuration for the offline buffer
 */
export interface OfflineBufferConfig {
  /** Maximum number of spans to buffer before auto-flush (default: 1000) */
  maxSize?: number;
  /** Auto-flush interval in milliseconds (default: 60000 = 1 minute) */
  flushInterval?: number;
  /** Path to persist buffer on disk (default: null = memory only) */
  persistPath?: string;
  /** Flush strategy (default: 'hybrid') */
  flushStrategy?: FlushStrategy;
  /** Callback when flush is triggered */
  onFlush?: (spans: BufferedSpan[]) => Promise<FlushResult>;
  /** Callback when an error occurs */
  onError?: (error: Error, spans?: BufferedSpan[]) => void;
  /** Maximum retry attempts per span (default: 3) */
  maxRetries?: number;
  /** Retry delay in milliseconds (default: 5000) */
  retryDelay?: number;
  /** Whether to start flush timer automatically (default: true) */
  autoStart?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Write batch interval in milliseconds (default: 1000) */
  writeBatchInterval?: number;
  /** Lock timeout in milliseconds (default: 10000) */
  lockTimeout?: number;
}

/**
 * Result of a flush operation
 */
export interface FlushResult {
  /** Number of spans successfully flushed */
  success: number;
  /** Number of spans that failed to flush */
  failed: number;
  /** Spans that failed (for retry) */
  failedSpans?: BufferedSpan[];
  /** Error message if any */
  error?: string;
}

/**
 * Buffer statistics
 */
export interface BufferStats {
  /** Current number of spans in buffer */
  size: number;
  /** Maximum buffer size */
  maxSize: number;
  /** Total spans added since creation */
  totalAdded: number;
  /** Total spans successfully flushed */
  totalFlushed: number;
  /** Total spans that failed to flush */
  totalFailed: number;
  /** Whether buffer is persisted to disk */
  isPersisted: boolean;
  /** Last flush timestamp */
  lastFlushAt?: Date;
  /** Last error timestamp */
  lastErrorAt?: Date;
  /** Oldest span in buffer */
  oldestSpanAt?: Date;
  /** Number of pending writes */
  pendingWrites: number;
}

/**
 * Simple async mutex for synchronizing operations
 */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * File lock manager for cross-process synchronization
 */
class FileLock {
  private lockPath: string;
  private lockTimeout: number;
  private lockAcquired = false;

  constructor(filePath: string, timeout = 10000) {
    this.lockPath = `${filePath}.lock`;
    this.lockTimeout = timeout;
  }

  async acquire(): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockPath, `${process.pid}\n${Date.now()}`, {
          flag: "wx",
        });
        this.lockAcquired = true;
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          // Lock exists, check if it's stale
          const isStale = await this.isLockStale();
          if (isStale) {
            await this.forceRelease();
            continue;
          }
          // Wait and retry
          await this.sleep(50);
        } else {
          throw error;
        }
      }
    }

    return false;
  }

  async release(): Promise<void> {
    if (!this.lockAcquired) return;

    try {
      await fs.unlink(this.lockPath);
    } catch {
      // Ignore errors during release
    }
    this.lockAcquired = false;
  }

  private async isLockStale(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.lockPath, "utf-8");
      const parts = content.trim().split("\n");
      // Malformed lock file (missing timestamp) - treat as stale
      if (parts.length < 2) {
        return true;
      }
      const timestamp = Number.parseInt(parts[1], 10);
      // Invalid timestamp - treat as stale
      if (Number.isNaN(timestamp)) {
        return true;
      }
      const lockAge = Date.now() - timestamp;
      // Consider lock stale after 30 seconds
      return lockAge > 30000;
    } catch {
      return true;
    }
  }

  private async forceRelease(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch {
      // Ignore
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Offline buffer for span data
 */
export class OfflineBuffer {
  private buffer: BufferedSpan[] = [];
  private pendingWrites: BufferedSpan[] = [];
  private config: Required<
    Omit<OfflineBufferConfig, "onFlush" | "onError" | "persistPath">
  > & {
    onFlush?: OfflineBufferConfig["onFlush"];
    onError?: OfflineBufferConfig["onError"];
    persistPath?: string;
  };
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private flushMutex = new AsyncMutex();
  private writeMutex = new AsyncMutex();
  private fileLock: FileLock | null = null;
  private isShuttingDown = false;
  private stats = {
    totalAdded: 0,
    totalFlushed: 0,
    totalFailed: 0,
    lastFlushAt: undefined as Date | undefined,
    lastErrorAt: undefined as Date | undefined,
  };

  constructor(config: OfflineBufferConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      flushInterval: config.flushInterval ?? 60000,
      flushStrategy: config.flushStrategy ?? "hybrid",
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 5000,
      autoStart: config.autoStart ?? true,
      debug: config.debug ?? false,
      writeBatchInterval: config.writeBatchInterval ?? 1000,
      lockTimeout: config.lockTimeout ?? 10000,
      onFlush: config.onFlush,
      onError: config.onError,
      persistPath: config.persistPath,
    };

    if (this.config.persistPath) {
      this.fileLock = new FileLock(
        this.config.persistPath,
        this.config.lockTimeout
      );
    }

    // Start auto-flush timer if configured
    if (this.config.autoStart && this.config.flushStrategy !== "manual") {
      this.startFlushTimer();
    }
  }

  /**
   * Initialize the buffer (load from disk if configured)
   * Call this before using the buffer if persistence is enabled.
   */
  async initialize(): Promise<void> {
    if (this.config.persistPath) {
      await this.loadFromDisk();
    }
  }

  /**
   * Add a span to the buffer
   */
  add(span: Omit<BufferedSpan, "bufferedAt" | "flushAttempts">): void {
    if (this.isShuttingDown) {
      this.log("Buffer is shutting down, rejecting add", "error");
      return;
    }

    const bufferedSpan: BufferedSpan = {
      ...span,
      bufferedAt: new Date().toISOString(),
      flushAttempts: 0,
    };

    this.buffer.push(bufferedSpan);
    this.stats.totalAdded++;

    this.log(
      `Added span ${span.spanId} to buffer (size: ${this.buffer.length})`
    );

    // Queue for batched disk write if configured
    if (this.config.persistPath) {
      this.pendingWrites.push(bufferedSpan);
      this.scheduleWrite();
    }

    // Check if we should auto-flush based on size
    if (
      this.config.flushStrategy !== "manual" &&
      this.buffer.length >= this.config.maxSize
    ) {
      this.log("Buffer size limit reached, triggering flush");
      // Queue flush - don't await, but use mutex to prevent races
      this.queueFlush();
    }
  }

  /**
   * Add multiple spans to the buffer
   */
  addBatch(
    spans: Array<Omit<BufferedSpan, "bufferedAt" | "flushAttempts">>
  ): void {
    for (const span of spans) {
      this.add(span);
    }
  }

  /**
   * Queue a flush operation (non-blocking, mutex-protected)
   */
  private queueFlush(): void {
    // Use setImmediate to avoid blocking the current call
    setImmediate(() => {
      this.flush().catch((err) => this.handleError(err as Error));
    });
  }

  /**
   * Flush all buffered spans (mutex-protected)
   */
  async flush(): Promise<FlushResult> {
    return this.flushMutex.withLock(async () => {
      return this.flushInternal();
    });
  }

  /**
   * Internal flush implementation (must be called with mutex held)
   */
  private async flushInternal(): Promise<FlushResult> {
    if (this.buffer.length === 0) {
      this.log("Buffer is empty, nothing to flush");
      return { success: 0, failed: 0 };
    }

    // Flush any pending writes first
    await this.flushPendingWrites();

    const spansToFlush = [...this.buffer];
    this.buffer = [];

    this.log(`Flushing ${spansToFlush.length} spans`);

    try {
      if (this.config.onFlush) {
        const result = await this.config.onFlush(spansToFlush);

        this.stats.lastFlushAt = new Date();
        this.stats.totalFlushed += result.success;
        this.stats.totalFailed += result.failed;

        // Re-add failed spans for retry
        if (result.failedSpans && result.failedSpans.length > 0) {
          const retriableSpans = result.failedSpans.filter(
            (s) => s.flushAttempts < this.config.maxRetries
          );

          for (const span of retriableSpans) {
            span.flushAttempts++;
          }

          this.buffer.push(...retriableSpans);

          if (this.config.persistPath && retriableSpans.length > 0) {
            await this.saveToDisk();
          }
        }

        // Clear persisted buffer on success
        if (this.config.persistPath && result.failed === 0) {
          await this.clearPersistedBuffer();
        }

        this.log(
          `Flush complete: ${result.success} success, ${result.failed} failed`
        );

        return result;
      } else {
        // No flush handler, just clear the buffer
        this.stats.lastFlushAt = new Date();
        this.stats.totalFlushed += spansToFlush.length;

        if (this.config.persistPath) {
          await this.clearPersistedBuffer();
        }

        return { success: spansToFlush.length, failed: 0 };
      }
    } catch (error) {
      // On error, re-add spans to buffer for retry
      for (const span of spansToFlush) {
        span.flushAttempts++;
      }

      const retriableSpans = spansToFlush.filter(
        (s) => s.flushAttempts < this.config.maxRetries
      );
      const droppedSpans = spansToFlush.filter(
        (s) => s.flushAttempts >= this.config.maxRetries
      );

      this.buffer.push(...retriableSpans);
      this.stats.totalFailed += droppedSpans.length;

      if (this.config.persistPath && retriableSpans.length > 0) {
        await this.saveToDisk();
      }

      this.handleError(error as Error, droppedSpans);

      return {
        success: 0,
        failed: spansToFlush.length,
        failedSpans: spansToFlush,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Replay spans from disk persistence
   */
  async replay(): Promise<FlushResult> {
    if (!this.config.persistPath) {
      this.log("No persist path configured, nothing to replay");
      return { success: 0, failed: 0 };
    }

    await this.loadFromDisk();

    if (this.buffer.length === 0) {
      this.log("No persisted spans to replay");
      return { success: 0, failed: 0 };
    }

    this.log(`Replaying ${this.buffer.length} persisted spans`);
    return this.flush();
  }

  /**
   * Get current buffer statistics
   */
  getStats(): BufferStats {
    const oldestSpan = this.buffer.length > 0 ? this.buffer[0] : undefined;

    return {
      size: this.buffer.length,
      maxSize: this.config.maxSize,
      totalAdded: this.stats.totalAdded,
      totalFlushed: this.stats.totalFlushed,
      totalFailed: this.stats.totalFailed,
      isPersisted: !!this.config.persistPath,
      lastFlushAt: this.stats.lastFlushAt,
      lastErrorAt: this.stats.lastErrorAt,
      oldestSpanAt: oldestSpan ? new Date(oldestSpan.bufferedAt) : undefined,
      pendingWrites: this.pendingWrites.length,
    };
  }

  /**
   * Get current buffer contents (for inspection)
   */
  getBuffer(): ReadonlyArray<BufferedSpan> {
    return [...this.buffer];
  }

  /**
   * Clear all buffered spans
   */
  async clear(): Promise<void> {
    this.buffer = [];
    this.pendingWrites = [];
    if (this.config.persistPath) {
      await this.clearPersistedBuffer();
    }
    this.log("Buffer cleared");
  }

  /**
   * Start the auto-flush timer
   */
  startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch((err) => this.handleError(err as Error));
      }
    }, this.config.flushInterval);

    this.log(`Started flush timer (interval: ${this.config.flushInterval}ms)`);
  }

  /**
   * Stop the auto-flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      this.log("Stopped flush timer");
    }
  }

  /**
   * Shutdown the buffer gracefully
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopFlushTimer();

    // Cancel pending write timer
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    // Flush pending writes immediately
    if (this.pendingWrites.length > 0) {
      await this.flushPendingWrites();
    }

    // Attempt final flush
    if (this.buffer.length > 0) {
      this.log("Flushing remaining spans before shutdown");
      try {
        await this.flush();
      } catch (error) {
        this.log(`Flush failed during shutdown: ${(error as Error).message}`, "error");
      }
    }

    // Save any remaining buffer to disk
    if (this.config.persistPath && this.buffer.length > 0) {
      await this.saveToDisk();
    }

    // Release file lock
    if (this.fileLock) {
      await this.fileLock.release();
    }

    this.log("Buffer shutdown complete");
  }

  // ==================
  // Private methods
  // ==================

  /**
   * Schedule a batched write to disk
   */
  private scheduleWrite(): void {
    if (this.writeTimer) {
      return; // Already scheduled
    }

    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flushPendingWrites().catch((err) =>
        this.handleError(err as Error)
      );
    }, this.config.writeBatchInterval);
  }

  /**
   * Flush pending writes to disk (batched, async, with lock)
   */
  private async flushPendingWrites(): Promise<void> {
    const persistPath = this.config.persistPath;
    if (this.pendingWrites.length === 0 || !persistPath) {
      return;
    }

    return this.writeMutex.withLock(async () => {
      const writes = [...this.pendingWrites];
      this.pendingWrites = [];

      if (writes.length === 0) return;

      // Acquire file lock
      if (this.fileLock) {
        const acquired = await this.fileLock.acquire();
        if (!acquired) {
          // Put writes back and schedule retry
          this.pendingWrites.push(...writes);
          this.scheduleWrite();
          this.log("Could not acquire file lock, will retry", "error");
          return;
        }
      }

      try {
        // Ensure directory exists
        const dir = path.dirname(persistPath);
        await fs.mkdir(dir, { recursive: true });

        // Batch write
        const content = writes.map((s) => JSON.stringify(s)).join("\n") + "\n";
        await fs.appendFile(persistPath, content);

        this.log(`Wrote ${writes.length} spans to disk (batched)`);
      } catch (error) {
        // Put writes back for retry
        this.pendingWrites.push(...writes);
        this.handleError(
          new Error(`Failed to write to disk: ${(error as Error).message}`)
        );
      } finally {
        if (this.fileLock) {
          await this.fileLock.release();
        }
      }
    });
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.config.persistPath) return;

    // Acquire file lock
    if (this.fileLock) {
      const acquired = await this.fileLock.acquire();
      if (!acquired) {
        this.handleError(new Error("Could not acquire file lock for reading"));
        return;
      }
    }

    try {
      const exists = await this.fileExists(this.config.persistPath);
      if (exists) {
        const content = await fs.readFile(this.config.persistPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        let loadedCount = 0;
        let errorCount = 0;

        for (const line of lines) {
          try {
            const span = JSON.parse(line) as BufferedSpan;
            this.buffer.push(span);
            loadedCount++;
          } catch {
            errorCount++;
          }
        }

        this.log(`Loaded ${loadedCount} spans from disk`);
        if (errorCount > 0) {
          this.log(`Skipped ${errorCount} corrupted lines`, "error");
        }
      }
    } catch (error) {
      this.handleError(
        new Error(`Failed to load from disk: ${(error as Error).message}`)
      );
    } finally {
      if (this.fileLock) {
        await this.fileLock.release();
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.config.persistPath) return;

    // Acquire file lock
    if (this.fileLock) {
      const acquired = await this.fileLock.acquire();
      if (!acquired) {
        this.handleError(new Error("Could not acquire file lock for saving"));
        return;
      }
    }

    try {
      const dir = path.dirname(this.config.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const content =
        this.buffer.map((s) => JSON.stringify(s)).join("\n") + "\n";
      await fs.writeFile(this.config.persistPath, content);

      this.log(`Saved ${this.buffer.length} spans to disk`);
    } catch (error) {
      this.handleError(
        new Error(`Failed to save to disk: ${(error as Error).message}`)
      );
    } finally {
      if (this.fileLock) {
        await this.fileLock.release();
      }
    }
  }

  private async clearPersistedBuffer(): Promise<void> {
    if (!this.config.persistPath) return;

    // Acquire file lock
    if (this.fileLock) {
      const acquired = await this.fileLock.acquire();
      if (!acquired) {
        this.handleError(new Error("Could not acquire file lock for clearing"));
        return;
      }
    }

    try {
      const exists = await this.fileExists(this.config.persistPath);
      if (exists) {
        await fs.unlink(this.config.persistPath);
        this.log("Cleared persisted buffer");
      }
    } catch (error) {
      this.handleError(
        new Error(
          `Failed to clear persisted buffer: ${(error as Error).message}`
        )
      );
    } finally {
      if (this.fileLock) {
        await this.fileLock.release();
      }
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private handleError(error: Error, spans?: BufferedSpan[]): void {
    this.stats.lastErrorAt = new Date();

    if (this.config.onError) {
      this.config.onError(error, spans);
    }

    this.log(`Error: ${error.message}`, "error");
  }

  private log(message: string, level: "info" | "error" = "info"): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      const prefix = `[OfflineBuffer ${timestamp}]`;
      if (level === "error") {
        console.error(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }
}

/**
 * Create an offline buffer with the given configuration
 */
export function createOfflineBuffer(
  config: OfflineBufferConfig = {}
): OfflineBuffer {
  return new OfflineBuffer(config);
}

/**
 * Create and initialize an offline buffer
 */
export async function createAndInitializeOfflineBuffer(
  config: OfflineBufferConfig = {}
): Promise<OfflineBuffer> {
  const buffer = new OfflineBuffer(config);
  await buffer.initialize();
  return buffer;
}

/**
 * Create a span object for buffering
 *
 * @example
 * ```typescript
 * const span = createBufferableSpan({
 *   name: 'llm-call',
 *   type: 'generation',
 *   traceId: trace.traceId,
 *   model: 'gpt-4',
 *   input: prompt,
 *   output: response,
 * });
 *
 * buffer.add(span);
 * ```
 */
export function createBufferableSpan(
  options: Partial<BufferedSpan> & { name: string; traceId: string }
): Omit<BufferedSpan, "bufferedAt" | "flushAttempts"> {
  return {
    spanId: options.spanId ?? `span-${crypto.randomUUID()}`,
    traceId: options.traceId,
    parentSpanId: options.parentSpanId,
    name: options.name,
    type: options.type ?? "span",
    componentType: options.componentType,
    startTime: options.startTime ?? new Date().toISOString(),
    endTime: options.endTime,
    durationMs: options.durationMs,
    status: options.status ?? "unset",
    statusMessage: options.statusMessage,
    attributes: options.attributes ?? {},
    model: options.model,
    input: options.input,
    output: options.output,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    toolName: options.toolName,
    toolInput: options.toolInput,
    toolOutput: options.toolOutput,
  };
}

/**
 * Global singleton buffer for convenient access
 * Note: Prefer creating explicit buffer instances for better testability.
 */
let globalBuffer: OfflineBuffer | null = null;

/**
 * Get or create the global offline buffer
 * @deprecated Prefer creating explicit buffer instances with createOfflineBuffer()
 */
export function getGlobalBuffer(config?: OfflineBufferConfig): OfflineBuffer {
  if (!globalBuffer) {
    globalBuffer = createOfflineBuffer(config);
  }
  return globalBuffer;
}

/**
 * Reset the global buffer (useful for testing)
 */
export async function resetGlobalBuffer(): Promise<void> {
  if (globalBuffer) {
    globalBuffer.stopFlushTimer();
    await globalBuffer.clear();
    globalBuffer = null;
  }
}

/**
 * Check if the buffer is healthy (not too full, recent successful flush)
 */
export function isBufferHealthy(buffer: OfflineBuffer): {
  healthy: boolean;
  warnings: string[];
} {
  const stats = buffer.getStats();
  const warnings: string[] = [];

  // Check if buffer is getting full
  const fillPercentage = stats.size / stats.maxSize;
  if (fillPercentage > 0.9) {
    warnings.push(
      `Buffer is ${(fillPercentage * 100).toFixed(1)}% full (${stats.size}/${stats.maxSize})`
    );
  }

  // Check for stale data
  if (stats.oldestSpanAt) {
    const ageMs = Date.now() - stats.oldestSpanAt.getTime();
    const maxAgeMs = 5 * 60 * 1000; // 5 minutes
    if (ageMs > maxAgeMs) {
      warnings.push(
        `Oldest span is ${(ageMs / 1000 / 60).toFixed(1)} minutes old`
      );
    }
  }

  // Check for recent errors
  if (stats.lastErrorAt) {
    const errorAgeMs = Date.now() - stats.lastErrorAt.getTime();
    const recentErrorThreshold = 60 * 1000; // 1 minute
    if (errorAgeMs < recentErrorThreshold) {
      warnings.push(
        `Recent error occurred ${(errorAgeMs / 1000).toFixed(0)}s ago`
      );
    }
  }

  // Check failure rate
  const totalAttempts = stats.totalFlushed + stats.totalFailed;
  if (totalAttempts > 10) {
    const failureRate = stats.totalFailed / totalAttempts;
    if (failureRate > 0.1) {
      warnings.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }
  }

  // Check pending writes
  if (stats.pendingWrites > 100) {
    warnings.push(`${stats.pendingWrites} writes pending`);
  }

  return {
    healthy: warnings.length === 0,
    warnings,
  };
}
