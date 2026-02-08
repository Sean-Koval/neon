/**
 * Neon Cloud API Client
 *
 * Handles syncing evaluation results to a Neon server.
 * Configured via NEON_API_URL and NEON_API_KEY environment variables.
 */

import type { SuiteResult } from "../test/index.js";

/**
 * Cloud client configuration
 */
export interface CloudConfig {
  /** API URL (e.g., https://api.neon.dev) */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Evaluation sync payload
 */
export interface EvalSyncPayload {
  /** Suite name */
  suiteName: string;
  /** Test cases with scores */
  testCases: Array<{
    name: string;
    passed: boolean;
    scores: Array<{
      name: string;
      value: number;
      reason?: string;
    }>;
    durationMs: number;
    error?: string;
  }>;
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  };
  /** Total suite duration in ms */
  durationMs: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp of the evaluation */
  timestamp: string;
}

/**
 * Sync response from the server
 */
export interface SyncResponse {
  /** Evaluation run ID assigned by the server */
  runId: string;
  /** Dashboard URL to view results */
  dashboardUrl?: string;
}

/**
 * Error thrown when cloud sync fails
 */
export class CloudSyncError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "CloudSyncError";
  }
}

/**
 * Neon Cloud API Client
 *
 * Sends evaluation results to a Neon server for storage and visualization.
 */
export class NeonCloudClient {
  private config: Required<CloudConfig>;

  constructor(config: CloudConfig) {
    this.config = {
      apiUrl: config.apiUrl.replace(/\/$/, ""), // Remove trailing slash
      apiKey: config.apiKey,
      timeout: config.timeout ?? 10000,
    };
  }

  /**
   * Check if the client is configured with valid credentials
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiUrl && this.config.apiKey);
  }

  /**
   * Sync evaluation results to the server
   */
  async syncResults(payload: EvalSyncPayload): Promise<SyncResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.apiUrl}/api/eval/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "neon-sdk/0.1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new CloudSyncError(
          `Failed to sync results: ${response.status} ${errorText}`,
          response.status
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof CloudSyncError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new CloudSyncError(
          `Request timed out after ${this.config.timeout}ms`,
          undefined,
          error
        );
      }

      throw new CloudSyncError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convert a SuiteResult to an EvalSyncPayload
   */
  static createPayload(
    result: SuiteResult,
    metadata?: Record<string, unknown>
  ): EvalSyncPayload {
    return {
      suiteName: result.name,
      testCases: result.results.map((r) => ({
        name: r.name,
        passed: r.passed,
        scores: r.scores,
        durationMs: r.durationMs,
        error: r.error,
      })),
      summary: result.summary,
      durationMs: result.durationMs,
      metadata,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Create a cloud client from environment variables
 *
 * Returns undefined if NEON_API_URL or NEON_API_KEY are not set.
 */
export function createCloudClientFromEnv(): NeonCloudClient | undefined {
  const apiUrl = process.env.NEON_API_URL;
  const apiKey = process.env.NEON_API_KEY;

  if (!apiUrl || !apiKey) {
    return undefined;
  }

  return new NeonCloudClient({ apiUrl, apiKey });
}

/**
 * Check if cloud sync is configured
 */
export function isCloudSyncConfigured(): boolean {
  return Boolean(process.env.NEON_API_URL && process.env.NEON_API_KEY);
}
