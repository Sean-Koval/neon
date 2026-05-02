'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { SuiteEditor, type SuiteFormData } from '@/components/suite-editor'
import {
  diffSuiteCases,
  formDataToUpdatePayload,
  suiteToFormData,
} from '@/components/suite-editor/form-utils'
import { useToast } from '@/components/toast'
import { trpc } from '@/lib/trpc'

export default function EditSuitePage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const utils = trpc.useUtils()
  const suiteId = typeof params.id === 'string' ? params.id : ''

  const suiteQuery = trpc.suites.get.useQuery({ suiteId }, { enabled: !!suiteId })
  const updateSuite = trpc.suites.update.useMutation()
  const createCase = trpc.suites.createCase.useMutation()
  const updateCase = trpc.suites.updateCase.useMutation()
  const deleteCase = trpc.suites.deleteCase.useMutation()

  const initialData = useMemo(() => {
    if (!suiteQuery.data) {
      return undefined
    }
    return suiteToFormData(suiteQuery.data)
  }, [suiteQuery.data])

  const handleSubmit = async (data: SuiteFormData) => {
    if (!suiteQuery.data) {
      throw new Error('Suite data is not loaded yet')
    }

    const suitePayload = formDataToUpdatePayload(data)
    const caseChanges = diffSuiteCases(suiteQuery.data.cases ?? [], data.cases)

    await updateSuite.mutateAsync({
      suiteId,
      name: suitePayload.name,
      description: suitePayload.description ?? undefined,
      agentId: suitePayload.agent_id,
      defaultScorers: suitePayload.default_scorers,
      defaultMinScore: suitePayload.default_min_score,
      defaultTimeoutSeconds: suitePayload.default_timeout_seconds,
      parallel: suitePayload.parallel,
      stopOnFailure: suitePayload.stop_on_failure,
    })

    await Promise.all(
      caseChanges.delete.map((caseId) =>
        deleteCase.mutateAsync({
          suiteId,
          caseId,
        }),
      ),
    )

    await Promise.all(
      caseChanges.update.map(({ caseId, data: caseData }) =>
        updateCase.mutateAsync({
          suiteId,
          caseId,
          ...caseData,
          description: caseData.description ?? undefined,
          expected_tools: caseData.expected_tools ?? undefined,
          expected_tool_sequence: caseData.expected_tool_sequence ?? undefined,
          expected_output_contains:
            caseData.expected_output_contains ?? undefined,
          expected_output_pattern:
            caseData.expected_output_pattern ?? undefined,
          scorer_config: caseData.scorer_config ?? undefined,
        }),
      ),
    )

    await Promise.all(
      caseChanges.create.map((caseData) =>
        createCase.mutateAsync({
          suiteId,
          ...caseData,
          description: caseData.description ?? undefined,
          expected_tools: caseData.expected_tools ?? undefined,
          expected_tool_sequence: caseData.expected_tool_sequence ?? undefined,
          expected_output_contains:
            caseData.expected_output_contains ?? undefined,
          expected_output_pattern:
            caseData.expected_output_pattern ?? undefined,
          scorer_config: caseData.scorer_config ?? undefined,
        }),
      ),
    )

    await Promise.all([
      utils.suites.get.invalidate({ suiteId }),
      utils.suites.list.invalidate(),
      utils.suites.listCases.invalidate({ suiteId }),
    ])

    addToast('Suite saved', 'success')
    router.push(`/suites/${suiteId}`)
  }

  if (suiteQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-5 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading suite editor...
        </div>
      </div>
    )
  }

  if (suiteQuery.error || !suiteQuery.data || !initialData) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4">
          <p className="text-sm text-red-200">
            {suiteQuery.error?.message || 'Failed to load this suite.'}
          </p>
          <Link
            href={suiteId ? `/suites/${suiteId}` : '/suites'}
            className="mt-3 inline-flex items-center gap-2 text-sm text-red-300 hover:text-red-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to suite
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href={`/suites/${suiteId}`}
          className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to suite
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Edit Test Suite</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Update the suite definition, expected behavior checks, and per-case
          scorer rules from one place.
        </p>
      </div>

      <SuiteEditor
        key={suiteQuery.data.id}
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/suites/${suiteId}`)}
        submitLabel="Save Suite"
      />
    </div>
  )
}
