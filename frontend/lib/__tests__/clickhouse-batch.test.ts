/**
 * ClickHouse Batch Buffer Tests
 *
 * Tests for the batch insert buffer including:
 * - Unit tests for buffer behavior
 * - Performance benchmark comparing single vs batch inserts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoreRecord, TraceRecord } from '../clickhouse'
import {
  BatchBuffer,
  batchInsertScores,
  batchInsertTraces,
  configureBatchBuffers,
  flushAllBuffers,
  getAllBufferMetrics,
  shutdownBatchBuffers,
} from '../clickhouse-batch'

// Mock the clickhouse module
const mockInsert = vi.fn().mockResolvedValue(undefined)

vi.mock('../clickhouse', () => ({
  getClickHouseClient: () => ({
    insert: mockInsert,
  }),
}))

/**
 * Generate a mock trace record
 */
function mockTrace(overrides: Partial<TraceRecord> = {}): TraceRecord {
  return {
    project_id: 'test-project',
    trace_id: `trace-${Math.random().toString(36).slice(2)}`,
    name: 'test-trace',
    timestamp: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: 100,
    status: 'ok',
    metadata: {},
    agent_id: null,
    agent_version: null,
    workflow_id: null,
    run_id: null,
    total_tokens: 100,
    total_cost: 0.001,
    llm_calls: 1,
    tool_calls: 0,
    ...overrides,
  }
}

/**
 * Generate a mock score record
 */
function mockScore(overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    project_id: 'test-project',
    score_id: `score-${Math.random().toString(36).slice(2)}`,
    trace_id: `trace-${Math.random().toString(36).slice(2)}`,
    span_id: null,
    run_id: null,
    case_id: null,
    name: 'accuracy',
    value: 0.95,
    score_type: 'numeric',
    string_value: null,
    comment: '',
    source: 'api',
    config_id: null,
    author_id: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('BatchBuffer', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockInsert.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await shutdownBatchBuffers()
  })

  describe('buffer behavior', () => {
    it('should buffer rows until batch size is reached', async () => {
      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 5,
        flushIntervalMs: 60000, // Long interval to prevent auto-flush
      })

      // Add 4 rows (below batch size)
      for (let i = 0; i < 4; i++) {
        await buffer.add([mockTrace()])
      }

      expect(buffer.getBufferSize()).toBe(4)
      expect(mockInsert).not.toHaveBeenCalled()

      await buffer.shutdown()
    })

    it('should auto-flush when batch size is reached', async () => {
      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 5,
        flushIntervalMs: 60000,
      })

      // Add exactly batch size rows
      const traces = Array.from({ length: 5 }, () => mockTrace())
      await buffer.add(traces)

      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(buffer.getBufferSize()).toBe(0)

      await buffer.shutdown()
    })

    it('should flush multiple batches for large additions', async () => {
      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 10,
        flushIntervalMs: 60000,
      })

      // Add 25 rows (should trigger 2 flushes, 5 remain)
      const traces = Array.from({ length: 25 }, () => mockTrace())
      await buffer.add(traces)

      expect(mockInsert).toHaveBeenCalledTimes(2)
      expect(buffer.getBufferSize()).toBe(5)

      await buffer.shutdown()
    })

    it('should track metrics correctly', async () => {
      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 10,
        flushIntervalMs: 60000,
      })

      // Add and flush
      const traces = Array.from({ length: 15 }, () => mockTrace())
      await buffer.add(traces)
      await buffer.flush() // Flush remaining 5

      const metrics = buffer.getMetrics()
      expect(metrics.rowsInserted).toBe(15)
      expect(metrics.batchesFlushed).toBe(2)
      expect(metrics.failedBatches).toBe(0)

      await buffer.shutdown()
    })

    it('should handle flush errors with retries', async () => {
      let callCount = 0
      mockInsert.mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          throw new Error('Connection failed')
        }
        return Promise.resolve()
      })

      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 5,
        flushIntervalMs: 60000,
        maxRetries: 3,
      })

      const traces = Array.from({ length: 5 }, () => mockTrace())
      await buffer.add(traces)

      const metrics = buffer.getMetrics()
      expect(metrics.retriedBatches).toBe(2)
      expect(metrics.rowsInserted).toBe(5)

      await buffer.shutdown()
    })

    it('should gracefully shutdown and flush remaining rows', async () => {
      const buffer = new BatchBuffer<TraceRecord>('traces', {
        batchSize: 100,
        flushIntervalMs: 60000,
      })

      // Add rows below batch size
      const traces = Array.from({ length: 10 }, () => mockTrace())
      await buffer.add(traces)
      expect(buffer.getBufferSize()).toBe(10)

      // Shutdown should flush
      await buffer.shutdown()
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })
  })

  describe('singleton buffers', () => {
    it('should use batch insert functions correctly', async () => {
      configureBatchBuffers({
        batchSize: 1000,
        flushIntervalMs: 5000,
      })

      await batchInsertTraces([mockTrace()])
      await batchInsertScores([mockScore()])

      const metrics = getAllBufferMetrics()
      expect(metrics.traces?.currentBufferSize).toBe(1)
      expect(metrics.scores?.currentBufferSize).toBe(1)

      await flushAllBuffers()

      const metricsAfter = getAllBufferMetrics()
      expect(metricsAfter.traces?.currentBufferSize).toBe(0)
      expect(metricsAfter.scores?.currentBufferSize).toBe(0)

      await shutdownBatchBuffers()
    })
  })
})

describe('Performance Benchmark', () => {
  /**
   * This benchmark compares single-row inserts vs batch inserts.
   * Run with: bun run test -- --reporter=verbose
   *
   * Expected result: >10x throughput improvement with batch inserts
   */

  const TOTAL_ROWS = 10000
  const BATCH_SIZE = 1000

  beforeEach(() => {
    // Mock insert that simulates network latency
    mockInsert.mockClear()
    mockInsert.mockImplementation(async () => {
      // Simulate 5ms network latency per insert
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  })

  afterEach(async () => {
    await shutdownBatchBuffers()
  })

  it('benchmark: batch inserts should be >10x faster than single-row inserts', async () => {
    // Generate test data
    const traces = Array.from({ length: TOTAL_ROWS }, () => mockTrace())

    // Benchmark single-row inserts (simulated)
    const singleRowStart = Date.now()
    const singleRowInsertCount = Math.floor(TOTAL_ROWS / 100) // Sample 100 inserts
    for (let i = 0; i < singleRowInsertCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5)) // 5ms per insert
    }
    const singleRowTime = Date.now() - singleRowStart
    const projectedSingleRowTime =
      (singleRowTime / singleRowInsertCount) * TOTAL_ROWS

    // Benchmark batch inserts
    const buffer = new BatchBuffer<TraceRecord>('traces', {
      batchSize: BATCH_SIZE,
      flushIntervalMs: 60000, // Disable auto-flush
    })

    const batchStart = Date.now()
    await buffer.add(traces)
    await buffer.flush()
    const batchTime = Date.now() - batchStart

    const speedup = projectedSingleRowTime / batchTime

    console.log('\n=== Performance Benchmark Results ===')
    console.log(`Total rows: ${TOTAL_ROWS}`)
    console.log(`Batch size: ${BATCH_SIZE}`)
    console.log(`Single-row inserts (projected): ${projectedSingleRowTime}ms`)
    console.log(`Batch inserts: ${batchTime}ms`)
    console.log(`Speedup: ${speedup.toFixed(1)}x`)
    console.log('=====================================\n')

    // Batch should be at least 10x faster
    // With 5ms per insert:
    // - Single row: 10000 * 5ms = 50,000ms
    // - Batch (10 batches): 10 * 5ms = 50ms
    // - Expected speedup: ~1000x
    expect(speedup).toBeGreaterThan(10)

    await buffer.shutdown()
  })

  it('should handle concurrent requests efficiently', async () => {
    configureBatchBuffers({
      batchSize: 100,
      flushIntervalMs: 100,
    })

    const CONCURRENT_REQUESTS = 50
    const ROWS_PER_REQUEST = 20

    const start = Date.now()

    // Simulate concurrent API requests
    const requests = Array.from({ length: CONCURRENT_REQUESTS }, async () => {
      const traces = Array.from({ length: ROWS_PER_REQUEST }, () => mockTrace())
      await batchInsertTraces(traces)
    })

    await Promise.all(requests)
    await flushAllBuffers()

    const duration = Date.now() - start

    const metrics = getAllBufferMetrics()
    const totalInserted = metrics.traces?.rowsInserted ?? 0

    console.log('\n=== Concurrency Benchmark Results ===')
    console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`)
    console.log(`Rows per request: ${ROWS_PER_REQUEST}`)
    console.log(`Total rows inserted: ${totalInserted}`)
    console.log(`Total time: ${duration}ms`)
    console.log(
      `Throughput: ${((totalInserted / duration) * 1000).toFixed(0)} rows/sec`,
    )
    console.log('=====================================\n')

    expect(totalInserted).toBe(CONCURRENT_REQUESTS * ROWS_PER_REQUEST)

    await shutdownBatchBuffers()
  })
})
