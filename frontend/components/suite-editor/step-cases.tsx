'use client'

import { Plus } from 'lucide-react'
import type { EvalCaseCreate } from '@/lib/types'
import { CaseEditor } from './case-editor'
import { EMPTY_CASE, type SuiteFormData } from './types'

interface StepCasesProps {
  data: SuiteFormData
  onChange: (updates: Partial<SuiteFormData>) => void
}

export function StepCases({ data, onChange }: StepCasesProps) {
  const addCase = () => {
    onChange({ cases: [...data.cases, { ...EMPTY_CASE }] })
  }

  const updateCase = (index: number, updated: EvalCaseCreate) => {
    const cases = [...data.cases]
    cases[index] = updated
    onChange({ cases })
  }

  const removeCase = (index: number) => {
    onChange({ cases: data.cases.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-zinc-100">Test Cases</h3>
          <p className="text-sm text-zinc-400 mt-1">
            Add test cases that define how your agent should behave.
          </p>
        </div>
        <button
          type="button"
          onClick={addCase}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Case
        </button>
      </div>

      {data.cases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-sm text-zinc-400">
            No test cases yet. Click &quot;Add Case&quot; to create your first test case.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.cases.map((c, i) => (
            <CaseEditor
              key={`case-${i}`}
              caseData={c}
              index={i}
              onChange={(updated) => updateCase(i, updated)}
              onRemove={() => removeCase(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
