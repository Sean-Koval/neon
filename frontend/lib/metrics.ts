/**
 * Prometheus Metrics
 *
 * Exports a shared Prometheus registry with custom application metrics.
 * Self-hosters can scrape /api/metrics with Prometheus for monitoring.
 *
 * Metrics:
 * - Default: process CPU, memory, event loop lag, GC
 * - neon_api_requests_total: Counter by method, path, status
 * - neon_api_request_duration_seconds: Histogram by method, path
 * - neon_eval_runs_total: Counter by status
 * - neon_eval_run_duration_seconds: Histogram
 * - neon_active_connections: Gauge (e.g. WebSocket/SSE)
 *
 * @module lib/metrics
 */

import client from 'prom-client'

// Create a dedicated registry
export const register = new client.Registry()

// Collect default Node.js metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register })

// ============================================================================
// Custom Metrics
// ============================================================================

/**
 * Total API requests by method, path, and HTTP status code.
 */
export const apiRequestsTotal = new client.Counter({
  name: 'neon_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
})

/**
 * API request duration in seconds by method and path.
 */
export const apiRequestDuration = new client.Histogram({
  name: 'neon_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

/**
 * Total eval runs by status (COMPLETED, FAILED, CANCELLED).
 */
export const evalRunsTotal = new client.Counter({
  name: 'neon_eval_runs_total',
  help: 'Total number of evaluation runs',
  labelNames: ['status'] as const,
  registers: [register],
})

/**
 * Eval run duration in seconds.
 */
export const evalRunDuration = new client.Histogram({
  name: 'neon_eval_run_duration_seconds',
  help: 'Evaluation run duration in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [register],
})

/**
 * Active connections gauge (SSE debug streams, etc.)
 */
export const activeConnections = new client.Gauge({
  name: 'neon_active_connections',
  help: 'Number of active connections (SSE, WebSocket)',
  registers: [register],
})
