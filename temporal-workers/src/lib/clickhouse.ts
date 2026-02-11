/**
 * ClickHouse Client for Temporal Workers
 *
 * Singleton client with query helpers for training activities.
 * The worker process runs separately from Next.js, so needs its own client.
 */

import { type ClickHouseClient, createClient } from "@clickhouse/client";

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
      database: process.env.CLICKHOUSE_DATABASE || "neon",
      request_timeout: 30_000,
      max_open_connections: 10,
      keep_alive: { enabled: true },
    });
  }
  return client;
}

export async function closeClickHouseClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

// ============================================================================
// Training Signal Types
// ============================================================================

export interface TrainingSignal {
  type: "preference" | "correction" | "low_score" | "error";
  traceId: string;
  spanId?: string;
  content: string;
  score?: number;
  timestamp: string;
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Query feedback signals (preference/correction) from the feedback table.
 */
export async function queryFeedbackSignals(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<TrainingSignal[]> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        type,
        comparison_id as trace_id,
        response_id as span_id,
        if(type = 'preference', concat('choice:', choice, ' reason:', reason),
           concat('original:', original_content, ' corrected:', corrected_content)) as content,
        confidence as score,
        created_at as timestamp
      FROM feedback
      WHERE project_id = {projectId:String}
        AND created_at >= {startDate:DateTime64(3)}
        AND created_at <= {endDate:DateTime64(3)}
      ORDER BY created_at DESC
      LIMIT 1000
    `,
    query_params: { projectId, startDate, endDate },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    type: "preference" | "correction";
    trace_id: string;
    span_id: string;
    content: string;
    score: number;
    timestamp: string;
  }>();

  return rows.map((r) => ({
    type: r.type,
    traceId: r.trace_id,
    spanId: r.span_id || undefined,
    content: r.content,
    score: r.score || undefined,
    timestamp: r.timestamp,
  }));
}

/**
 * Query traces with scores below a threshold.
 */
export async function queryLowScoreTraces(
  projectId: string,
  startDate: string,
  endDate: string,
  threshold: number,
): Promise<TrainingSignal[]> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        s.trace_id as trace_id,
        s.span_id as span_id,
        s.name as scorer_name,
        s.value as score,
        s.comment as comment,
        s.timestamp as timestamp
      FROM scores s
      WHERE s.project_id = {projectId:String}
        AND s.value < {threshold:Float64}
        AND s.timestamp >= {startDate:DateTime64(3)}
        AND s.timestamp <= {endDate:DateTime64(3)}
      ORDER BY s.value ASC
      LIMIT 500
    `,
    query_params: { projectId, startDate, endDate, threshold },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    trace_id: string;
    span_id: string;
    scorer_name: string;
    score: number;
    comment: string;
    timestamp: string;
  }>();

  return rows.map((r) => ({
    type: "low_score" as const,
    traceId: r.trace_id,
    spanId: r.span_id || undefined,
    content: `scorer:${r.scorer_name} comment:${r.comment}`,
    score: r.score,
    timestamp: r.timestamp,
  }));
}

/**
 * Query traces with error status.
 */
export async function queryErrorTraces(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<TrainingSignal[]> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        trace_id,
        name,
        metadata,
        timestamp
      FROM traces
      WHERE project_id = {projectId:String}
        AND status = 'error'
        AND timestamp >= {startDate:DateTime64(3)}
        AND timestamp <= {endDate:DateTime64(3)}
      ORDER BY timestamp DESC
      LIMIT 500
    `,
    query_params: { projectId, startDate, endDate },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    trace_id: string;
    name: string;
    metadata: Record<string, string>;
    timestamp: string;
  }>();

  return rows.map((r) => ({
    type: "error" as const,
    traceId: r.trace_id,
    content: `error_trace:${r.name} metadata:${JSON.stringify(r.metadata)}`,
    timestamp: r.timestamp,
  }));
}

/**
 * Query recent scores for a suite to detect regressions.
 */
export async function queryRecentScores(
  projectId: string,
  suiteId: string,
  limit: number,
): Promise<{ value: number; timestamp: string }[]> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        value,
        timestamp
      FROM scores
      WHERE project_id = {projectId:String}
        AND config_id = {suiteId:String}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { projectId, suiteId, limit },
    format: "JSONEachRow",
  });

  return result.json<{ value: number; timestamp: string }>();
}
