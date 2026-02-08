/**
 * Trace Consumer - Kafka/Redpanda to ClickHouse
 *
 * Consumes OTel trace spans from the `neon.traces.spans` topic,
 * batches them, and inserts into ClickHouse. Uses a time-or-size
 * flushing strategy: flush after 1000 spans or 5 seconds, whichever
 * comes first.
 *
 * Dead-letter: Messages that fail after retries are sent to
 * `neon.traces.dlq` for manual inspection.
 *
 * Usage:
 *   import { startTraceConsumer, stopTraceConsumer } from './consumers/trace-consumer'
 *   await startTraceConsumer()
 *   // ... on shutdown:
 *   await stopTraceConsumer()
 */

import { Kafka, type Consumer, type Producer, type EachBatchPayload } from 'kafkajs'

const KAFKA_BROKERS = (process.env.REDPANDA_BROKERS || 'localhost:9092').split(',')
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DATABASE || 'neon'

const SPANS_TOPIC = 'neon.traces.spans'
const DLQ_TOPIC = 'neon.traces.dlq'
const CONSUMER_GROUP = 'neon-trace-consumer'

/** Flush after this many spans */
const BATCH_SIZE = 1000
/** Flush after this many milliseconds */
const FLUSH_INTERVAL_MS = 5000
/** Max retries before sending to DLQ */
const MAX_RETRIES = 3

interface SpanBatch {
  spans: unknown[]
  timer: ReturnType<typeof setTimeout> | null
}

let consumer: Consumer | null = null
let producer: Producer | null = null
let batch: SpanBatch = { spans: [], timer: null }

/**
 * Insert a batch of spans into ClickHouse via the Neon API.
 * Uses the existing /api/v1/traces endpoint format.
 */
async function flushToClickHouse(spans: unknown[]): Promise<void> {
  if (spans.length === 0) return

  const neonApiUrl = process.env.NEON_API_URL || 'http://localhost:3000'
  const projectId = process.env.DEFAULT_PROJECT_ID || '00000000-0000-0000-0000-000000000001'

  // Wrap spans in OTLP format for the ingestion API
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: 'neon-trace-consumer', version: '0.1.0' },
            spans,
          },
        ],
      },
    ],
  }

  const response = await fetch(`${neonApiUrl}/api/v1/traces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.NEON_API_KEY || 'neon-internal',
      'x-workspace-id': projectId,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ClickHouse insert failed (${response.status}): ${text}`)
  }

  console.log(`[trace-consumer] Flushed ${spans.length} spans to ClickHouse`)
}

/**
 * Send a failed message to the dead-letter topic.
 */
async function sendToDlq(message: unknown, error: Error): Promise<void> {
  if (!producer) return

  try {
    await producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          value: JSON.stringify({
            originalMessage: message,
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    })
    console.warn(`[trace-consumer] Sent message to DLQ: ${error.message}`)
  } catch (dlqErr) {
    console.error('[trace-consumer] Failed to send to DLQ:', dlqErr)
  }
}

/**
 * Flush the current batch.
 */
async function flush(): Promise<void> {
  if (batch.timer) {
    clearTimeout(batch.timer)
    batch.timer = null
  }

  const spans = batch.spans
  batch.spans = []

  if (spans.length === 0) return

  let retries = 0
  while (retries < MAX_RETRIES) {
    try {
      await flushToClickHouse(spans)
      return
    } catch (err) {
      retries++
      console.warn(
        `[trace-consumer] Flush attempt ${retries}/${MAX_RETRIES} failed:`,
        err instanceof Error ? err.message : err,
      )
      if (retries >= MAX_RETRIES) {
        // Send entire batch to DLQ
        await sendToDlq(spans, err instanceof Error ? err : new Error(String(err)))
        return
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * retries))
    }
  }
}

/**
 * Schedule a timer-based flush if not already scheduled.
 */
function scheduleFlush(): void {
  if (batch.timer) return
  batch.timer = setTimeout(() => {
    flush().catch((err) =>
      console.error('[trace-consumer] Timer flush error:', err),
    )
  }, FLUSH_INTERVAL_MS)
}

/**
 * Start the trace consumer.
 */
export async function startTraceConsumer(): Promise<void> {
  const kafka = new Kafka({
    clientId: 'neon-trace-consumer',
    brokers: KAFKA_BROKERS,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  })

  // Create producer for DLQ
  producer = kafka.producer()
  await producer.connect()

  // Create consumer
  consumer = kafka.consumer({ groupId: CONSUMER_GROUP })
  await consumer.connect()
  await consumer.subscribe({ topic: SPANS_TOPIC, fromBeginning: false })

  console.log(`[trace-consumer] Connected to ${KAFKA_BROKERS.join(', ')}`)
  console.log(`[trace-consumer] Subscribing to ${SPANS_TOPIC}`)
  console.log(
    `[trace-consumer] Batch config: size=${BATCH_SIZE}, interval=${FLUSH_INTERVAL_MS}ms`,
  )

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      try {
        const span = JSON.parse(message.value.toString())
        batch.spans.push(span)

        if (batch.spans.length >= BATCH_SIZE) {
          await flush()
        } else {
          scheduleFlush()
        }
      } catch (err) {
        console.error('[trace-consumer] Failed to parse message:', err)
        await sendToDlq(
          message.value.toString(),
          err instanceof Error ? err : new Error(String(err)),
        )
      }
    },
  })
}

/**
 * Gracefully stop the trace consumer, flushing pending spans.
 */
export async function stopTraceConsumer(): Promise<void> {
  console.log('[trace-consumer] Shutting down...')

  // Flush remaining spans
  await flush()

  if (consumer) {
    await consumer.disconnect()
    consumer = null
  }

  if (producer) {
    await producer.disconnect()
    producer = null
  }

  console.log('[trace-consumer] Shut down complete')
}
