/**
 * Neon API Client
 *
 * Type-safe API client for the Neon evaluation platform.
 * Handles authentication, error handling, and request building.
 */

import type {
  CompareRequest,
  CompareResponse,
  EvalCase,
  EvalCaseCreate,
  EvalResult,
  EvalRun,
  EvalRunCreate,
  EvalRunList,
  EvalSuite,
  EvalSuiteCreate,
  EvalSuiteList,
  EvalSuiteUpdate,
  ResultsFilter,
  RunsFilter,
  StartEvalRunRequest,
  StartEvalRunResponse,
  WorkflowControlAction,
  WorkflowControlResponse,
  WorkflowRunList,
  WorkflowStatus,
  WorkflowStatusPoll,
  WorkflowStatusResponse,
} from './types'

// =============================================================================
// Error Handling
// =============================================================================

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError
  }
}

// =============================================================================
// Query String Builder
// =============================================================================

type QueryValue = string | number | boolean | undefined | null
type QueryParams = Record<string, QueryValue>

export function buildQueryString(params: QueryParams): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)])

  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries).toString()
}

// =============================================================================
// API Client
// =============================================================================

const DEFAULT_BASE_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : '/api'

export class ApiClient {
  private baseUrl: string
  private apiKey: string | null = null

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL
  }

  /**
   * Set the API key for authentication.
   * The key is sent as X-API-Key header with all requests.
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  /**
   * Clear the current API key.
   */
  clearApiKey(): void {
    this.apiKey = null
  }

  /**
   * Check if an API key is currently set.
   */
  hasApiKey(): boolean {
    return this.apiKey !== null
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown
      query?: QueryParams
    },
  ): Promise<T> {
    const url = this.baseUrl + path + buildQueryString(options?.query ?? {})

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      let details: unknown
      let message = `Request failed with status ${response.status}`

      try {
        const errorBody = await response.json()
        details = errorBody
        if (typeof errorBody.detail === 'string') {
          message = errorBody.detail
        } else if (typeof errorBody.message === 'string') {
          message = errorBody.message
        }
      } catch {
        // Response body is not JSON, use status text
        message = response.statusText || message
      }

      throw new ApiError(response.status, message, details)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  // ===========================================================================
  // Suites
  // ===========================================================================

  /**
   * List all evaluation suites.
   */
  async getSuites(): Promise<EvalSuiteList> {
    return this.request<EvalSuiteList>('GET', '/suites')
  }

  /**
   * Get a single evaluation suite by ID.
   */
  async getSuite(suiteId: string): Promise<EvalSuite> {
    return this.request<EvalSuite>('GET', `/suites/${suiteId}`)
  }

  /**
   * Create a new evaluation suite.
   */
  async createSuite(data: EvalSuiteCreate): Promise<EvalSuite> {
    return this.request<EvalSuite>('POST', '/suites', { body: data })
  }

  /**
   * Update an existing evaluation suite.
   */
  async updateSuite(
    suiteId: string,
    data: EvalSuiteUpdate,
  ): Promise<EvalSuite> {
    return this.request<EvalSuite>('PATCH', `/suites/${suiteId}`, {
      body: data,
    })
  }

  /**
   * Delete an evaluation suite.
   */
  async deleteSuite(suiteId: string): Promise<void> {
    return this.request<void>('DELETE', `/suites/${suiteId}`)
  }

  // ===========================================================================
  // Cases
  // ===========================================================================

  /**
   * List all cases in a suite.
   */
  async getCases(suiteId: string): Promise<EvalCase[]> {
    return this.request<EvalCase[]>('GET', `/suites/${suiteId}/cases`)
  }

  /**
   * Create a new case in a suite.
   */
  async createCase(suiteId: string, data: EvalCaseCreate): Promise<EvalCase> {
    return this.request<EvalCase>('POST', `/suites/${suiteId}/cases`, {
      body: data,
    })
  }

  /**
   * Update an existing case.
   */
  async updateCase(
    suiteId: string,
    caseId: string,
    data: Partial<EvalCaseCreate>,
  ): Promise<EvalCase> {
    return this.request<EvalCase>(
      'PATCH',
      `/suites/${suiteId}/cases/${caseId}`,
      {
        body: data,
      },
    )
  }

  /**
   * Delete a case from a suite.
   */
  async deleteCase(suiteId: string, caseId: string): Promise<void> {
    return this.request<void>('DELETE', `/suites/${suiteId}/cases/${caseId}`)
  }

  // ===========================================================================
  // Runs
  // ===========================================================================

  /**
   * List evaluation runs with optional filtering.
   */
  async getRuns(filter?: RunsFilter): Promise<EvalRunList> {
    return this.request<EvalRunList>('GET', '/runs', {
      query: {
        suite_id: filter?.suite_id,
        status_filter: filter?.status,
        limit: filter?.limit,
        offset: filter?.offset,
      },
    })
  }

  /**
   * Get a single evaluation run by ID.
   */
  async getRun(runId: string): Promise<EvalRun> {
    return this.request<EvalRun>('GET', `/runs/${runId}`)
  }

  /**
   * Get results for an evaluation run.
   */
  async getRunResults(
    runId: string,
    filter?: ResultsFilter,
  ): Promise<EvalResult[]> {
    return this.request<EvalResult[]>('GET', `/runs/${runId}/results`, {
      query: {
        failed_only: filter?.failed_only,
      },
    })
  }

  /**
   * Trigger a new evaluation run for a suite.
   */
  async triggerRun(suiteId: string, data?: EvalRunCreate): Promise<EvalRun> {
    return this.request<EvalRun>('POST', `/runs/suites/${suiteId}/run`, {
      body: data ?? {},
    })
  }

  /**
   * Cancel a running evaluation.
   */
  async cancelRun(runId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>('POST', `/runs/${runId}/cancel`)
  }

  // ===========================================================================
  // Compare
  // ===========================================================================

  /**
   * Compare two evaluation runs and identify regressions.
   */
  async compare(request: CompareRequest): Promise<CompareResponse> {
    return this.request<CompareResponse>('POST', '/compare', { body: request })
  }

  // ===========================================================================
  // Temporal Workflow Runs
  // ===========================================================================

  /**
   * Start a new eval run via Temporal workflow.
   */
  async startWorkflowRun(
    request: StartEvalRunRequest,
  ): Promise<StartEvalRunResponse> {
    return this.request<StartEvalRunResponse>('POST', '/runs', {
      body: request,
    })
  }

  /**
   * List workflow runs from Temporal.
   */
  async listWorkflowRuns(options?: {
    limit?: number
    status?: WorkflowStatus
  }): Promise<WorkflowRunList> {
    return this.request<WorkflowRunList>('GET', '/runs', {
      query: {
        limit: options?.limit,
        status: options?.status,
      },
    })
  }

  /**
   * Get detailed status for a workflow run.
   */
  async getWorkflowRun(id: string): Promise<WorkflowStatusResponse> {
    return this.request<WorkflowStatusResponse>('GET', `/runs/${id}`)
  }

  /**
   * Get lightweight status for polling.
   */
  async getWorkflowRunStatus(id: string): Promise<WorkflowStatusPoll> {
    return this.request<WorkflowStatusPoll>('GET', `/runs/${id}/status`)
  }

  /**
   * Control a running workflow (pause/resume/cancel).
   */
  async controlWorkflowRun(
    id: string,
    action: WorkflowControlAction,
  ): Promise<WorkflowControlResponse> {
    return this.request<WorkflowControlResponse>(
      'POST',
      `/runs/${id}/control`,
      {
        body: { action },
      },
    )
  }

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflowRun(id: string): Promise<WorkflowControlResponse> {
    return this.controlWorkflowRun(id, 'cancel')
  }

  /**
   * Pause a running workflow.
   */
  async pauseWorkflowRun(id: string): Promise<WorkflowControlResponse> {
    return this.controlWorkflowRun(id, 'pause')
  }

  /**
   * Resume a paused workflow.
   */
  async resumeWorkflowRun(id: string): Promise<WorkflowControlResponse> {
    return this.controlWorkflowRun(id, 'resume')
  }
}

// =============================================================================
// Default Instance
// =============================================================================

/**
 * Default API client instance.
 * Can be used directly or replaced with a custom instance.
 */
export const apiClient = new ApiClient()

/**
 * Alias for backwards compatibility.
 */
export const api = apiClient
