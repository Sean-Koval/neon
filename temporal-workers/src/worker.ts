/**
 * Temporal Worker Entry Point
 *
 * This is the main entry point for the Temporal worker process.
 * It registers workflows and activities, then starts polling for tasks.
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";

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
};

/**
 * Run the Temporal worker
 */
async function run(): Promise<void> {
  console.log("Starting Temporal worker...");
  console.log(`Temporal address: ${config.temporalAddress}`);
  console.log(`Namespace: ${config.namespace}`);
  console.log(`Task queue: ${config.taskQueue}`);

  // Connect to Temporal server
  const connection = await NativeConnection.connect({
    address: config.temporalAddress,
  });

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: new URL("./workflows/index.js", import.meta.url).pathname,
    activities,
    maxConcurrentActivityTaskExecutions: config.maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflowTaskExecutions: config.maxConcurrentWorkflowTaskExecutions,
  });

  console.log("Worker created, starting to poll for tasks...");

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.shutdown();
    await connection.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the worker
  await worker.run();
}

// Run the worker
run().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
