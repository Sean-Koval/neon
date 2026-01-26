/**
 * Score Query APIs
 *
 * APIs for querying and managing scores in ClickHouse.
 */

import type {
  Score,
  ScoreResponse,
  ScoreConfig,
  ScoreInput,
} from "../datamodels/scores";

/**
 * Request parameters for listing scores
 */
export interface ListScoresRequest {
  project_id: string;
  trace_id?: string;
  span_id?: string;
  name?: string;
  source?: string;
  config_id?: string;
  eval_run_id?: string;
  limit?: number;
  offset?: number;
}

/**
 * List scores with optional filtering
 *
 * @route GET /api/scores
 */
export async function listScores(
  req: ListScoresRequest,
  clickhouse: ClickHouseClient
): Promise<ScoreResponse[]> {
  const {
    project_id,
    trace_id,
    span_id,
    name,
    source,
    config_id,
    eval_run_id,
    limit = 100,
    offset = 0,
  } = req;

  let query = `
    SELECT *
    FROM scores
    WHERE project_id = {project_id:String}
  `;
  const params: Record<string, unknown> = { project_id };

  if (trace_id) {
    query += ` AND trace_id = {trace_id:String}`;
    params.trace_id = trace_id;
  }

  if (span_id) {
    query += ` AND span_id = {span_id:String}`;
    params.span_id = span_id;
  }

  if (name) {
    query += ` AND name = {name:String}`;
    params.name = name;
  }

  if (source) {
    query += ` AND source = {source:String}`;
    params.source = source;
  }

  if (config_id) {
    query += ` AND config_id = {config_id:String}`;
    params.config_id = config_id;
  }

  if (eval_run_id) {
    query += ` AND eval_run_id = {eval_run_id:String}`;
    params.eval_run_id = eval_run_id;
  }

  query += `
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;
  params.limit = limit;
  params.offset = offset;

  const result = await clickhouse.query(query, params);
  return result.rows as ScoreResponse[];
}

/**
 * Create a new score
 *
 * @route POST /api/scores
 */
export async function createScore(
  input: ScoreInput,
  clickhouse: ClickHouseClient
): Promise<ScoreResponse> {
  const score_id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const score: Score = {
    project_id: input.project_id as unknown as import("@514labs/moose-lib").Key<string>,
    score_id: score_id as unknown as import("@514labs/moose-lib").Key<string>,
    trace_id: input.trace_id,
    span_id: input.span_id ?? null,
    name: input.name,
    value: input.value,
    score_type: input.score_type ?? "numeric",
    string_value: input.string_value ?? null,
    comment: input.comment ?? "",
    source: input.source ?? "api",
    config_id: input.config_id ?? null,
    timestamp: new Date(timestamp),
    author_id: input.author_id ?? null,
    eval_run_id: input.eval_run_id ?? null,
  };

  await clickhouse.insert("scores", [score]);

  return {
    ...score,
    project_id: input.project_id,
    score_id,
    timestamp,
  } as ScoreResponse;
}

/**
 * Create multiple scores in batch
 *
 * @route POST /api/scores/batch
 */
export async function createScoresBatch(
  inputs: ScoreInput[],
  clickhouse: ClickHouseClient
): Promise<{ created: number }> {
  const timestamp = new Date().toISOString();

  const scores: Score[] = inputs.map((input) => ({
    project_id: input.project_id as unknown as import("@514labs/moose-lib").Key<string>,
    score_id: crypto.randomUUID() as unknown as import("@514labs/moose-lib").Key<string>,
    trace_id: input.trace_id,
    span_id: input.span_id ?? null,
    name: input.name,
    value: input.value,
    score_type: input.score_type ?? "numeric",
    string_value: input.string_value ?? null,
    comment: input.comment ?? "",
    source: input.source ?? "api",
    config_id: input.config_id ?? null,
    timestamp: new Date(timestamp),
    author_id: input.author_id ?? null,
    eval_run_id: input.eval_run_id ?? null,
  }));

  await clickhouse.insert("scores", scores);

  return { created: scores.length };
}

/**
 * Get aggregated scores for a trace
 *
 * @route GET /api/traces/:traceId/scores/summary
 */
export async function getTraceScoresSummary(
  req: { project_id: string; trace_id: string },
  clickhouse: ClickHouseClient
): Promise<ScoreSummary[]> {
  const query = `
    SELECT
      name,
      avg(value) as avg_value,
      min(value) as min_value,
      max(value) as max_value,
      count() as count,
      groupArray(source) as sources
    FROM scores
    WHERE project_id = {project_id:String}
      AND trace_id = {trace_id:String}
    GROUP BY name
    ORDER BY name
  `;

  const result = await clickhouse.query(query, req);
  return result.rows as ScoreSummary[];
}

/**
 * Score summary for aggregation
 */
export interface ScoreSummary {
  name: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  count: number;
  sources: string[];
}

/**
 * List score configurations
 *
 * @route GET /api/score-configs
 */
export async function listScoreConfigs(
  req: { project_id: string },
  clickhouse: ClickHouseClient
): Promise<ScoreConfig[]> {
  const query = `
    SELECT *
    FROM score_configs
    WHERE project_id = {project_id:String}
    ORDER BY name
  `;

  const result = await clickhouse.query(query, req);
  return result.rows as ScoreConfig[];
}

/**
 * Get a single score configuration
 *
 * @route GET /api/score-configs/:configId
 */
export async function getScoreConfig(
  req: { project_id: string; config_id: string },
  clickhouse: ClickHouseClient
): Promise<ScoreConfig | null> {
  const query = `
    SELECT *
    FROM score_configs
    WHERE project_id = {project_id:String}
      AND config_id = {config_id:String}
    LIMIT 1
  `;

  const result = await clickhouse.query(query, req);
  return (result.rows[0] as ScoreConfig) ?? null;
}

/**
 * Create a score configuration
 *
 * @route POST /api/score-configs
 */
export async function createScoreConfig(
  input: Omit<ScoreConfig, "config_id" | "created_at" | "updated_at">,
  clickhouse: ClickHouseClient
): Promise<ScoreConfig> {
  const config_id = crypto.randomUUID();
  const now = new Date();

  const config: ScoreConfig = {
    ...input,
    config_id: config_id as unknown as import("@514labs/moose-lib").Key<string>,
    created_at: now,
    updated_at: now,
  };

  await clickhouse.insert("score_configs", [config]);

  return config;
}

// Type for ClickHouse client (would be provided by MooseStack)
interface ClickHouseClient {
  query(
    sql: string,
    params?: Record<string, unknown>
  ): Promise<{ rows: unknown[] }>;
  insert(table: string, values: unknown[]): Promise<void>;
}
