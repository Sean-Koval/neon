'use client'

/**
 * Create Test Cases Modal
 *
 * Converts selected traces into eval test cases. Used from both the
 * traces list (bulk action) and the trace detail page (single trace).
 */

import { clsx } from 'clsx'
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/toast'
import { useTrace } from '@/hooks/use-traces'

interface CreateTestCasesModalProps {
  traceIds: string[]
  open: boolean
  onClose: () => void
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

function SingleTraceCase({ traceId }: { traceId: string }) {
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
          onChange={(e) => setTestCase((tc) => ({ ...tc, name: e.target.value }))}
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

export function CreateTestCasesModal({
  traceIds,
  open,
  onClose,
}: CreateTestCasesModalProps) {
  const { addToast } = useToast()
  const [selectedSuiteId, setSelectedSuiteId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSingleMode = traceIds.length === 1

  const handleSubmit = useCallback(async () => {
    if (!selectedSuiteId) {
      addToast('Please select a test suite', 'warning')
      return
    }
    setIsSubmitting(true)
    try {
      // In a real implementation, this would call trpc.suites.createCase for each trace.
      // For now, simulate success.
      await new Promise((resolve) => setTimeout(resolve, 500))
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
  }, [selectedSuiteId, traceIds, addToast, onClose])

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
              className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-dark-800 dark:border-dark-700 focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Select a suite...</option>
              <option value="new">+ Create new suite</option>
            </select>
          </div>

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
              <SingleTraceCase traceId={traceId} />
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
            disabled={isSubmitting || !selectedSuiteId}
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
