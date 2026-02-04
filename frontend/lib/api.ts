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
  return `?${new URLSearchParams(entries).toString()}`
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

// =============================================================================
// Dashboard API Types
// =============================================================================

export interface DashboardSummaryResponse {
  total_runs: number
  passed_runs: number
  failed_runs: number
  pass_rate: number
  avg_duration_ms: number
  total_tokens: number
  total_cost: number
  queryTimeMs: number
}

export interface ScoreTrendPointResponse {
  date: string
  name: string
  avg_score: number
  min_score: number
  max_score: number
  score_count: number
}

export interface DurationStatsResponse {
  date: string
  avg_duration_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  min_duration_ms: number
  max_duration_ms: number
  trace_count: number
}

export interface DailyRunSummaryResponse {
  date: string
  total_runs: number
  passed_runs: number
  failed_runs: number
  total_duration_ms: number
  total_tokens: number
  total_cost: number
}

export interface ScorerStatsResponse {
  name: string
  source: string
  date: string
  avg_score: number
  min_score: number
  max_score: number
  score_count: number
  passed_count: number
  failed_count: number
}

export interface DashboardResponse {
  summary: DashboardSummaryResponse
  scoreTrends: ScoreTrendPointResponse[]
  durationStats: DurationStatsResponse[]
  dailySummary: DailyRunSummaryResponse[]
  scorerStats: ScorerStatsResponse[]
  queryTimeMs: number
}

export interface DashboardQueryParams {
  projectId?: string
  days?: number
  startDate?: string
  endDate?: string
  scorerName?: string
}

// =============================================================================
// Dashboard API Client
// =============================================================================

/**
 * Client for dashboard API endpoints.
 * Uses Next.js API routes that query ClickHouse materialized views.
 */
export const dashboardApi = {
  /**
   * Get complete dashboard data in a single request.
   */
  async getDashboard(
    params?: DashboardQueryParams,
  ): Promise<DashboardResponse> {
    const query = buildQueryString({
      projectId: params?.projectId,
      days: params?.days,
      startDate: params?.startDate,
      endDate: params?.endDate,
      scorerName: params?.scorerName,
    })
    const response = await fetch(`/api/dashboard${query}`)
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to fetch dashboard data')
    }
    return response.json()
  },

  /**
   * Get just the summary stats for fast initial load.
   */
  async getSummary(
    params?: DashboardQueryParams,
  ): Promise<DashboardSummaryResponse> {
    const query = buildQueryString({
      projectId: params?.projectId,
      days: params?.days,
    })
    const response = await fetch(`/api/dashboard/summary${query}`)
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to fetch summary')
    }
    return response.json()
  },

  /**
   * Get score trends with min/max values.
   */
  async getScoreTrends(params?: DashboardQueryParams): Promise<{
    trends: ScoreTrendPointResponse[]
    queryTimeMs: number
  }> {
    const query = buildQueryString({
      projectId: params?.projectId,
      days: params?.days,
      startDate: params?.startDate,
      endDate: params?.endDate,
      scorerName: params?.scorerName,
    })
    const response = await fetch(`/api/dashboard/score-trends${query}`)
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to fetch score trends')
    }
    return response.json()
  },

  /**
   * Get duration statistics with percentiles.
   */
  async getDurationStats(params?: DashboardQueryParams): Promise<{
    stats: DurationStatsResponse[]
    queryTimeMs: number
  }> {
    const query = buildQueryString({
      projectId: params?.projectId,
      days: params?.days,
      startDate: params?.startDate,
      endDate: params?.endDate,
    })
    const response = await fetch(`/api/dashboard/duration-stats${query}`)
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to fetch duration stats')
    }
    return response.json()
  },
}

// =============================================================================
// MCP API Types
// =============================================================================

export interface MCPQueryParams {
  startDate?: string
  endDate?: string
  projectId?: string
}

export interface MCPServerHealthResponse {
  servers: MCPServerInfo[]
}

export interface MCPServerInfo {
  serverId: string
  serverUrl?: string
  transport: 'stdio' | 'http' | 'websocket'
  protocolVersion?: string
  capabilities?: string[]
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  callCount: number
  errorCount: number
  errorRate: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  lastSeen: string
  tools: MCPToolInfo[]
}

export interface MCPToolInfo {
  toolId: string
  name: string
  description?: string
  callCount: number
  errorCount: number
  avgLatencyMs: number
  successRate: number
}

export interface MCPTopologyResponse {
  nodes: MCPTopologyNode[]
  edges: MCPTopologyEdge[]
}

export interface MCPTopologyNode {
  id: string
  type: 'agent' | 'server' | 'tool'
  label: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  metrics: {
    callCount: number
    errorRate: number
    avgLatencyMs: number
  }
}

export interface MCPTopologyEdge {
  source: string
  target: string
  label?: string
  callCount: number
  avgLatencyMs: number
}

// =============================================================================
// Skill Evaluation API Types
// =============================================================================

export interface SkillQueryParams {
  projectId?: string
  startDate?: string
  endDate?: string
  skillId?: string
  limit?: number
}

export interface SkillEvalSummaryResponse {
  skillId: string
  skillName: string
  totalEvals: number
  passRate: number
  avgScore: number
  avgLatencyMs: number
  lastEvalDate: string
  trend: 'improving' | 'stable' | 'regressing'
  regressionCount: number
}

export interface SkillEvalHistoryResponse {
  skillId: string
  evaluations: Array<{
    id: string
    version: string
    timestamp: string
    passRate: number
    avgScore: number
    avgLatencyMs: number
    isRegression: boolean
  }>
}

export interface SkillEvalDetailResponse {
  skillId: string
  skillName: string
  version: string
  timestamp: string
  passRate: number
  avgScore: number
  avgLatencyMs: number
  testResults: Array<{
    id: string
    name: string
    passed: boolean
    scores: Array<{
      name: string
      value: number
      reason?: string
    }>
    latencyMs: number
    error?: string
  }>
  isRegression: boolean
  baselineScore?: number
}

export interface SkillRegressionResponse {
  skillId: string
  skillName: string
  severity: 'high' | 'medium' | 'low'
  delta: number
  baselineScore: number
  currentScore: number
  detectedAt: string
  affectedTests: number
}

// =============================================================================
// Skill Evaluation API
// =============================================================================

/**
 * Client for skill evaluation API endpoints.
 */
export const skillApi = {
  /**
   * Get skill evaluation summaries.
   */
  async getSummaries(
    params?: SkillQueryParams,
  ): Promise<SkillEvalSummaryResponse[]> {
    const query = buildQueryString({
      projectId: params?.projectId,
      startDate: params?.startDate,
      endDate: params?.endDate,
    })
    const response = await fetch(`/api/skills/summaries${query}`)
    if (!response.ok) {
      console.warn('Skill summaries endpoint not available, using mock data')
      return []
    }
    const data = await response.json()
    return data.summaries || []
  },

  /**
   * Get evaluation history for a specific skill.
   */
  async getHistory(
    skillId: string,
    params?: SkillQueryParams,
  ): Promise<SkillEvalHistoryResponse | null> {
    const query = buildQueryString({
      projectId: params?.projectId,
      limit: params?.limit,
    })
    const response = await fetch(`/api/skills/${skillId}/history${query}`)
    if (!response.ok) {
      console.warn(`Skill history endpoint not available for ${skillId}`)
      return null
    }
    return response.json()
  },

  /**
   * Get detailed evaluation results for a specific eval.
   */
  async getDetail(evalId: string): Promise<SkillEvalDetailResponse | null> {
    const response = await fetch(`/api/skills/evals/${evalId}`)
    if (!response.ok) {
      console.warn(`Skill eval detail endpoint not available for ${evalId}`)
      return null
    }
    return response.json()
  },

  /**
   * Get active skill regressions.
   */
  async getRegressions(
    params?: SkillQueryParams,
  ): Promise<SkillRegressionResponse[]> {
    const query = buildQueryString({
      projectId: params?.projectId,
    })
    const response = await fetch(`/api/skills/regressions${query}`)
    if (!response.ok) {
      console.warn('Skill regressions endpoint not available, using mock data')
      return []
    }
    const data = await response.json()
    return data.regressions || []
  },
}

// =============================================================================
// MCP API
// =============================================================================

/**
 * Client for MCP observability API endpoints.
 */
export const mcpApi = {
  /**
   * Get MCP server health data.
   */
  async getServerHealth(
    params?: MCPQueryParams,
  ): Promise<MCPServerHealthResponse> {
    const query = buildQueryString({
      projectId: params?.projectId,
      startDate: params?.startDate,
      endDate: params?.endDate,
    })
    const response = await fetch(`/api/trpc/analytics.mcpServerHealth${query}`)
    if (!response.ok) {
      // Return empty data if endpoint not available
      console.warn('MCP server health endpoint not available')
      return { servers: [] }
    }
    const data = await response.json()
    return data.result?.data || { servers: [] }
  },

  /**
   * Get MCP server topology data.
   */
  async getTopology(params?: MCPQueryParams): Promise<MCPTopologyResponse> {
    const query = buildQueryString({
      projectId: params?.projectId,
      startDate: params?.startDate,
      endDate: params?.endDate,
    })
    const response = await fetch(`/api/trpc/analytics.mcpTopology${query}`)
    if (!response.ok) {
      console.warn('MCP topology endpoint not available')
      return { nodes: [], edges: [] }
    }
    const data = await response.json()
    return data.result?.data || { nodes: [], edges: [] }
  },
}
