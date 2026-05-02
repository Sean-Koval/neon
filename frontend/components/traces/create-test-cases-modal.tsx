'use client'

/**
 * Create Test Cases Modal
 *
 * Converts selected traces into eval test cases. Used from both the
 * traces list (bulk action) and the trace detail page (single trace).
 */

import { clsx } from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/toast'
import { useSuites } from '@/hooks/use-suites'
import { useTrace } from '@/hooks/use-traces'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { EvalCaseCreate, EvalSuite } from '@/lib/types'

interface CreateTestCasesModalProps {
  traceIds: string[]
  open: boolean
  onClose: () => void
  onDetectAnomalies?: () => void
}

interface TestCaseInput {
  name: string
  input: string
  expectedOutput: string
  tools: string[]
}

function CollapsibleJson({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border rounded-lg overflow-hidden dark:border-dark-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {label}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-xs font-mono border-t dark:border-dark-700 bg-gray-50 dark:bg-dark-900 focus:ring-2 focus:ring-cyan-500 resize-y"
        />
      )}
    </div>
  )
}

function SingleTraceCase({
  traceId,
  onChange,
}: {
  traceId: string
  onChange: (draft: TestCaseInput) => void
}) {
  const { data, isLoading } = useTrace(traceId)
  const [testCase, setTestCase] = useState<TestCaseInput>({
    name: '',
    input: '',
    expectedOutput: '',
    tools: [],
  })

  useEffect(() => {
    if (!data) return
    const { trace, spans } = data
    const rootSpan = spans[0]
    const toolNames = new Set<string>()
    function walkSpans(list: typeof spans) {
      for (const span of list) {
        if (span.tool_name) toolNames.add(span.tool_name)
        if (span.children) walkSpans(span.children)
      }
    }
    walkSpans(spans)

    setTestCase({
      name: `${trace.name} - ${new Date(trace.timestamp).toLocaleDateString()}`,
      input: rootSpan?.input || rootSpan?.tool_input || '{}',
      expectedOutput: rootSpan?.output || rootSpan?.tool_output || '{}',
      tools: [...toolNames],
    })
  }, [data])

  useEffect(() => {
    onChange(testCase)
  }, [onChange, testCase])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading trace data...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Case Name
        </label>
        <input
          type="text"
          value={testCase.name}
          onChange={(e) =>
            setTestCase((tc) => ({ ...tc, name: e.target.value }))
          }
          className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-dark-800 dark:border-dark-700 focus:ring-2 focus:ring-cyan-500"
        />
      </div>
      <CollapsibleJson
        label="Input"
        value={testCase.input}
        onChange={(v) => setTestCase((tc) => ({ ...tc, input: v }))}
      />
      <CollapsibleJson
        label="Expected Output"
        value={testCase.expectedOutput}
        onChange={(v) => setTestCase((tc) => ({ ...tc, expectedOutput: v }))}
      />
      {testCase.tools.length > 0 && (
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Tools
          </span>
          <div className="flex flex-wrap gap-1.5">
            {testCase.tools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
              >
                {tool}
                <button
                  type="button"
                  onClick={() =>
                    setTestCase((tc) => ({
                      ...tc,
                      tools: tc.tools.filter((t) => t !== tool),
                    }))
                  }
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function parseInput(input: string): Record<string, unknown> {
  const trimmed = input.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Fall back to a text prompt payload when the trace input is not JSON.
  }

  return { prompt: trimmed }
}

function buildCasePayload(
  traceId: string,
  draft: TestCaseInput,
  suite: EvalSuite,
): EvalCaseCreate {
  const expectedOutput = draft.expectedOutput.trim()

  return {
    name: draft.name.trim() || `Trace ${traceId.slice(0, 8)}`,
    description: `Seeded from production trace ${traceId}`,
    input: parseInput(draft.input),
    expected_tools: draft.tools.length ? draft.tools : null,
    expected_tool_sequence: null,
    expected_output_contains: expectedOutput ? [expectedOutput] : null,
    expected_output_pattern: null,
    scorers: suite.default_scorers.length
      ? suite.default_scorers
      : ['reasoning'],
    scorer_config: null,
    min_score: suite.default_min_score,
    tags: ['seeded-from-trace', `trace:${traceId}`],
    timeout_seconds: suite.default_timeout_seconds,
  }
}

export function CreateTestCasesModal({
  traceIds,
  open,
  onClose,
  onDetectAnomalies,
}: CreateTestCasesModalProps) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const { data: suites = [], isLoading: suitesLoading } = useSuites({
    enabled: open,
  })
  const [selectedSuiteId, setSelectedSuiteId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, TestCaseInput>>({})
  const isSingleMode = traceIds.length === 1

  const handleSubmit = useCallback(async () => {
    if (!selectedSuiteId) {
      addToast('Please select a test suite', 'warning')
      return
    }
    setIsSubmitting(true)
    try {
      const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId)
      if (!selectedSuite) {
        throw new Error('Selected suite could not be found')
      }

      for (const traceId of traceIds) {
        const draft = drafts[traceId]
        if (!draft) {
          throw new Error(`Missing draft test case for trace ${traceId}`)
        }

        await api.createCase(
          selectedSuiteId,
          buildCasePayload(traceId, draft, selectedSuite),
        )
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.suites.detail(selectedSuiteId),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.suites.lists(),
      })

      addToast(
        `Created ${traceIds.length} test case${traceIds.length !== 1 ? 's' : ''}`,
        'success',
      )
      onClose()
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to create test cases',
        'error',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedSuiteId, traceIds, drafts, suites, queryClient, addToast, onClose])

  useEffect(() => {
    if (!open) return
    if (selectedSuiteId) return
    if (suites.length === 0) return

    setSelectedSuiteId(suites[0].id)
  }, [open, selectedSuiteId, suites])

  const updateDraft = useCallback((traceId: string, draft: TestCaseInput) => {
    setDrafts((current) => ({ ...current, [traceId]: draft }))
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-dark-700">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Create Test Case{!isSingleMode ? 's' : ''}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Suite selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Test Suite
            </label>
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              disabled={suitesLoading || suites.length === 0}
              className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-dark-800 dark:border-dark-700 focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">
                {suitesLoading ? 'Loading suites...' : 'Select a suite...'}
              </option>
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </select>
            {suites.length === 0 && !suitesLoading && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Create a suite first, then seed cases from production traces.
              </p>
            )}
          </div>

          {/* Auto-detect anomalies */}
          {onDetectAnomalies && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                Auto-detect anomalous traces to generate test cases from production regressions.
              </div>
              <button
                type="button"
                onClick={onDetectAnomalies}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 rounded-lg transition-colors"
              >
                Auto-detect
              </button>
            </div>
          )}

          {/* Trace cases */}
          {traceIds.map((traceId) => (
            <div
              key={traceId}
              className={clsx(
                'rounded-lg border dark:border-dark-700 p-4',
                !isSingleMode && 'bg-gray-50 dark:bg-dark-900',
              )}
            >
              {!isSingleMode && (
                <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-2">
                  {traceId.slice(0, 12)}...
                </div>
              )}
              <SingleTraceCase traceId={traceId} onChange={(draft) => updateDraft(traceId, draft)} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-dark-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !selectedSuiteId ||
              traceIds.some((traceId) => !drafts[traceId])
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create {traceIds.length} Test Case{traceIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
