'use client'

import { useRouter } from 'next/navigation'
import { SuiteEditor, type SuiteFormData } from '@/components/suite-editor'

export default function NewSuitePage() {
  const router = useRouter()

  const handleSubmit = async (data: SuiteFormData) => {
    const response = await fetch('/api/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description || null,
        agent_id: data.agent_id,
        default_scorers: data.default_scorers,
        default_min_score: data.default_min_score,
        default_timeout_seconds: data.default_timeout_seconds,
        parallel: data.parallel,
        stop_on_failure: data.stop_on_failure,
        cases: data.cases.map((c) => ({
          name: c.name,
          description: c.description || null,
          input: c.input,
          expected_tools: c.expected_tools?.length ? c.expected_tools : null,
          expected_tool_sequence: c.expected_tool_sequence?.length
            ? c.expected_tool_sequence
            : null,
          expected_output_contains: c.expected_output_contains?.length
            ? c.expected_output_contains
            : null,
          expected_output_pattern: c.expected_output_pattern || null,
          scorers: c.scorers,
          scorer_config: c.scorer_config || null,
          min_score: c.min_score,
          tags: c.tags,
          timeout_seconds: c.timeout_seconds,
        })),
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create suite')
    }

    const suite = await response.json()
    router.push(`/suites/${suite.id}`)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Create Test Suite</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Define a new evaluation suite with test cases for your agent.
        </p>
      </div>

      <SuiteEditor
        onSubmit={handleSubmit}
        onCancel={() => router.push('/suites')}
      />
    </div>
  )
}
