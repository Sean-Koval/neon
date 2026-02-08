/**
 * Temporal Worker Entry Point
 *
 * This is the main entry point for the Temporal worker process.
 * It registers workflows and activities, then starts polling for tasks.
 *
 * Environment variables:
 * - TEMPORAL_ADDRESS: Temporal server address (default: localhost:7233)
 * - TEMPORAL_NAMESPACE: Temporal namespace (default: default)
 * - TEMPORAL_TASK_QUEUE: Task queue name (default: agent-workers)
 * - MAX_CONCURRENT_ACTIVITIES: Max concurrent activity tasks (default: 10)
 * - MAX_CONCURRENT_WORKFLOWS: Max concurrent workflow tasks (default: 5)
 * - NEON_API_URL: Neon API URL for ClickHouse access (default: http://localhost:3000)
 * - ANTHROPIC_API_KEY: Anthropic API key for LLM calls
 * - DEFAULT_PROJECT_ID: Default project ID for traces
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";
import { initInstrumentation, shutdownInstrumentation } from "./instrumentation";
import {
  getWorkflowInterceptorModules,
  getActivityInterceptorFactory,
  getWorkflowSinks,
} from "./interceptors/tracing";

/**
 * Worker configuration from environment
 */
const config = {
  temporalAddress: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  namespace: process.env.TEMPORAL_NAMESPACE || "default",
  taskQueue: process.env.TEMPORAL_TASK_QUEUE || "agent-workers",
  maxConcurrentActivityTaskExecutions:
    parseInt(process.env.MAX_CONCURRENT_ACTIVITIES || "10"),
  maxConcurrentWorkflowTaskExecutions:
    parseInt(process.env.MAX_CONCURRENT_WORKFLOWS || "5"),
  // Retry configuration
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "10"),
  reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY_MS || "5000"),
};

/**
 * Logger with timestamp
 */
function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    console[level](`${prefix} ${message}`, data);
  } else {
    console[level](`${prefix} ${message}`);
  }
}

/**
 * Connect to Temporal with retry logic
 */
async function connectWithRetry(): Promise<NativeConnection> {
  let attempts = 0;

  while (attempts < config.maxReconnectAttempts) {
    try {
      log("info", `Connecting to Temporal at ${config.temporalAddress}...`);
      const connection = await NativeConnection.connect({
        address: config.temporalAddress,
      });
      log("info", "Connected to Temporal successfully");
      return connection;
    } catch (err) {
      attempts++;
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      log("warn", `Connection attempt ${attempts}/${config.maxReconnectAttempts} failed: ${errorMessage}`);

      if (attempts >= config.maxReconnectAttempts) {
        throw new Error(`Failed to connect to Temporal after ${attempts} attempts: ${errorMessage}`);
      }

      log("info", `Retrying in ${config.reconnectDelayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, config.reconnectDelayMs));
    }
  }

  throw new Error("Unreachable");
}

/**
 * Run the Temporal worker
 */
async function run(): Promise<void> {
  log("info", "Starting Neon Temporal Worker", {
    version: "0.1.0",
    taskQueue: config.taskQueue,
    namespace: config.namespace,
    temporalAddress: config.temporalAddress,
    maxConcurrentActivities: config.maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflows: config.maxConcurrentWorkflowTaskExecutions,
  });

  // Initialize OpenTelemetry instrumentation
  initInstrumentation();
  log("info", "OpenTelemetry instrumentation initialized");

  // Validate required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    log("warn", "ANTHROPIC_API_KEY not set - LLM calls will fail");
  }

  // Connect to Temporal server with retry
  const connection = await connectWithRetry();

  // Create worker with OTel interceptors
  log("info", "Creating worker...");
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: new URL("./workflows/index.js", import.meta.url).pathname,
    activities,
    maxConcurrentActivityTaskExecutions: config.maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflowTaskExecutions: config.maxConcurrentWorkflowTaskExecutions,
    // Enable sticky execution for better performance
    stickyQueueScheduleToStartTimeout: "10s",
    // OTel tracing interceptors for workflow and activity spans
    interceptors: {
      workflowModules: getWorkflowInterceptorModules(),
      activity: [getActivityInterceptorFactory()],
    },
    sinks: getWorkflowSinks(),
  });

  log("info", "Worker created successfully");
  log("info", "Registered workflows: evalRunWorkflow, parallelEvalRunWorkflow, evalCaseWorkflow, agentRunWorkflow, abTestWorkflow, progressiveRolloutWorkflow");
  log("info", "Registered activities: llmCall, executeTool, emitSpan, scoreTrace, healthCheck, ping");

  // Handle shutdown gracefully
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      log("warn", "Shutdown already in progress, forcing exit...");
      process.exit(1);
    }
    isShuttingDown = true;

    log("info", `Received ${signal}, shutting down gracefully...`);
    try {
      await worker.shutdown();
      log("info", "Worker shut down successfully");
      await shutdownInstrumentation();
      log("info", "OpenTelemetry instrumentation shut down");
      await connection.close();
      log("info", "Connection closed");
      process.exit(0);
    } catch (err) {
      log("error", "Error during shutdown", { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start the worker
  log("info", "Starting to poll for tasks...");
  await worker.run();
}

// Run the worker
run().catch((err) => {
  log("error", "Worker failed to start", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
