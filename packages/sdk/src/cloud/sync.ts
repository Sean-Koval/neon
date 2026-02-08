/**
 * Cloud Sync Service
 *
 * Handles background syncing of evaluation results to the Neon server.
 * Designed to work silently without blocking local evaluation execution.
 */

import type { SuiteResult } from "../test/index.js";
import {
  NeonCloudClient,
  createCloudClientFromEnv,
  CloudSyncError,
  type EvalSyncPayload,
  type SyncResponse,
} from "./client.js";

/**
 * Sync options
 */
export interface SyncOptions {
  /** Custom cloud client (uses env vars if not provided) */
  client?: NeonCloudClient;
  /** Additional metadata to include with the sync */
  metadata?: Record<string, unknown>;
  /** Whether to throw errors (default: false - logs warning instead) */
  throwOnError?: boolean;
  /** Custom logger (default: console) */
  logger?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Whether the sync was successful */
  success: boolean;
  /** Server response if successful */
  response?: SyncResponse;
  /** Error if sync failed */
  error?: string;
  /** Whether sync was skipped (not configured) */
  skipped?: boolean;
}

const defaultLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};

/**
 * Sync evaluation results to the Neon server
 *
 * This function is designed to be called after local evaluation completes.
 * It handles errors gracefully and never blocks the main evaluation flow.
 *
 * @param results - Array of suite results to sync
 * @param options - Sync options
 * @returns Promise resolving to sync results for each suite
 */
export async function syncResultsToCloud(
  results: SuiteResult[],
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  const logger = options.logger ?? defaultLogger;
  const client = options.client ?? createCloudClientFromEnv();

  // If no client configured, skip silently
  if (!client) {
    return results.map(() => ({
      success: false,
      skipped: true,
    }));
  }

  const syncResults: SyncResult[] = [];

  for (const result of results) {
    try {
      const payload = NeonCloudClient.createPayload(result, options.metadata);
      const response = await client.syncResults(payload);

      syncResults.push({
        success: true,
        response,
      });
    } catch (error) {
      const errorMessage =
        error instanceof CloudSyncError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";

      if (options.throwOnError) {
        throw error;
      }

      logger.warn(`Failed to sync results for suite "${result.name}": ${errorMessage}`);

      syncResults.push({
        success: false,
        error: errorMessage,
      });
    }
  }

  return syncResults;
}

/**
 * Sync a single suite result to the cloud
 */
export async function syncSuiteResult(
  result: SuiteResult,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const results = await syncResultsToCloud([result], options);
  return results[0];
}

/**
 * Create a background sync promise that doesn't block
 *
 * This returns a promise that resolves to the sync results,
 * but the caller doesn't need to await it for the main flow to continue.
 *
 * @example
 * ```typescript
 * // Fire and forget - results sync in background
 * const syncPromise = createBackgroundSync(results);
 *
 * // Main flow continues immediately
 * console.log("Evaluation complete!");
 *
 * // Optionally check sync results later
 * const syncResults = await syncPromise;
 * ```
 */
export function createBackgroundSync(
  results: SuiteResult[],
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  // Return promise that handles its own errors
  return syncResultsToCloud(results, {
    ...options,
    throwOnError: false,
  }).catch((error) => {
    const logger = options.logger ?? defaultLogger;
    logger.warn(`Background sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    return results.map(() => ({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  });
}

/**
 * Format sync results for CLI output
 */
export function formatSyncStatus(
  results: SyncResult[],
  verbose = false
): string {
  const total = results.length;
  const skipped = results.filter((r) => r.skipped).length;
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success && !r.skipped).length;

  // All skipped - cloud sync not configured
  if (skipped === total) {
    if (verbose) {
      return "Cloud sync: Not configured (set NEON_API_URL and NEON_API_KEY to enable)";
    }
    return "";
  }

  // All successful
  if (successful === total) {
    const firstResponse = results.find((r) => r.response);
    if (firstResponse?.response?.dashboardUrl) {
      return `Results synced to Neon: ${firstResponse.response.dashboardUrl}`;
    }
    return "Results synced to Neon";
  }

  // Some or all failed
  if (failed > 0) {
    const failedSuites = results.filter((r) => !r.success && !r.skipped);
    if (verbose && failedSuites.length > 0) {
      const errors = failedSuites.map((r) => r.error).join(", ");
      return `Warning: Failed to sync ${failed}/${total} suite(s) to Neon: ${errors}`;
    }
    return `Warning: Failed to sync ${failed}/${total} suite(s) to Neon`;
  }

  return "";
}
