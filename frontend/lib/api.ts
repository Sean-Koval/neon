/**
 * API client for AgentEval backend
 */

import type {
  CompareRequest,
  CompareResponse,
  EvalRun,
  EvalRunList,
  EvalSuiteList,
} from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Runs
  async getRuns(params?: {
    suiteId?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<EvalRun[]> {
    const searchParams = new URLSearchParams()
    if (params?.suiteId) searchParams.set('suite_id', params.suiteId)
    if (params?.status) searchParams.set('status_filter', params.status)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())

    const query = searchParams.toString()
    const endpoint = `/runs${query ? `?${query}` : ''}`
    const data = await this.request<EvalRunList>(endpoint)
    return data.items
  }

  async getRun(runId: string): Promise<EvalRun> {
    return this.request<EvalRun>(`/runs/${runId}`)
  }

  // Suites
  async getSuites(): Promise<EvalSuiteList> {
    return this.request<EvalSuiteList>('/suites')
  }

  // Compare
  async compareRuns(
    baselineId: string,
    candidateId: string,
    threshold: number = 0.05,
  ): Promise<CompareResponse> {
    const body: CompareRequest = {
      baseline_run_id: baselineId,
      candidate_run_id: candidateId,
      threshold,
    }

    return this.request<CompareResponse>('/compare', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async getComparison(
    baselineId: string,
    candidateId: string,
    threshold: number = 0.05,
  ): Promise<CompareResponse> {
    return this.request<CompareResponse>(
      `/compare/${baselineId}/${candidateId}?threshold=${threshold}`,
    )
  }
}

export const api = new ApiClient()
