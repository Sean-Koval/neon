/**
 * API Client Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError, buildQueryString } from '../api'
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
} from '../types'

// =============================================================================
// Test Fixtures
// =============================================================================

const mockSuite: EvalSuite = {
  id: 'suite-123',
  project_id: 'project-456',
  name: 'test-suite',
  description: 'A test suite',
  agent_id: 'agent-789',
  default_scorers: ['tool_selection', 'reasoning'],
  default_min_score: 0.7,
  default_timeout_seconds: 300,
  parallel: true,
  stop_on_failure: false,
  cases: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockCase: EvalCase = {
  id: 'case-123',
  suite_id: 'suite-123',
  name: 'test-case',
  description: 'A test case',
  input: { query: 'test' },
  expected_tools: ['search'],
  expected_tool_sequence: null,
  expected_output_contains: null,
  expected_output_pattern: null,
  scorers: ['tool_selection'],
  scorer_config: null,
  min_score: 0.8,
  tags: ['unit-test'],
  timeout_seconds: 60,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockRun: EvalRun = {
  id: 'run-123',
  suite_id: 'suite-123',
  suite_name: 'test-suite',
  project_id: 'project-456',
  agent_version: 'v1.0.0',
  trigger: 'manual',
  trigger_ref: null,
  status: 'completed',
  config: null,
  summary: {
    total_cases: 10,
    passed: 8,
    failed: 2,
    errored: 0,
    avg_score: 0.85,
    scores_by_type: { tool_selection: 0.9, reasoning: 0.8 },
    execution_time_ms: 5000,
  },
  started_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T00:01:00Z',
  created_at: '2024-01-01T00:00:00Z',
}

const mockResult: EvalResult = {
  id: 'result-123',
  run_id: 'run-123',
  case_id: 'case-123',
  case_name: 'test-case',
  trace_id: 'trace-456',
  status: 'success',
  output: { answer: 'test response' },
  scores: { tool_selection: 0.9 },
  score_details: null,
  passed: true,
  execution_time_ms: 500,
  error: null,
  created_at: '2024-01-01T00:00:00Z',
}

// =============================================================================
// Mock Setup
// =============================================================================

const mockFetch = vi.fn()
global.fetch = mockFetch

function mockResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

function mockNoContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: 'No Content',
    json: () => Promise.reject(new Error('No content')),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockNoContentResponse(),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
  } as Response
}

// =============================================================================
// Tests: buildQueryString
// =============================================================================

describe('buildQueryString', () => {
  it('returns empty string for empty params', () => {
    expect(buildQueryString({})).toBe('')
  })

  it('builds query string from params', () => {
    const result = buildQueryString({ foo: 'bar', baz: 123 })
    expect(result).toBe('?foo=bar&baz=123')
  })

  it('filters out undefined and null values', () => {
    const result = buildQueryString({
      foo: 'bar',
      empty: undefined,
      nothing: null,
      valid: 'yes',
    })
    expect(result).toBe('?foo=bar&valid=yes')
  })

  it('converts boolean values to strings', () => {
    const result = buildQueryString({ enabled: true, disabled: false })
    expect(result).toBe('?enabled=true&disabled=false')
  })
})

// =============================================================================
// Tests: ApiError
// =============================================================================

describe('ApiError', () => {
  it('creates error with status code and message', () => {
    const error = new ApiError(404, 'Not found')
    expect(error.statusCode).toBe(404)
    expect(error.message).toBe('Not found')
    expect(error.name).toBe('ApiError')
  })

  it('includes optional details', () => {
    const details = { field: 'name', issue: 'required' }
    const error = new ApiError(400, 'Validation error', details)
    expect(error.details).toEqual(details)
  })

  it('isApiError returns true for ApiError instances', () => {
    const error = new ApiError(500, 'Server error')
    expect(ApiError.isApiError(error)).toBe(true)
  })

  it('isApiError returns false for regular errors', () => {
    const error = new Error('Regular error')
    expect(ApiError.isApiError(error)).toBe(false)
  })

  it('isApiError returns false for non-errors', () => {
    expect(ApiError.isApiError(null)).toBe(false)
    expect(ApiError.isApiError('string')).toBe(false)
    expect(ApiError.isApiError({ statusCode: 404 })).toBe(false)
  })
})

// =============================================================================
// Tests: ApiClient
// =============================================================================

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ApiClient('https://api.example.com')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // API Key Management
  // ---------------------------------------------------------------------------

  describe('API Key Management', () => {
    it('setApiKey stores the API key', () => {
      client.setApiKey('test-key')
      expect(client.hasApiKey()).toBe(true)
    })

    it('clearApiKey removes the API key', () => {
      client.setApiKey('test-key')
      client.clearApiKey()
      expect(client.hasApiKey()).toBe(false)
    })

    it('includes X-API-Key header when key is set', async () => {
      client.setApiKey('my-api-key')
      mockFetch.mockResolvedValueOnce(mockResponse({ items: [], total: 0 }))

      await client.getSuites()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'my-api-key',
          }),
        }),
      )
    })

    it('does not include X-API-Key header when no key set', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ items: [], total: 0 }))

      await client.getSuites()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-API-Key']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('throws ApiError on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Suite not found' }, 404),
      )

      await expect(client.getSuite('not-exists')).rejects.toThrow(ApiError)
    })

    it('extracts detail message from error response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Suite not found' }, 404),
      )

      try {
        await client.getSuite('not-exists')
      } catch (error) {
        expect(ApiError.isApiError(error)).toBe(true)
        if (ApiError.isApiError(error)) {
          expect(error.statusCode).toBe(404)
          expect(error.message).toBe('Suite not found')
        }
      }
    })

    it('extracts message field from error response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Bad request' }, 400),
      )

      try {
        await client.getSuites()
      } catch (error) {
        if (ApiError.isApiError(error)) {
          expect(error.message).toBe('Bad request')
        }
      }
    })

    it('handles non-JSON error responses', async () => {
      const response = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
        headers: new Headers(),
      } as Response

      mockFetch.mockResolvedValueOnce(response)

      try {
        await client.getSuites()
      } catch (error) {
        if (ApiError.isApiError(error)) {
          expect(error.statusCode).toBe(500)
          expect(error.message).toBe('Internal Server Error')
        }
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Suites
  // ---------------------------------------------------------------------------

  describe('Suites', () => {
    it('getSuites fetches all suites', async () => {
      const list: EvalSuiteList = { items: [mockSuite], total: 1 }
      mockFetch.mockResolvedValueOnce(mockResponse(list))

      const result = await client.getSuites()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual(list)
    })

    it('getSuite fetches a single suite', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(mockSuite))

      const result = await client.getSuite('suite-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual(mockSuite)
    })

    it('createSuite creates a new suite', async () => {
      const createData: EvalSuiteCreate = {
        name: 'new-suite',
        agent_id: 'agent-123',
        default_scorers: ['tool_selection'],
        default_min_score: 0.7,
        default_timeout_seconds: 300,
        parallel: true,
        stop_on_failure: false,
      }
      mockFetch.mockResolvedValueOnce(mockResponse(mockSuite))

      const result = await client.createSuite(createData)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(createData),
        }),
      )
      expect(result).toEqual(mockSuite)
    })

    it('updateSuite updates an existing suite', async () => {
      const updateData = { name: 'updated-name' }
      mockFetch.mockResolvedValueOnce(mockResponse(mockSuite))

      const result = await client.updateSuite('suite-123', updateData)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      )
      expect(result).toEqual(mockSuite)
    })

    it('deleteSuite deletes a suite', async () => {
      mockFetch.mockResolvedValueOnce(mockNoContentResponse())

      await client.deleteSuite('suite-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Cases
  // ---------------------------------------------------------------------------

  describe('Cases', () => {
    it('getCases fetches all cases in a suite', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([mockCase]))

      const result = await client.getCases('suite-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123/cases',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual([mockCase])
    })

    it('createCase creates a new case', async () => {
      const createData: EvalCaseCreate = {
        name: 'new-case',
        input: { query: 'test' },
        scorers: ['tool_selection'],
        min_score: 0.8,
        tags: ['test'],
        timeout_seconds: 60,
      }
      mockFetch.mockResolvedValueOnce(mockResponse(mockCase))

      const result = await client.createCase('suite-123', createData)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123/cases',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(createData),
        }),
      )
      expect(result).toEqual(mockCase)
    })

    it('updateCase updates an existing case', async () => {
      const updateData = { name: 'updated-case' }
      mockFetch.mockResolvedValueOnce(mockResponse(mockCase))

      const result = await client.updateCase(
        'suite-123',
        'case-123',
        updateData,
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123/cases/case-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      )
      expect(result).toEqual(mockCase)
    })

    it('deleteCase deletes a case', async () => {
      mockFetch.mockResolvedValueOnce(mockNoContentResponse())

      await client.deleteCase('suite-123', 'case-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/suites/suite-123/cases/case-123',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  describe('Runs', () => {
    it('getRuns fetches all runs', async () => {
      const list: EvalRunList = { items: [mockRun], count: 1 }
      mockFetch.mockResolvedValueOnce(mockResponse(list))

      const result = await client.getRuns()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual(list)
    })

    it('getRuns applies filters', async () => {
      const list: EvalRunList = { items: [mockRun], count: 1 }
      mockFetch.mockResolvedValueOnce(mockResponse(list))

      await client.getRuns({
        suite_id: 'suite-123',
        status: 'completed',
        limit: 10,
        offset: 20,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('suite_id=suite-123'),
        expect.anything(),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status_filter=completed'),
        expect.anything(),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.anything(),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=20'),
        expect.anything(),
      )
    })

    it('getRun fetches a single run', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(mockRun))

      const result = await client.getRun('run-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs/run-123',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual(mockRun)
    })

    it('getRunResults fetches results for a run', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([mockResult]))

      const result = await client.getRunResults('run-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs/run-123/results',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result).toEqual([mockResult])
    })

    it('getRunResults applies failed_only filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([mockResult]))

      await client.getRunResults('run-123', { failed_only: true })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('failed_only=true'),
        expect.anything(),
      )
    })

    it('triggerRun starts a new run', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(mockRun))

      const result = await client.triggerRun('suite-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs/suites/suite-123/run',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      )
      expect(result).toEqual(mockRun)
    })

    it('triggerRun passes run configuration', async () => {
      const runConfig: EvalRunCreate = {
        agent_version: 'v2.0.0',
        trigger: 'ci',
        trigger_ref: 'pr-123',
      }
      mockFetch.mockResolvedValueOnce(mockResponse(mockRun))

      await client.triggerRun('suite-123', runConfig)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs/suites/suite-123/run',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(runConfig),
        }),
      )
    })

    it('cancelRun cancels a running evaluation', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'cancelled' }))

      const result = await client.cancelRun('run-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/runs/run-123/cancel',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result).toEqual({ status: 'cancelled' })
    })
  })

  // ---------------------------------------------------------------------------
  // Compare
  // ---------------------------------------------------------------------------

  describe('Compare', () => {
    it('compare compares two runs', async () => {
      const compareRequest: CompareRequest = {
        baseline_run_id: 'run-1',
        candidate_run_id: 'run-2',
        threshold: 0.1,
      }
      const compareResponse: CompareResponse = {
        baseline: { id: 'run-1', agent_version: 'v1.0' },
        candidate: { id: 'run-2', agent_version: 'v2.0' },
        passed: true,
        overall_delta: 0.05,
        regressions: [],
        improvements: [
          {
            case_name: 'test-case',
            scorer: 'tool_selection',
            baseline_score: 0.8,
            candidate_score: 0.9,
            delta: 0.1,
          },
        ],
        unchanged: 5,
        threshold: 0.1,
      }
      mockFetch.mockResolvedValueOnce(mockResponse(compareResponse))

      const result = await client.compare(compareRequest)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/compare',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(compareRequest),
        }),
      )
      expect(result).toEqual(compareResponse)
    })
  })

  // ---------------------------------------------------------------------------
  // Base URL Configuration
  // ---------------------------------------------------------------------------

  describe('Base URL Configuration', () => {
    it('uses provided base URL', async () => {
      const customClient = new ApiClient('https://custom.api.com/v2')
      mockFetch.mockResolvedValueOnce(mockResponse({ items: [], total: 0 }))

      await customClient.getSuites()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v2/suites',
        expect.anything(),
      )
    })

    it('uses default base URL when not provided', async () => {
      const defaultClient = new ApiClient()
      mockFetch.mockResolvedValueOnce(mockResponse({ items: [], total: 0 }))

      await defaultClient.getSuites()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/suites'),
        expect.anything(),
      )
    })
  })
})
