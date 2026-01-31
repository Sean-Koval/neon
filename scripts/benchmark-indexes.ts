#!/usr/bin/env bun
/**
 * ClickHouse Index Benchmark Script
 *
 * Measures query performance before and after applying skip indexes.
 * Run this script before applying migration 003_add_indexes.sql,
 * then run again after to compare performance.
 *
 * Usage:
 *   cd frontend && bun run ../scripts/benchmark-indexes.ts
 *
 * Environment:
 *   CLICKHOUSE_URL - ClickHouse connection URL (default: http://localhost:8123)
 *   CLICKHOUSE_DATABASE - Database name (default: neon)
 */

import { createClient, type ClickHouseClient } from "@clickhouse/client";

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || "http://localhost:8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "neon";

interface BenchmarkResult {
  query: string;
  description: string;
  elapsed_ms: number;
  rows_read: number;
  bytes_read: number;
  index_used: boolean;
}

async function createClient_(): ClickHouseClient {
  return createClient({
    url: CLICKHOUSE_URL,
    database: CLICKHOUSE_DATABASE,
  });
}

/**
 * Run a query and return benchmark metrics
 */
async function benchmarkQuery(
  client: ClickHouseClient,
  description: string,
  query: string
): Promise<BenchmarkResult> {
  // First, explain to check index usage
  const explainQuery = `EXPLAIN indexes = 1 ${query}`;
  const explainResult = await client.query({
    query: explainQuery,
    format: "TabSeparated",
  });
  const explainText = await explainResult.text();
  const indexUsed =
    explainText.includes("Skip") ||
    explainText.includes("Granules:") ||
    explainText.includes("Parts:");

  // Now run the actual query with metrics
  const start = performance.now();
  const result = await client.query({
    query,
    format: "JSON",
  });
  const elapsed = performance.now() - start;

  const data = await result.json<{
    statistics: {
      elapsed: number;
      rows_read: number;
      bytes_read: number;
    };
  }>();

  return {
    query: query.slice(0, 100) + (query.length > 100 ? "..." : ""),
    description,
    elapsed_ms: Math.round(elapsed * 100) / 100,
    rows_read: data.statistics?.rows_read || 0,
    bytes_read: data.statistics?.bytes_read || 0,
    index_used: indexUsed,
  };
}

/**
 * Get sample IDs from the database for realistic queries
 */
async function getSampleIds(client: ClickHouseClient): Promise<{
  projectId: string;
  traceId: string;
  spanId: string;
  runId: string;
  scoreName: string;
}> {
  // Get a sample project_id
  const projectResult = await client.query({
    query: "SELECT project_id FROM traces LIMIT 1",
    format: "JSONEachRow",
  });
  const projects = await projectResult.json<{ project_id: string }>();
  const projectId = projects[0]?.project_id || "test-project";

  // Get a sample trace_id
  const traceResult = await client.query({
    query: `SELECT trace_id FROM traces WHERE project_id = '${projectId}' LIMIT 1`,
    format: "JSONEachRow",
  });
  const traces = await traceResult.json<{ trace_id: string }>();
  const traceId = traces[0]?.trace_id || "test-trace";

  // Get a sample span_id
  const spanResult = await client.query({
    query: `SELECT span_id FROM spans WHERE project_id = '${projectId}' LIMIT 1`,
    format: "JSONEachRow",
  });
  const spans = await spanResult.json<{ span_id: string }>();
  const spanId = spans[0]?.span_id || "test-span";

  // Get a sample run_id
  const runResult = await client.query({
    query: `SELECT run_id FROM traces WHERE project_id = '${projectId}' AND run_id IS NOT NULL LIMIT 1`,
    format: "JSONEachRow",
  });
  const runs = await runResult.json<{ run_id: string }>();
  const runId = runs[0]?.run_id || "test-run";

  // Get a sample score name
  const scoreResult = await client.query({
    query: `SELECT name FROM scores WHERE project_id = '${projectId}' LIMIT 1`,
    format: "JSONEachRow",
  });
  const scores = await scoreResult.json<{ name: string }>();
  const scoreName = scores[0]?.name || "accuracy";

  return { projectId, traceId, spanId, runId, scoreName };
}

/**
 * Check current index status
 */
async function checkIndexes(client: ClickHouseClient): Promise<void> {
  console.log("\n=== Current Indexes ===\n");

  for (const table of ["traces", "spans", "scores"]) {
    const result = await client.query({
      query: `
        SELECT name, type_full, expr, granularity
        FROM system.data_skipping_indices
        WHERE database = '${CLICKHOUSE_DATABASE}' AND table = '${table}'
        ORDER BY name
      `,
      format: "JSONEachRow",
    });

    const indexes = await result.json<{
      name: string;
      type_full: string;
      expr: string;
      granularity: number;
    }>();

    if (indexes.length === 0) {
      console.log(`${table}: No skip indexes defined`);
    } else {
      console.log(`${table}:`);
      for (const idx of indexes) {
        console.log(`  - ${idx.name}: ${idx.type_full} on ${idx.expr} (granularity: ${idx.granularity})`);
      }
    }
  }
}

/**
 * Run all benchmarks
 */
async function runBenchmarks(): Promise<void> {
  console.log("ClickHouse Index Benchmark");
  console.log("==========================");
  console.log(`URL: ${CLICKHOUSE_URL}`);
  console.log(`Database: ${CLICKHOUSE_DATABASE}`);

  const client = await createClient_();

  try {
    // Check current indexes
    await checkIndexes(client);

    // Get sample IDs for queries
    console.log("\n=== Getting Sample IDs ===\n");
    const { projectId, traceId, spanId, runId, scoreName } = await getSampleIds(client);
    console.log(`Using project_id: ${projectId}`);
    console.log(`Using trace_id: ${traceId}`);
    console.log(`Using span_id: ${spanId}`);
    console.log(`Using run_id: ${runId}`);
    console.log(`Using score name: ${scoreName}`);

    // Define benchmark queries
    const queries: { description: string; query: string }[] = [
      // Traces queries
      {
        description: "Trace by trace_id (bloom_filter)",
        query: `SELECT * FROM traces WHERE project_id = '${projectId}' AND trace_id = '${traceId}' LIMIT 1`,
      },
      {
        description: "Traces by status (set index)",
        query: `SELECT count() FROM traces WHERE project_id = '${projectId}' AND status = 'error'`,
      },
      {
        description: "Traces by run_id (bloom_filter)",
        query: `SELECT * FROM traces WHERE project_id = '${projectId}' AND run_id = '${runId}'`,
      },
      {
        description: "Traces in time range (minmax)",
        query: `SELECT count() FROM traces WHERE project_id = '${projectId}' AND timestamp >= now() - INTERVAL 7 DAY`,
      },

      // Spans queries
      {
        description: "Span by span_id (bloom_filter)",
        query: `SELECT * FROM spans WHERE project_id = '${projectId}' AND span_id = '${spanId}' LIMIT 1`,
      },
      {
        description: "Spans by span_type (set index)",
        query: `SELECT count() FROM spans WHERE project_id = '${projectId}' AND span_type = 'generation'`,
      },
      {
        description: "Spans by model (bloom_filter)",
        query: `SELECT count() FROM spans WHERE project_id = '${projectId}' AND model = 'gpt-4'`,
      },
      {
        description: "Spans by tool_name (bloom_filter)",
        query: `SELECT count() FROM spans WHERE project_id = '${projectId}' AND tool_name IS NOT NULL`,
      },

      // Scores queries
      {
        description: "Scores by span_id (bloom_filter)",
        query: `SELECT * FROM scores WHERE project_id = '${projectId}' AND span_id = '${spanId}'`,
      },
      {
        description: "Scores by name (bloom_filter)",
        query: `SELECT avg(value) FROM scores WHERE project_id = '${projectId}' AND name = '${scoreName}'`,
      },
      {
        description: "Scores by source (set index)",
        query: `SELECT count() FROM scores WHERE project_id = '${projectId}' AND source = 'eval'`,
      },
      {
        description: "Scores by run_id (bloom_filter)",
        query: `SELECT * FROM scores WHERE project_id = '${projectId}' AND run_id = '${runId}'`,
      },
    ];

    // Run benchmarks
    console.log("\n=== Running Benchmarks ===\n");
    const results: BenchmarkResult[] = [];

    for (const { description, query } of queries) {
      // Run each query 3 times to warm up and get stable results
      for (let i = 0; i < 3; i++) {
        await benchmarkQuery(client, description, query);
      }
      // Record final run
      const result = await benchmarkQuery(client, description, query);
      results.push(result);
      console.log(
        `${result.description}: ${result.elapsed_ms}ms (${result.rows_read.toLocaleString()} rows, ${(result.bytes_read / 1024).toFixed(1)}KB)`
      );
    }

    // Summary
    console.log("\n=== Summary ===\n");
    console.log("Query Type                              | Time (ms) | Rows Read  | Data Read");
    console.log("-".repeat(85));
    for (const result of results) {
      const desc = result.description.padEnd(40);
      const time = result.elapsed_ms.toString().padStart(9);
      const rows = result.rows_read.toLocaleString().padStart(10);
      const bytes = `${(result.bytes_read / 1024).toFixed(1)}KB`.padStart(10);
      console.log(`${desc}| ${time} | ${rows} | ${bytes}`);
    }

    // Total stats
    const totalTime = results.reduce((sum, r) => sum + r.elapsed_ms, 0);
    const totalRows = results.reduce((sum, r) => sum + r.rows_read, 0);
    const totalBytes = results.reduce((sum, r) => sum + r.bytes_read, 0);
    console.log("-".repeat(85));
    console.log(
      `${"TOTAL".padEnd(40)}| ${totalTime.toFixed(2).padStart(9)} | ${totalRows.toLocaleString().padStart(10)} | ${(totalBytes / 1024).toFixed(1).padStart(9)}KB`
    );

    // Save results to file for comparison
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsFile = `/tmp/benchmark-results-${timestamp}.json`;
    await Bun.write(
      resultsFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          database: CLICKHOUSE_DATABASE,
          results,
          summary: {
            total_time_ms: totalTime,
            total_rows_read: totalRows,
            total_bytes_read: totalBytes,
          },
        },
        null,
        2
      )
    );
    console.log(`\nResults saved to: ${resultsFile}`);
  } finally {
    await client.close();
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);
