/**
 * API client for AgentEval backend.
 *
 * Security considerations:
 * - API key is never logged or included in error messages
 * - All errors are sanitized before being thrown
 * - Uses X-API-Key header as expected by the backend
 */

// Type definitions matching backend Pydantic models
export interface EvalSuite {
  id: string
  name: string
  description?: string
  agent_id: string
  project_id: string
  default_scorers: string[]
  config: Record<string, unknown>
  cases?: EvalCase[]
  created_at: string
  updated_at: string
}

export interface EvalCase {
  id: string
  suite_id: string
  name: string
  input: Record<string, unknown>
  expected_output?: Record<string, unknown>
  context?: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
}

export interface EvalRun {
  id: string
  suite_id: string
  suite_name: string
  agent_id: string
  agent_version?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  summary?: RunSummary
  mlflow_run_id?: string
  created_at: string
  completed_at?: string
}

export interface RunSummary {
  total_cases: number
  passed: number
  failed: number
  avg_score: number
  duration_seconds: number
}

export interface ComparisonResult {
  baseline: EvalRun
  candidate: EvalRun
  passed: boolean
  overall_delta: number
  regressions: CaseComparison[]
  improvements: CaseComparison[]
  unchanged: number
}

export interface CaseComparison {
  case_name: string
  scorer: string
  baseline_score: number
  candidate_score: number
  delta: number
}

export interface ApiError {
  message: string
  status: number
}

// API key getter type - injected from auth context
type GetApiKeyFn = () => string | null

// Singleton instance
let apiKeyGetter: GetApiKeyFn | null = null

/**
 * Initialize the API client with an API key getter function.
 * This should be called once during app initialization from the AuthProvider.
 */
export function initializeApiClient(getApiKey: GetApiKeyFn): void {
  apiKeyGetter = getApiKey
}

/**
 * Get the configured API base URL.
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}

/**
 * Make an authenticated API request.
 * Never logs or exposes the API key in errors.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = apiKeyGetter?.()

  if (!apiKey) {
    throw new ApiClientError('API key not configured', 401)
  }

  const url = `${getBaseUrl()}/api/v1${endpoint}`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    ...options.headers,
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      // Parse error response but never include API key in error
      let errorMessage = 'Request failed'
      try {
        const errorData = await response.json()
        errorMessage = errorData.detail || errorData.message || errorMessage
      } catch {
        // Response wasn't JSON, use status text
        errorMessage = response.statusText || errorMessage
      }

      throw new ApiClientError(errorMessage, response.status)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  } catch (error) {
    // Re-throw ApiClientError as-is
    if (error instanceof ApiClientError) {
      throw error
    }

    // Wrap other errors, never exposing internal details
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiClientError('Unable to connect to API server', 0)
    }

    throw new ApiClientError('An unexpected error occurred', 0)
  }
}

/**
 * Custom error class for API errors.
 * Designed to never expose sensitive information.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    // Sanitize message to ensure no API key leakage
    const sanitizedMessage = message.replace(/ae_\w+_\w+/g, '[REDACTED]')
    super(sanitizedMessage)
    this.name = 'ApiClientError'
  }
}

/**
 * API client with typed methods for all endpoints.
 */
export const api = {
  // Health check (no auth required)
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${getBaseUrl()}/health`)
    return response.json()
  },

  // Suites
  async getSuites(): Promise<EvalSuite[]> {
    const data = await request<{ items: EvalSuite[] }>('/suites')
    return data.items
  },

  async getSuite(id: string): Promise<EvalSuite> {
    return request<EvalSuite>(`/suites/${id}`)
  },

  async createSuite(
    data: Omit<EvalSuite, 'id' | 'project_id' | 'created_at' | 'updated_at'>,
  ): Promise<EvalSuite> {
    return request<EvalSuite>('/suites', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateSuite(id: string, data: Partial<EvalSuite>): Promise<EvalSuite> {
    return request<EvalSuite>(`/suites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteSuite(id: string): Promise<void> {
    await request<void>(`/suites/${id}`, {
      method: 'DELETE',
    })
  },

  // Cases
  async getCases(suiteId: string): Promise<EvalCase[]> {
    return request<EvalCase[]>(`/suites/${suiteId}/cases`)
  },

  async createCase(
    suiteId: string,
    data: Omit<EvalCase, 'id' | 'suite_id' | 'created_at'>,
  ): Promise<EvalCase> {
    return request<EvalCase>(`/suites/${suiteId}/cases`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Runs
  async getRuns(): Promise<EvalRun[]> {
    const data = await request<{ items: EvalRun[] }>('/runs')
    return data.items
  },

  async getRun(id: string): Promise<EvalRun> {
    return request<EvalRun>(`/runs/${id}`)
  },

  async createRun(suiteId: string, agentVersion?: string): Promise<EvalRun> {
    return request<EvalRun>('/runs', {
      method: 'POST',
      body: JSON.stringify({
        suite_id: suiteId,
        agent_version: agentVersion,
      }),
    })
  },

  // Comparison
  async compareRuns(
    baselineId: string,
    candidateId: string,
    threshold: number = 0.05,
  ): Promise<ComparisonResult> {
    return request<ComparisonResult>(
      `/compare?baseline_id=${baselineId}&candidate_id=${candidateId}&threshold=${threshold}`,
    )
  },
}

export default api
