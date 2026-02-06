# Offline Tracing Buffer

The Offline Buffer provides durable span buffering for disconnected scenarios. When your agent runs in environments with intermittent connectivity, the buffer stores spans locally and flushes them when connectivity returns.

## Overview

Key capabilities:

1. **In-memory buffering** - Fast, thread-safe span storage
2. **Disk persistence** - Survive process restarts
3. **Configurable flush strategies** - Size-based, time-based, or manual
4. **Automatic retry** - Handle transient failures gracefully
5. **Cross-process safety** - File locking for concurrent access
6. **Health monitoring** - Track buffer state and issues

## Quick Start

```typescript
import { createOfflineBuffer, createBufferableSpan } from '@neon/sdk';

// Create buffer with auto-flush
const buffer = createOfflineBuffer({
  maxSize: 1000,
  flushInterval: 30000,  // 30 seconds
  persistPath: './traces-buffer.jsonl',
  onFlush: async (spans) => {
    await neon.traces.ingest(spans);
    return { success: spans.length, failed: 0 };
  },
});

// Initialize (loads any persisted data)
await buffer.initialize();

// Add spans during agent execution
const span = createBufferableSpan({
  name: 'llm-call',
  traceId: 'trace-123',
  type: 'generation',
  model: 'gpt-4',
  input: prompt,
  output: response,
});
buffer.add(span);

// When back online, flush immediately
await buffer.flush();

// Graceful shutdown
await buffer.shutdown();
```

## Creating a Buffer

### createOfflineBuffer()

Create a new buffer instance.

```typescript
function createOfflineBuffer(config?: OfflineBufferConfig): OfflineBuffer;
```

### createAndInitializeOfflineBuffer()

Create and initialize in one step.

```typescript
async function createAndInitializeOfflineBuffer(
  config?: OfflineBufferConfig
): Promise<OfflineBuffer>;

// Usage
const buffer = await createAndInitializeOfflineBuffer({
  persistPath: './buffer.jsonl',
});
```

### Configuration

```typescript
interface OfflineBufferConfig {
  /** Maximum spans to buffer before auto-flush (default: 1000) */
  maxSize?: number;

  /** Auto-flush interval in milliseconds (default: 60000 = 1 minute) */
  flushInterval?: number;

  /** Path to persist buffer on disk (default: null = memory only) */
  persistPath?: string;

  /** Flush strategy (default: 'hybrid') */
  flushStrategy?: 'size' | 'time' | 'manual' | 'hybrid';

  /** Callback when flush is triggered */
  onFlush?: (spans: BufferedSpan[]) => Promise<FlushResult>;

  /** Callback when an error occurs */
  onError?: (error: Error, spans?: BufferedSpan[]) => void;

  /** Maximum retry attempts per span (default: 3) */
  maxRetries?: number;

  /** Retry delay in milliseconds (default: 5000) */
  retryDelay?: number;

  /** Start flush timer automatically (default: true) */
  autoStart?: boolean;

  /** Enable debug logging (default: false) */
  debug?: boolean;

  /** Write batch interval in milliseconds (default: 1000) */
  writeBatchInterval?: number;

  /** Lock timeout in milliseconds (default: 10000) */
  lockTimeout?: number;
}
```

### Flush Strategies

| Strategy | Description |
|----------|-------------|
| `size` | Flush when buffer reaches `maxSize` |
| `time` | Flush at regular `flushInterval` |
| `manual` | Only flush when `flush()` is called |
| `hybrid` | Flush on size limit OR time interval (default) |

```typescript
// Size-based only
const buffer = createOfflineBuffer({
  flushStrategy: 'size',
  maxSize: 500,
  onFlush: handleFlush,
});

// Time-based only
const buffer = createOfflineBuffer({
  flushStrategy: 'time',
  flushInterval: 10000,  // 10 seconds
  onFlush: handleFlush,
});

// Manual only
const buffer = createOfflineBuffer({
  flushStrategy: 'manual',
  onFlush: handleFlush,
});

// Flush manually when ready
await buffer.flush();
```

## BufferedSpan Type

Spans in the buffer have this structure:

```typescript
interface BufferedSpan {
  /** Unique span ID */
  spanId: string;
  /** Trace ID this span belongs to */
  traceId: string;
  /** Parent span ID (if any) */
  parentSpanId?: string;
  /** Span name */
  name: string;
  /** Span type */
  type: 'span' | 'generation' | 'tool' | 'retrieval' | 'event';
  /** Component type for attribution */
  componentType?: string;
  /** Start timestamp (ISO string) */
  startTime: string;
  /** End timestamp (ISO string) */
  endTime?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Span status */
  status: 'unset' | 'ok' | 'error';
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
  /** Buffer metadata */
  bufferedAt: string;      // When added to buffer
  flushAttempts: number;   // Retry count
}
```

## Creating Spans

### createBufferableSpan()

Helper to create properly structured spans:

```typescript
const span = createBufferableSpan({
  // Required
  name: 'my-operation',
  traceId: 'trace-abc-123',

  // Optional
  spanId: 'span-xyz-789',          // Auto-generated if not provided
  parentSpanId: 'span-parent-456',
  type: 'generation',
  componentType: 'reasoning',
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  durationMs: 1500,
  status: 'ok',
  statusMessage: undefined,
  attributes: { env: 'production' },
  model: 'gpt-4',
  input: 'What is the weather?',
  output: 'The weather is sunny.',
  inputTokens: 10,
  outputTokens: 25,
  toolName: 'weather_api',
  toolInput: '{"location": "NYC"}',
  toolOutput: '{"temp": 72}',
});

buffer.add(span);
```

## Buffer Operations

### Adding Spans

```typescript
// Add single span
buffer.add(span);

// Add multiple spans
buffer.addBatch([span1, span2, span3]);
```

### Flushing

```typescript
// Flush all buffered spans
const result = await buffer.flush();
console.log(`Flushed: ${result.success} success, ${result.failed} failed`);

// Replay from disk (after restart)
const replayResult = await buffer.replay();
```

### Flush Result

```typescript
interface FlushResult {
  /** Number of spans successfully flushed */
  success: number;
  /** Number of spans that failed */
  failed: number;
  /** Spans that failed (for retry) */
  failedSpans?: BufferedSpan[];
  /** Error message if any */
  error?: string;
}
```

### Timer Control

```typescript
// Start auto-flush timer
buffer.startFlushTimer();

// Stop auto-flush timer
buffer.stopFlushTimer();
```

### Clearing

```typescript
// Clear all buffered spans
await buffer.clear();
```

### Shutdown

```typescript
// Graceful shutdown
await buffer.shutdown();
// - Stops flush timer
// - Flushes pending writes to disk
// - Attempts final flush to backend
// - Saves remaining buffer to disk
// - Releases file lock
```

## Monitoring

### Buffer Statistics

```typescript
const stats = buffer.getStats();

console.log({
  size: stats.size,              // Current buffer size
  maxSize: stats.maxSize,        // Maximum capacity
  totalAdded: stats.totalAdded,  // Spans added since creation
  totalFlushed: stats.totalFlushed,  // Spans successfully flushed
  totalFailed: stats.totalFailed,    // Spans that failed
  isPersisted: stats.isPersisted,    // Using disk persistence?
  lastFlushAt: stats.lastFlushAt,    // Last successful flush
  lastErrorAt: stats.lastErrorAt,    // Last error
  oldestSpanAt: stats.oldestSpanAt,  // Oldest span in buffer
  pendingWrites: stats.pendingWrites, // Pending disk writes
});
```

### Health Check

```typescript
import { isBufferHealthy } from '@neon/sdk';

const { healthy, warnings } = isBufferHealthy(buffer);

if (!healthy) {
  console.warn('Buffer issues detected:');
  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }
}
```

Health checks for:
- Buffer filling up (>90% capacity)
- Stale data (oldest span > 5 minutes)
- Recent errors (< 1 minute ago)
- High failure rate (>10%)
- Pending writes backlog (>100)

### Inspecting Buffer Contents

```typescript
// Get current buffer contents (read-only)
const spans = buffer.getBuffer();
for (const span of spans) {
  console.log(`${span.name}: ${span.status}`);
}
```

## Persistence

### Disk Storage

When `persistPath` is set, spans are written to disk in JSONL format:

```typescript
const buffer = createOfflineBuffer({
  persistPath: './traces/buffer.jsonl',
});

// Initialize loads existing data
await buffer.initialize();
```

The file format is one JSON object per line:
```json
{"spanId":"abc","traceId":"xyz","name":"op1",...}
{"spanId":"def","traceId":"xyz","name":"op2",...}
```

### Batched Writes

Writes are batched for efficiency:

```typescript
const buffer = createOfflineBuffer({
  persistPath: './buffer.jsonl',
  writeBatchInterval: 2000,  // Batch writes every 2 seconds
});
```

### File Locking

The buffer uses file locks for cross-process safety:

```typescript
const buffer = createOfflineBuffer({
  persistPath: './shared-buffer.jsonl',
  lockTimeout: 15000,  // Wait up to 15 seconds for lock
});
```

## Error Handling

### Flush Errors

Failed spans are automatically retried:

```typescript
const buffer = createOfflineBuffer({
  maxRetries: 5,       // Retry up to 5 times
  retryDelay: 3000,    // Wait 3 seconds between retries
  onFlush: async (spans) => {
    try {
      await api.ingest(spans);
      return { success: spans.length, failed: 0 };
    } catch (error) {
      // Return which spans failed
      return {
        success: 0,
        failed: spans.length,
        failedSpans: spans,
        error: error.message,
      };
    }
  },
  onError: (error, failedSpans) => {
    console.error('Flush error:', error);
    if (failedSpans) {
      console.error(`Failed spans: ${failedSpans.length}`);
    }
  },
});
```

### Partial Failures

Handle partial success in flush handler:

```typescript
onFlush: async (spans) => {
  const results = await Promise.allSettled(
    spans.map(span => api.ingest(span))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected');

  return {
    success: succeeded,
    failed: failed.length,
    failedSpans: spans.filter((_, i) => results[i].status === 'rejected'),
  };
}
```

## Use Cases

### 1. Edge/IoT Agents

Agents running on devices with intermittent connectivity:

```typescript
const buffer = await createAndInitializeOfflineBuffer({
  persistPath: '/var/agent/trace-buffer.jsonl',
  maxSize: 10000,
  flushInterval: 300000,  // 5 minutes
  onFlush: async (spans) => {
    if (!navigator.onLine) {
      // Still offline, return all as failed
      return { success: 0, failed: spans.length, failedSpans: spans };
    }
    return await sendToCloud(spans);
  },
});

// Listen for connectivity changes
window.addEventListener('online', () => buffer.flush());
```

### 2. Batch Processing

Collect spans during batch job, flush at end:

```typescript
const buffer = createOfflineBuffer({
  flushStrategy: 'manual',
  maxSize: 100000,
});

for (const item of batchItems) {
  const result = await processItem(item);
  buffer.add(createBufferableSpan({
    name: 'process-item',
    traceId: batchTraceId,
    attributes: { itemId: item.id },
    ...result.span,
  }));
}

// Flush all at once
await buffer.flush();
```

### 3. High-Throughput Buffering

Handle high-volume tracing with size limits:

```typescript
const buffer = createOfflineBuffer({
  maxSize: 5000,
  flushInterval: 5000,  // Every 5 seconds
  flushStrategy: 'hybrid',
  onFlush: async (spans) => {
    await tracingBackend.batchIngest(spans);
    return { success: spans.length, failed: 0 };
  },
});
```

### 4. Graceful Degradation

Continue operation even when tracing backend is down:

```typescript
const buffer = createOfflineBuffer({
  persistPath: './fallback-buffer.jsonl',
  maxRetries: 3,
  onFlush: async (spans) => {
    try {
      await tracingService.send(spans);
      return { success: spans.length, failed: 0 };
    } catch (error) {
      // Log warning but don't crash
      console.warn('Tracing service unavailable:', error.message);
      return { success: 0, failed: spans.length, failedSpans: spans };
    }
  },
  onError: (error) => {
    // Spans will be persisted and retried later
    console.warn('Tracing error (will retry):', error.message);
  },
});
```

### 5. Testing with Buffer

Capture traces during tests:

```typescript
import { OfflineBuffer } from '@neon/sdk';

describe('Agent Tracing', () => {
  let buffer: OfflineBuffer;

  beforeEach(() => {
    buffer = new OfflineBuffer({ flushStrategy: 'manual' });
  });

  test('should generate expected traces', async () => {
    // Run agent with buffer
    await runAgentWithTracing(buffer);

    const spans = buffer.getBuffer();
    expect(spans).toHaveLength(5);
    expect(spans[0].type).toBe('generation');
  });

  afterEach(async () => {
    await buffer.clear();
  });
});
```

### 6. Multi-Process Coordination

Share buffer across worker processes:

```typescript
// Each worker uses the same persist path with file locking
const buffer = await createAndInitializeOfflineBuffer({
  persistPath: '/shared/trace-buffer.jsonl',
  lockTimeout: 30000,  // Wait up to 30s for lock
});

// Centralized flusher (separate process)
async function flusherProcess() {
  const buffer = await createAndInitializeOfflineBuffer({
    persistPath: '/shared/trace-buffer.jsonl',
    flushStrategy: 'time',
    flushInterval: 10000,
    onFlush: sendToTraceServer,
  });
}
```

## Best Practices

1. **Always initialize** - Call `initialize()` before using the buffer to load persisted data.

2. **Handle shutdown** - Use `shutdown()` to ensure data isn't lost on process exit.

3. **Set appropriate limits** - Size `maxSize` based on available memory and expected throughput.

4. **Enable persistence** - Use `persistPath` for production to survive crashes.

5. **Monitor health** - Use `isBufferHealthy()` to catch issues early.

6. **Handle partial failures** - Return specific failed spans from `onFlush` for retry.

7. **Log errors** - Use `onError` to track and alert on issues.

8. **Test offline scenarios** - Simulate network failures to verify buffer behavior.

## Related

- [SDK Overview](../sdk.md) - General SDK documentation
- [Test Suites](../test-suites.md) - Testing with traces
- [Configuration](../configuration.md) - SDK configuration options
