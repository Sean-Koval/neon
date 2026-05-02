'use client'

import { useRouter } from 'next/navigation'
import { SuiteEditor, type SuiteFormData } from '@/components/suite-editor'
import { formDataToCreatePayload } from '@/components/suite-editor/form-utils'
import { useToast } from '@/components/toast'

export default function NewSuitePage() {
  const router = useRouter()
  const { addToast } = useToast()

  const handleSubmit = async (data: SuiteFormData) => {
    const payload = formDataToCreatePayload(data)
    const response = await fetch('/api/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create suite')
    }

    const suite = await response.json()
    addToast('Suite created', 'success')
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
