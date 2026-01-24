const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}/api/v1${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `API Error: ${response.status}`)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

export const api = {
  // Suites
  getSuites: () => fetchApi<{ items: any[] }>('/suites').then((r) => r.items),
  getSuite: (id: string) => fetchApi<any>(`/suites/${id}`),
  createSuite: (data: any) => fetchApi<any>('/suites', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteSuite: (id: string) => fetchApi<void>(`/suites/${id}`, {
    method: 'DELETE',
  }),

  // Runs
  getRuns: (params?: { suite_id?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.suite_id) searchParams.set('suite_id', params.suite_id)
    if (params?.status) searchParams.set('status_filter', params.status)
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return fetchApi<{ items: any[] }>(`/runs${query ? `?${query}` : ''}`).then((r) => r.items)
  },
  getRun: (id: string) => fetchApi<any>(`/runs/${id}`),
  getRunResults: (id: string, failedOnly = false) =>
    fetchApi<any[]>(`/runs/${id}/results?failed_only=${failedOnly}`),
  startRun: (suiteId: string, data: any) =>
    fetchApi<any>(`/runs/suites/${suiteId}/run`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Compare
  compareRuns: (baselineId: string, candidateId: string, threshold = 0.05) =>
    fetchApi<any>('/compare', {
      method: 'POST',
      body: JSON.stringify({
        baseline_run_id: baselineId,
        candidate_run_id: candidateId,
        threshold,
      }),
    }),
}
