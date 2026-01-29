/**
 * Neon API Client
 *
 * Type-safe client for the Neon API.
 */

import type {
  Trace,
  TraceWithSpans,
  TraceFilters,
  Score,
  CreateScoreInput,
  Dataset,
  CreateDatasetInput,
  EvalRun,
  EvalRunResult,
} from "@neon/shared";
import type { Suite, Test } from "./test.js";

/**
 * Client configuration
 */
export interface NeonConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Neon API Client
 */
export class Neon {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: NeonConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.neon.dev";
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Neon API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // ==================== Traces ====================

  /**
   * Trace API methods
   */
  traces = {
    /**
     * List traces with optional filtering
     */
    list: async (filters?: TraceFilters): Promise<Trace[]> => {
      const params = new URLSearchParams();
      if (filters?.projectId) params.set("project_id", filters.projectId);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.startDate)
        params.set("start_date", filters.startDate.toISOString());
      if (filters?.endDate)
        params.set("end_date", filters.endDate.toISOString());
      if (filters?.agentId) params.set("agent_id", filters.agentId);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.limit) params.set("limit", String(filters.limit));
      if (filters?.offset) params.set("offset", String(filters.offset));

      return this.request<Trace[]>(`/api/traces?${params}`);
    },

    /**
     * Get a single trace with all spans
     */
    get: async (traceId: string): Promise<TraceWithSpans> => {
      return this.request<TraceWithSpans>(`/api/traces/${traceId}`);
    },

    /**
     * Search traces by content
     */
    search: async (query: string, limit?: number): Promise<Trace[]> => {
      const params = new URLSearchParams({ query });
      if (limit) params.set("limit", String(limit));
      return this.request<Trace[]>(`/api/traces/search?${params}`);
    },
  };

  // ==================== Scores ====================

  /**
   * Score API methods
   */
  scores = {
    /**
     * Create a score
     */
    create: async (input: CreateScoreInput): Promise<Score> => {
      return this.request<Score>("/api/scores", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    /**
     * Create multiple scores in batch
     */
    createBatch: async (inputs: CreateScoreInput[]): Promise<Score[]> => {
      return this.request<Score[]>("/api/scores/batch", {
        method: "POST",
        body: JSON.stringify(inputs),
      });
    },

    /**
     * List scores for a trace
     */
    list: async (traceId: string): Promise<Score[]> => {
      return this.request<Score[]>(`/api/traces/${traceId}/scores`);
    },
  };

  // ==================== Datasets ====================

  /**
   * Dataset API methods
   */
  datasets = {
    /**
     * Create a dataset
     */
    create: async (input: CreateDatasetInput): Promise<Dataset> => {
      return this.request<Dataset>("/api/datasets", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    /**
     * Add items to a dataset
     */
    addItems: async (
      datasetId: string,
      items: Array<{ input: Record<string, unknown>; expected?: Record<string, unknown> }>
    ): Promise<void> => {
      await this.request(`/api/datasets/${datasetId}/items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    },

    /**
     * List datasets
     */
    list: async (): Promise<Dataset[]> => {
      return this.request<Dataset[]>("/api/datasets");
    },

    /**
     * Get a dataset
     */
    get: async (datasetId: string): Promise<Dataset> => {
      return this.request<Dataset>(`/api/datasets/${datasetId}`);
    },
  };

  // ==================== Evaluation ====================

  /**
   * Evaluation API methods
   */
  eval = {
    /**
     * Run a test suite
     */
    runSuite: async (suite: Suite): Promise<EvalRun> => {
      return this.request<EvalRun>("/api/eval/suite", {
        method: "POST",
        body: JSON.stringify(suite),
      });
    },

    /**
     * Run individual tests
     */
    runTests: async (tests: Test[]): Promise<EvalRunResult> => {
      return this.request<EvalRunResult>("/api/eval/tests", {
        method: "POST",
        body: JSON.stringify({ tests }),
      });
    },

    /**
     * Get evaluation run status
     */
    getRunStatus: async (runId: string): Promise<EvalRun> => {
      return this.request<EvalRun>(`/api/eval/runs/${runId}`);
    },

    /**
     * Wait for evaluation run to complete
     */
    waitForRun: async (
      runId: string,
      pollInterval = 1000
    ): Promise<EvalRunResult> => {
      while (true) {
        const run = await this.eval.getRunStatus(runId);
        if (run.status === "completed") {
          return this.request<EvalRunResult>(`/api/eval/runs/${runId}/result`);
        }
        if (run.status === "failed") {
          throw new Error(`Evaluation run failed: ${run.errorMessage}`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    },
  };
}

/**
 * Create a new Neon client
 */
export function createNeonClient(config: NeonConfig): Neon {
  return new Neon(config);
}
